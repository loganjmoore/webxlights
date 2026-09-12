<?php

namespace App\Services;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\RateLimiter;
use RuntimeException;

/** Public source adapters. Only server-selected IDs and allowlisted image hosts are fetched. */
class HouseSources
{
    private float $deadline;

    public function __construct() { $this->deadline = microtime(true) + 80; }

    private function remaining(): float
    {
        $seconds = $this->deadline - microtime(true);
        if ($seconds <= 0) throw new RuntimeException('House source lookup timed out.');
        return $seconds;
    }

    private function http(int $timeout = 12)
    {
        return Http::acceptJson()->withUserAgent('pixl-house-model/1.0 (https://pixl.community)')
            ->connectTimeout(min(5, $this->remaining()))->timeout(min($timeout, $this->remaining()))->withoutRedirecting();
    }

    public function search(string $address): array
    {
        $key = 'house-address:'.hash_hmac('sha256', mb_strtolower(trim($address)), config('app.key'));
        return Cache::remember($key, 600, function () use ($address) {
            if (!RateLimiter::attempt('house-address-service', 1, fn () => true, 1)) {
                abort(429, 'Address search is busy. Please try again in a moment.');
            }
            $data = $this->http()->get(config('services.house.geocoder_url'), ['q' => $address, 'limit' => 5])->throw()->json();
            $matches = [];
            foreach (array_slice($data['features'] ?? [], 0, 5) as $feature) {
                $p = $feature['properties'] ?? [];
                $c = $feature['geometry']['coordinates'] ?? [];
                // A street/city centroid is not a house location. Never turn it into a guessed property.
                if (empty($p['housenumber']) || count($c) !== 2 || !is_numeric($c[0]) || !is_numeric($c[1]) || abs($c[0]) > 180 || abs($c[1]) > 85) continue;
                $matches[] = [
                    'label' => implode(', ', array_filter([
                        trim(($p['housenumber'] ?? '').' '.($p['street'] ?? '')),
                        $p['city'] ?? $p['locality'] ?? '', $p['state'] ?? '', $p['postcode'] ?? '', $p['country'] ?? '',
                    ])),
                    'lat' => (float) $c[1], 'lng' => (float) $c[0],
                    'osmType' => $p['osm_type'] ?? '', 'osmId' => $p['osm_id'] ?? 0,
                    'name' => $p['name'] ?? '',
                ];
            }
            return $matches;
        });
    }

    public function building(array $place): array
    {
        $type = ['W' => 'way', 'N' => 'node', 'R' => 'relation'][$place['osmType']] ?? null;
        if (!$type || !is_numeric($place['osmId'])) return [];
        $id = (int) $place['osmId'];
        return Cache::remember("house-building:$type:$id", 86400, function () use ($type, $id) {
            // A selected OSM object, not a scan of the map or a public Overpass workload.
            $suffix = $type === 'way' ? '/full' : '';
            $data = $this->http()->get(rtrim(config('services.house.osm_url'), '/')."/$type/$id$suffix.json")->throw()->json();
            $elements = $data['elements'] ?? [];
            $subject = collect($elements)->first(fn ($e) => ($e['type'] ?? '') === $type && ($e['id'] ?? 0) === $id);
            if (!$subject) return [];
            $nodes = collect($elements)->where('type', 'node')->keyBy('id');
            $outline = [];
            if ($type === 'way' && isset($subject['tags']['building'])) {
                foreach (array_slice($subject['nodes'] ?? [], 0, 200) as $nodeId) {
                    if ($n = $nodes->get($nodeId)) $outline[] = [(float) $n['lon'], (float) $n['lat']];
                }
            }
            return ['tags' => $subject['tags'] ?? [], 'outline' => $outline, 'url' => "https://www.openstreetmap.org/$type/$id"];
        });
    }

    private function reserveStreetRequest(): void
    {
        // The public KartaView allowance is shared by every user on this server.
        if (!RateLimiter::attempt('house-street-service', 90, fn () => true, 3600)) {
            throw new RuntimeException('Street imagery allowance reached.');
        }
    }

