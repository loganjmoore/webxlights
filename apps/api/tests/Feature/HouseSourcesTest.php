<?php
namespace Tests\Feature;

use App\Services\HouseSources;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class HouseSourcesTest extends TestCase
{
    public function test_geocoder_does_not_treat_a_city_centroid_as_a_house(): void
    {
        Http::fake(['*' => Http::response(['features' => [['properties' => ['city' => 'Chicago'], 'geometry' => ['coordinates' => [-87,41]]]]])]);
        $this->assertSame([], (new HouseSources())->search('Somewhere Chicago'));
    }

    public function test_unknown_image_hosts_are_rejected_before_a_network_request(): void
    {
        Http::fake();
        foreach (['https://127.0.0.1/photo.jpg', 'https://upload.wikimedia.org.evil.test/a', 'http://upload.wikimedia.org/a'] as $url) {
            try { (new HouseSources())->image($url); $this->fail('Host allowed'); }
            catch (\RuntimeException $e) { $this->assertSame('Unsupported image host.', $e->getMessage()); }
        }
        Http::assertNothingSent();
    }

    public function test_street_camera_looking_away_is_not_used(): void
    {
        Http::fake(['*' => Http::response(['status' => ['apiCode' => 600], 'result' => ['data' => [['id' => 1, 'lat' => 41, 'lng' => -87, 'heading' => 180, 'fieldOfView' => 70, 'fileurlProc' => 'https://storage1.openstreetcam.org/test.jpg']]]])]);
        $this->assertSame([], (new HouseSources())->streetPhotos(['lat' => 41.0002, 'lng' => -87]));
        Http::assertSentCount(1);
    }

    public function test_expired_source_budget_stops_before_another_network_request(): void
    {
        Http::fake();
        $sources = new HouseSources();
        $deadline = new \ReflectionProperty(HouseSources::class, 'deadline');
        $deadline->setValue($sources, microtime(true) - 1);
        try { $sources->image('https://upload.wikimedia.org/photo.jpg'); $this->fail('Expired budget accepted'); }
        catch (\RuntimeException $e) { $this->assertSame('House source lookup timed out.', $e->getMessage()); }
        Http::assertNothingSent();
    }

    public function test_non_derivative_licenses_are_not_downloaded(): void
    {
        Http::fake([
            'www.wikidata.org/*' => Http::response(['entities' => ['Q1' => ['claims' => ['P18' => [['mainsnak' => ['datavalue' => ['value' => 'House.jpg']]]]]]]]),
            'commons.wikimedia.org/*' => Http::response(['query' => ['pages' => [['imageinfo' => [['url' => 'https://upload.wikimedia.org/house.jpg', 'extmetadata' => ['LicenseShortName' => ['value' => 'CC BY-ND 4.0']]]]]]]]),
        ]);
        $this->assertSame([], (new HouseSources())->commonsPhotos(['tags' => ['wikidata' => 'Q1']]));
        Http::assertSentCount(2);
    }
}
