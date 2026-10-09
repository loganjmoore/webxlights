<?php

namespace Tests\Feature;

use App\Services\Magic\PlanValidator;
use App\Services\Magic\RoleEffects;
use Tests\TestCase;

class PlanValidatorTest extends TestCase
{
    /** What the request allows: a tree and an arch, plus a moving head that takes no effects. */
    private const ALLOWED = [
        'mega_tree' => ['Spirals', 'On', 'Twinkle', 'Shockwave'],
        'arch' => ['SingleStrand', 'Color Wash'],
        'moving_head' => [],
    ];

    private function section(array $over = []): array
    {
        return [
            'index' => 0,
            'look' => 'A',
            'intensity' => 0.6,
            'palette' => 'ice',
            'featured' => ['mega_tree'],
            'families' => ['mega_tree' => ['Spirals', 'On'], 'arch' => ['SingleStrand']],
            'motion' => 'centre-out',
            'accents' => 'downbeats',
            'wholeHouseHit' => false,
            ...$over,
        ];
    }

    private function plan(array $over = []): array
    {
        return [
            'seed' => 42,
            'palettes' => ['ice' => ['#0099FF', '#ffffff']],
            'sections' => [$this->section(), $this->section(['index' => 1, 'look' => 'B'])],
            'ending' => 'fade',
            ...$over,
        ];
    }

    private function validate(array $plan, int $sections = 2): array
    {
        return (new PlanValidator)->validate($plan, self::ALLOWED, $sections);
    }

    public function test_a_good_plan_passes_untouched_apart_from_lowercased_colours(): void
    {
        $result = $this->validate($this->plan());

        $this->assertSame([], $result['dropped']);
        $this->assertSame(['ice' => ['#0099ff', '#ffffff']], $result['plan']['palettes']);
        $this->assertSame(42, $result['plan']['seed']);
        $this->assertSame('fade', $result['plan']['ending']);
        $this->assertSame($this->section(), $result['plan']['sections'][0] + ['intensity' => 0.6]);
        $this->assertCount(2, $result['plan']['sections']);
    }

    public function test_the_seed_must_be_an_integer(): void
    {
        foreach (['7', 7.5, null, [1]] as $seed) {
            $result = $this->validate($this->plan(['seed' => $seed]));
            $this->assertArrayNotHasKey('seed', $result['plan']);
            $this->assertContains('seed: not an integer', $result['dropped']);
        }
    }

    public function test_palettes_keep_valid_colours_and_drop_what_cannot_be_used(): void
    {
        $result = $this->validate($this->plan(['palettes' => [
            'mixed' => ['#FF0000', 'red', '#12345', '#00ff00', '#GGGGGG', '#0000FF'],
            'one' => ['#ffffff'],
            'junk' => 'not a list',
            str_repeat('n', 41) => ['#ffffff', '#000000'],
            '' => ['#ffffff', '#000000'],
        ], 'sections' => []]));

        $this->assertSame(['mixed' => ['#ff0000', '#00ff00', '#0000ff']], $result['plan']['palettes']);
        $this->assertContains('palettes.one: fewer than 2 valid colours', $result['dropped']);
        $this->assertContains('palettes.junk: fewer than 2 valid colours', $result['dropped']);
        $this->assertContains('palettes.mixed: bad colour', $result['dropped']);
        $this->assertContains('palettes: bad name', $result['dropped']);
    }

    public function test_at_most_eight_palettes_and_six_colours_each(): void
    {
        $palettes = [];
        foreach (range(1, 10) as $i) {
            $palettes["p{$i}"] = array_map(fn ($c) => sprintf('#%06x', $c * 1000), range(1, 9));
        }

        $result = $this->validate($this->plan(['palettes' => $palettes, 'sections' => []]));

        $this->assertCount(8, $result['plan']['palettes']);
        $this->assertCount(6, $result['plan']['palettes']['p1']);
        $this->assertContains('palettes.p9: more than 8 palettes', $result['dropped']);
    }

    public function test_a_section_is_dropped_when_its_index_is_out_of_range_or_repeated(): void
    {
        $result = $this->validate($this->plan(['sections' => [
            $this->section(['index' => 0]),
            $this->section(['index' => 0, 'look' => 'dup']),
            $this->section(['index' => 2]),
            $this->section(['index' => -1]),
            $this->section(['index' => '1']),
            $this->section(['index' => 1]),
            'junk',
        ]]));

        $this->assertSame([0, 1], array_column($result['plan']['sections'], 'index'));
        // The first of a repeated index wins; the later one is the one dropped.
        $this->assertSame('A', $result['plan']['sections'][0]['look']);
        $this->assertContains('sections[1]: duplicate index 0', $result['dropped']);
        $this->assertContains('sections[2]: index out of range', $result['dropped']);
        $this->assertContains('sections[6]: index out of range', $result['dropped']);
    }

    public function test_intensity_is_clamped_and_a_non_number_is_dropped(): void
    {
        $result = $this->validate($this->plan(['sections' => [
            $this->section(['index' => 0, 'intensity' => 1.7]),
            $this->section(['index' => 1, 'intensity' => '0.5']),
        ]]));

        $this->assertSame(1.0, $result['plan']['sections'][0]['intensity']);
        $this->assertArrayNotHasKey('intensity', $result['plan']['sections'][1]);
        $this->assertContains('sections[1].intensity: not a number', $result['dropped']);

        $low = $this->validate($this->plan(['sections' => [$this->section(['intensity' => -3])]]));
        $this->assertSame(0.0, $low['plan']['sections'][0]['intensity']);
    }

