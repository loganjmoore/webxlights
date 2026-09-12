<?php

namespace App\Services;

use Illuminate\Validation\ValidationException;

/** One geometry boundary for generated drafts, user edits, and persisted house models. */
class HouseGeometry
{
    public static function validate(?array $input): ?array
    {
        $data = \Illuminate\Support\Facades\Validator::make(['houseModel' => $input], [
            'houseModel' => ['present', 'nullable', 'array:version,source,placement,surfaces', 'min:1'],
            'houseModel.version' => ['required_with:houseModel', 'integer', 'in:1'],
            'houseModel.source' => ['required_with:houseModel', 'array:label,notes,credits'],
            'houseModel.source.label' => ['required_with:houseModel', 'string', 'max:200'],
            'houseModel.source.credits' => ['sometimes', 'array', 'list', 'max:8'],
            'houseModel.source.credits.*' => ['array:label,url,license'],
            'houseModel.source.credits.*.label' => ['required', 'string', 'max:200'],
            'houseModel.source.credits.*.url' => ['required', 'url:https', 'max:500'],
            'houseModel.source.credits.*.license' => ['required', 'string', 'max:100'],
            'houseModel.source.notes' => ['sometimes', 'nullable', 'string', 'max:2000'],
            'houseModel.placement' => ['required_with:houseModel', 'array:position,rotationY,worldUnitsPerMeter'],
            'houseModel.placement.position' => ['required_with:houseModel', 'array', 'list', 'size:3'],
            'houseModel.placement.position.*' => ['required', 'numeric', 'between:-100000,100000'],
            'houseModel.placement.rotationY' => ['required_with:houseModel', 'numeric', 'between:-360,360'],
            'houseModel.placement.worldUnitsPerMeter' => ['required_with:houseModel', 'numeric', 'between:0.1,1000'],
            'houseModel.surfaces' => ['required_with:houseModel', 'array', 'list', 'min:1', 'max:256'],
            'houseModel.surfaces.*' => ['required', 'array:name,kind,estimated,vertices'],
            'houseModel.surfaces.*.name' => ['required', 'string', 'max:120'],
            'houseModel.surfaces.*.kind' => ['required', 'in:wall,roof,window,door,porch,exterior'],
            'houseModel.surfaces.*.estimated' => ['required', 'boolean'],
            'houseModel.surfaces.*.vertices' => ['required', 'array', 'list', 'min:3', 'max:96'],
            'houseModel.surfaces.*.vertices.*' => ['required', 'array', 'list', 'size:3'],
            'houseModel.surfaces.*.vertices.*.*' => ['required', 'numeric', 'between:-1000,1000'],
        ])->validate();
        $house = $data['houseModel'] ?? null;
        if ($house !== null) {
            $house['version'] = 1;
            $house['source']['notes'] = $house['source']['notes'] ?? '';
            $house['placement']['position'] = array_map('floatval', $house['placement']['position']);
            $house['placement']['rotationY'] = (float) $house['placement']['rotationY'];
            $house['placement']['worldUnitsPerMeter'] = (float) $house['placement']['worldUnitsPerMeter'];
            foreach ($house['surfaces'] as $index => &$surface) {
                $surface['estimated'] = (bool) $surface['estimated'];
                $surface['vertices'] = array_map(fn ($v) => array_map('floatval', $v), $surface['vertices']);
                $vertices = $surface['vertices'];
                $invalid = count($vertices) % 3 !== 0;
                for ($i = 0; !$invalid && $i < count($vertices); $i += 3) {
                    [$a, $b, $c] = array_slice($vertices, $i, 3);
                    $u = [$b[0]-$a[0], $b[1]-$a[1], $b[2]-$a[2]];
                    $v = [$c[0]-$a[0], $c[1]-$a[1], $c[2]-$a[2]];
                    $area = ($u[1]*$v[2]-$u[2]*$v[1])**2 + ($u[2]*$v[0]-$u[0]*$v[2])**2 + ($u[0]*$v[1]-$u[1]*$v[0])**2;
                    $invalid = !is_finite($area) || $area < 1e-12;
                }
                if ($invalid) {
                    throw ValidationException::withMessages(["houseModel.surfaces.$index.vertices" => 'Provide complete, non-zero-area triangles.']);
                }
            }
            unset($surface);
        }
        return $house;
    }
}