    public function streetPhotos(array $place): array
    {
        $key = 'house-street:'.hash('sha256', $place['lat'].','.$place['lng']);
        $data = Cache::remember($key, 3600, function () use ($place) {
            $this->reserveStreetRequest();
            return $this->http(15)->get(config('services.house.imagery_url'), [
            'lat' => $place['lat'], 'lng' => $place['lng'], 'radius' => 100, 'zoomLevel' => 18,
            'join' => 'sequence', 'itemsPerPage' => 50, 'orderBy' => 'id', 'orderDirection' => 'desc',
        ])->throw()->json();
        });
        if (($data['status']['apiCode'] ?? null) === 601) return [];
        if (($data['status']['apiCode'] ?? null) !== 600) throw new RuntimeException('Street photos are temporarily unavailable.');
        $candidates = [];
        foreach ($data['result']['data'] ?? [] as $photo) {
            if (!is_numeric($photo['lat'] ?? null) || !is_numeric($photo['lng'] ?? null)) continue;
            $east = ($place['lng'] - $photo['lng']) * 111320 * cos(deg2rad($place['lat']));
            $north = ($place['lat'] - $photo['lat']) * 111320;
            $distance = hypot($east, $north);
            if ($distance < 3 || $distance > 100) continue;
            $bearing = fmod(rad2deg(atan2($east, $north)) + 360, 360);
            $heading = is_numeric($photo['heading'] ?? null) ? (float) $photo['heading'] : null;
            $fov = (float) ($photo['fieldOfView'] ?? $photo['sequence']['fieldOfView'] ?? 70);
            $angle = $heading === null ? 180 : abs(fmod($bearing - $heading + 540, 360) - 180);
            if ($fov < 300 && $angle > min($fov / 2, 55)) continue;
            $photo['_distance'] = $distance;
            $photo['_bearing'] = $bearing;
            $candidates[] = $photo;
        }
        usort($candidates, fn ($a, $b) => $a['_distance'] <=> $b['_distance']);
        $images = [];
        foreach (array_slice($candidates, 0, 3) as $photo) {
            if (empty($photo['fileurlProc']) && isset($photo['id'])) {
                $this->reserveStreetRequest();
                $photo = array_merge($photo, $this->http()->get(rtrim(config('services.house.imagery_url'), '/').'/'.(int) $photo['id'])->throw()->json('result.data') ?? []);
            }
            $url = $photo['fileurlProc'] ?? $photo['fileurlTh'] ?? null;
            if (!$url) continue;
            try {
                $image = $this->image($url);
                $image['credit'] = ['label' => 'KartaView, contributor '.($photo['sequence']['userId'] ?? 'unknown'), 'url' => 'https://api.openstreetcam.org/2.0/photo/'.(int) ($photo['id'] ?? 0), 'license' => 'CC BY-SA 4.0'];
                $image['context'] = 'Street camera '.json_encode(array_intersect_key($photo, array_flip(['lat', 'lng', 'heading', 'fieldOfView', 'projection', 'shotDate', '_distance', '_bearing'])));
                $images[] = $image;
            } catch (\Throwable) { /* Another public frame can still be usable. */ }
        }
        return $images;
    }

    /** Public landmarks sometimes have exact-building Commons photographs linked from OSM. */
    public function commonsPhotos(array $building): array
    {
        $id = $building['tags']['wikidata'] ?? '';
        if (!preg_match('/^Q[0-9]+$/', $id)) return [];
        $entity = Cache::remember("house-wikidata:$id", 86400, fn () => $this->http()->get("https://www.wikidata.org/wiki/Special:EntityData/$id.json")->throw()->json());
        $files = array_slice($entity['entities'][$id]['claims']['P18'] ?? [], 0, 2);
        $images = [];
        foreach ($files as $file) {
            $title = $file['mainsnak']['datavalue']['value'] ?? '';
            if (!is_string($title) || !$title) continue;
            $info = $this->http()->get('https://commons.wikimedia.org/w/api.php', [
                'action' => 'query', 'format' => 'json', 'prop' => 'imageinfo', 'iiprop' => 'url|extmetadata',
                'iiurlwidth' => 1600, 'titles' => 'File:'.$title,
            ])->throw()->json();
            $page = array_values($info['query']['pages'] ?? [])[0] ?? [];
            $image = $page['imageinfo'][0] ?? [];
            $meta = $image['extmetadata'] ?? [];
            $license = strip_tags($meta['LicenseShortName']['value'] ?? '');
            if (!preg_match('/^(CC BY(?:-SA)? [1-4]\.0|CC0|Public domain|Attribution)$/i', $license)) continue;
            try {
                $photo = $this->image($image['thumburl'] ?? $image['url'] ?? '');
                $photo['credit'] = ['label' => mb_substr(strip_tags($meta['Attribution']['value'] ?? $meta['Artist']['value'] ?? 'Wikimedia Commons contributor'), 0, 200), 'url' => $image['descriptionurl'], 'license' => $license];
                $photo['context'] = 'Wikimedia image linked to this exact building: '.$title.'. Description: '.mb_substr(strip_tags($meta['ImageDescription']['value'] ?? ''), 0, 1000).'. Image date: '.strip_tags($meta['DateTimeOriginal']['value'] ?? $meta['DateTime']['value'] ?? 'unknown');
                $images[] = $photo;
            } catch (\Throwable) { /* Keep any other usable licensed image. */ }
        }
        return $images;
    }

    public function image(string $url): array
    {
        $host = parse_url($url, PHP_URL_HOST) ?: '';
        if (parse_url($url, PHP_URL_SCHEME) !== 'https' || !(preg_match('/^storage[0-9]+\.openstreetcam\.org$/', $host) || in_array($host, ['upload.wikimedia.org', 'thumb.wikimedia.org'], true))) {
            throw new RuntimeException('Unsupported image host.');
        }
        $response = $this->http()->withOptions(['stream' => true, 'read_timeout' => min(5, $this->remaining())])->get($url)->throw();
        $stream = $response->toPsrResponse()->getBody();
        $bytes = '';
        try {
            while (!$stream->eof() && strlen($bytes) <= 5 * 1024 * 1024) {
                $this->remaining();
                $bytes .= $stream->read(65536);
            }
        } finally { $stream->close(); }
        return self::imageBytes($bytes);
    }

    public static function imageBytes(string $bytes): array
    {
        $size = @getimagesizefromstring($bytes);
        if (strlen($bytes) > 5 * 1024 * 1024 || !$size || max($size[0], $size[1]) > 8000 || !in_array($size['mime'], ['image/jpeg', 'image/png', 'image/webp'])) {
            abort(422, 'Use a JPEG, PNG, or WebP house photo under 5 MB and 8000 pixels per edge.');
        }
        return ['dataUrl' => 'data:'.$size['mime'].';base64,'.base64_encode($bytes)];
    }
}