    public function test_a_palette_must_name_a_kept_palette(): void
    {
        $result = $this->validate($this->plan([
            'palettes' => ['ice' => ['#0099ff', '#ffffff'], 'thin' => ['#ffffff']],
            'sections' => [$this->section(['palette' => 'thin']), $this->section(['index' => 1, 'palette' => 'ghost'])],
        ]));

        $this->assertArrayNotHasKey('palette', $result['plan']['sections'][0]);
        $this->assertArrayNotHasKey('palette', $result['plan']['sections'][1]);
    }

    public function test_roles_outside_the_request_are_dropped_from_featured_and_families(): void
    {
        // snowflake exists in the whitelist file but was not in this request; "bogus" is nowhere.
        $this->assertArrayHasKey('snowflake', RoleEffects::table());
        $result = $this->validate($this->plan(['sections' => [$this->section([
            'featured' => ['mega_tree', 'snowflake', 'bogus', 'mega_tree', 'moving_head', 7],
            'families' => ['snowflake' => ['On'], 'bogus' => ['On'], 'mega_tree' => ['On']],
        ])]]));

        $section = $result['plan']['sections'][0];
        // A moving head is in the request, so it may be featured even though it takes no effects.
        $this->assertSame(['mega_tree', 'moving_head'], $section['featured']);
        $this->assertSame(['mega_tree' => ['On']], $section['families']);
        $this->assertContains('sections[0].families.snowflake: role not in the request', $result['dropped']);
        $this->assertContains('sections[0].featured: unknown role', $result['dropped']);
    }

    public function test_effects_outside_a_roles_whitelist_are_dropped_and_empty_families_vanish(): void
    {
        $result = $this->validate($this->plan(['sections' => [$this->section([
            // Fire is a real effect, but not one the corpus uses on an arch; Twinkle is allowed on a
            // tree but not on an arch; effects are matched exactly.
            'families' => [
                'arch' => ['Fire', 'Twinkle', 'singlestrand'],
                'mega_tree' => ['Twinkle', 'Fire', 'Spirals', 'Twinkle', 5],
                'moving_head' => ['On'],
            ],
        ])]]));

        $this->assertSame(['mega_tree' => ['Twinkle', 'Spirals']], $result['plan']['sections'][0]['families']);
        $this->assertContains('sections[0].families.arch: Fire not allowed', $result['dropped']);
        $this->assertContains('sections[0].families.arch: no allowed effects', $result['dropped']);
        $this->assertContains('sections[0].families.moving_head: no allowed effects', $result['dropped']);
        $this->assertContains('sections[0].families.mega_tree: bad effect', $result['dropped']);
    }

    public function test_enums_booleans_and_look_are_checked(): void
    {
        $result = $this->validate($this->plan([
            'ending' => 'explode',
            'sections' => [$this->section([
                'motion' => 'sideways', 'accents' => 'sometimes', 'wholeHouseHit' => 'yes', 'look' => str_repeat('x', 21),
            ])],
        ]));

        $section = $result['plan']['sections'][0];
        foreach (['motion', 'accents', 'wholeHouseHit', 'look'] as $field) {
            $this->assertArrayNotHasKey($field, $section);
        }
        $this->assertArrayNotHasKey('ending', $result['plan']);
        $this->assertContains('sections[0].motion: not one of left-to-right|right-to-left|centre-out|alternate|unison', $result['dropped']);
        $this->assertContains('ending: not one of fade|hit-then-dark|hold', $result['dropped']);
    }

    public function test_an_empty_look_is_valid(): void
    {
        $result = $this->validate($this->plan(['sections' => [$this->section(['look' => ''])]]));

        $this->assertSame('', $result['plan']['sections'][0]['look']);
    }

    public function test_garbage_yields_an_empty_plan_not_an_error(): void
    {
        $result = $this->validate(['palettes' => 'x', 'sections' => 3]);

        $this->assertSame([], $result['plan']);
        $this->assertContains('palettes: none valid', $result['dropped']);
        $this->assertContains('sections: none valid', $result['dropped']);
    }

    public function test_from_wire_turns_palette_and_family_lists_into_records(): void
    {
        $plan = PlanValidator::fromWire([
            'seed' => 1,
            'palettes' => [['name' => 'ice', 'colors' => ['#0099ff', '#ffffff']], ['name' => 'ice', 'colors' => ['#000000']], 'junk', ['colors' => []]],
            'sections' => [
                ['index' => 0, 'families' => [['role' => 'arch', 'effects' => ['On']], ['role' => 'mega_tree', 'effects' => ['Spirals']]]],
                'junk',
            ],
            'ending' => 'hold',
        ]);

        // The first of a repeated name wins.
        $this->assertSame(['ice' => ['#0099ff', '#ffffff']], $plan['palettes']);
        $this->assertSame(['arch' => ['On'], 'mega_tree' => ['Spirals']], $plan['sections'][0]['families']);
        $this->assertSame('junk', $plan['sections'][1]);
    }

    public function test_from_wire_tolerates_the_wrong_shapes(): void
    {
        $plan = PlanValidator::fromWire(['palettes' => 'ice', 'sections' => [['index' => 0, 'families' => 'On']]]);

        $this->assertSame([], $plan['palettes']);
        $this->assertSame([], $plan['sections'][0]['families']);
    }
}
