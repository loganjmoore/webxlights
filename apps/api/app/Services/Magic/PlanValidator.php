<?php

namespace App\Services\Magic;

/**
 * Holds the AI director to the schema's meaning, not just its shape.
 *
 * Structured output guarantees the reply parses and has the right fields. It does not guarantee
 * an effect name exists, that a colour is a colour, or that a section index points at a section.
 * So every field is checked here and what fails is dropped, keeping the rest: the browser fills
 * any gap from its rules director, so a half-valid plan is still worth returning, and one bad
 * hex code does not throw away a good plan. Each drop is reported as a short string so the
 * client can log what the model got wrong.
 *
 * No framework in here on purpose; it takes plain arrays and the whitelist, so it is tested
 * without booting anything.
 */
class PlanValidator
{
    public const MOTIONS = ['left-to-right', 'right-to-left', 'centre-out', 'alternate', 'unison'];

    public const ACCENTS = ['none', 'downbeats', 'beats', 'hits'];

    public const ENDINGS = ['fade', 'hit-then-dark', 'hold'];

    private const MAX_PALETTES = 8;

    private const MAX_COLOURS = 6;

    private const MAX_NAME = 40;

    private const MAX_LOOK = 20;

    /**
     * Turns the shape the model fills into the ShowPlan shape.
     *
     * Palettes and families are records keyed by a name the model chooses, which strict
     * structured output cannot express, so they travel as lists of {name, colors} and
     * {role, effects}. Anything that is not the expected shape simply does not make it across;
     * validate() reports what is then missing.
     */
    public static function fromWire(array $wire): array
    {
        $plan = $wire;
        $plan['palettes'] = self::record($wire['palettes'] ?? null, 'name', 'colors');
        if (is_array($wire['sections'] ?? null)) {
            $plan['sections'] = array_map(
                fn ($section) => is_array($section) && array_key_exists('families', $section)
                    ? [...$section, 'families' => self::record($section['families'], 'role', 'effects')]
                    : $section,
                $wire['sections'],
            );
        }

        return $plan;
    }

    private static function record(mixed $list, string $keyField, string $valueField): array
    {
        $record = [];
        foreach (is_array($list) ? $list : [] as $entry) {
            if (is_array($entry) && is_string($entry[$keyField] ?? null) && ! array_key_exists($entry[$keyField], $record)) {
                $record[$entry[$keyField]] = $entry[$valueField] ?? null;
            }
        }

        return $record;
    }

    /**
     * @param  array  $plan  the ShowPlan as the model returned it (records, not lists)
     * @param  array<string, string[]>  $allowed  role => effect names, for the roles in the request only
     * @param  int  $sectionCount  how many sections the song has
     * @return array{plan: array, dropped: string[]}
     */
    public function validate(array $plan, array $allowed, int $sectionCount): array
    {
        $dropped = [];
        $out = [];

        if (is_int($plan['seed'] ?? null)) {
            $out['seed'] = $plan['seed'];
        } else {
            $dropped[] = 'seed: not an integer';
        }

        $palettes = $this->palettes($plan['palettes'] ?? null, $dropped);
        if ($palettes !== []) {
            $out['palettes'] = $palettes;
        } else {
            $dropped[] = 'palettes: none valid';
        }

        $sections = $this->sections($plan['sections'] ?? null, $palettes, $allowed, $sectionCount, $dropped);
        if ($sections !== []) {
            $out['sections'] = $sections;
        } else {
            $dropped[] = 'sections: none valid';
        }

        if (in_array($plan['ending'] ?? null, self::ENDINGS, true)) {
            $out['ending'] = $plan['ending'];
        } else {
            $dropped[] = 'ending: not one of '.implode('|', self::ENDINGS);
        }

        return ['plan' => $out, 'dropped' => $dropped];
    }

    private function palettes(mixed $palettes, array &$dropped): array
    {
        $kept = [];
        foreach (is_array($palettes) ? $palettes : [] as $name => $colours) {
            $name = (string) $name;
            if ($name === '' || mb_strlen($name) > self::MAX_NAME) {
                $dropped[] = 'palettes: bad name';
            } elseif (count($kept) >= self::MAX_PALETTES) {
                $dropped[] = "palettes.{$name}: more than ".self::MAX_PALETTES.' palettes';
            } else {
                $valid = [];
                foreach (is_array($colours) ? $colours : [] as $colour) {
                    if (is_string($colour) && preg_match('/^#[0-9a-fA-F]{6}$/', $colour)) {
                        $valid[] = strtolower($colour);
                    } else {
                        $dropped[] = "palettes.{$name}: bad colour";
                    }
                }
                if (count($valid) < 2) {
                    $dropped[] = "palettes.{$name}: fewer than 2 valid colours";
                } else {
                    $kept[$name] = array_slice($valid, 0, self::MAX_COLOURS);
                }
            }
        }

        return $kept;
    }

    private function sections(mixed $sections, array $palettes, array $allowed, int $sectionCount, array &$dropped): array
    {
        $kept = [];
        $seen = [];
        foreach (is_array($sections) ? array_values($sections) : [] as $at => $section) {
            $index = is_array($section) ? ($section['index'] ?? null) : null;
            if (! is_int($index) || $index < 0 || $index >= $sectionCount) {
                $dropped[] = "sections[{$at}]: index out of range";
            } elseif (isset($seen[$index])) {
                $dropped[] = "sections[{$at}]: duplicate index {$index}";
            } else {
                $seen[$index] = true;
                $kept[] = $this->section($index, $section, $palettes, $allowed, $dropped);
            }
        }

        return $kept;
    }

    private function section(int $index, array $section, array $palettes, array $allowed, array &$dropped): array
    {
        $at = "sections[{$index}]";
        $out = ['index' => $index];

        if (is_string($section['look'] ?? null) && mb_strlen($section['look']) <= self::MAX_LOOK) {
            $out['look'] = $section['look'];
        } else {
            $dropped[] = "{$at}.look: not a short string";
        }

        // Out of range is a model being enthusiastic, not wrong; a non-number is dropped.
        if (is_int($section['intensity'] ?? null) || is_float($section['intensity'] ?? null)) {
            $out['intensity'] = max(0.0, min(1.0, (float) $section['intensity']));
        } else {
            $dropped[] = "{$at}.intensity: not a number";
        }

        if (is_string($section['palette'] ?? null) && isset($palettes[$section['palette']])) {
            $out['palette'] = $section['palette'];
        } else {
            $dropped[] = "{$at}.palette: not one of the plan's palettes";
        }

        $featured = [];
        foreach (is_array($section['featured'] ?? null) ? $section['featured'] : [] as $role) {
            if (is_string($role) && isset($allowed[$role])) {
                $featured[$role] = true;
            } else {
                $dropped[] = "{$at}.featured: unknown role";
            }
        }
        if ($featured !== []) {
            $out['featured'] = array_keys($featured);
        }

        $families = [];
        foreach (is_array($section['families'] ?? null) ? $section['families'] : [] as $role => $effects) {
            if (! isset($allowed[$role])) {
                $dropped[] = "{$at}.families.{$role}: role not in the request";

                continue;
            }
            $keep = [];
            foreach (is_array($effects) ? $effects : [] as $effect) {
                if (is_string($effect) && in_array($effect, $allowed[$role], true)) {
                    $keep[$effect] = true;
                } else {
                    $dropped[] = "{$at}.families.{$role}: ".(is_string($effect) ? "{$effect} not allowed" : 'bad effect');
                }
            }
            if ($keep === []) {
                $dropped[] = "{$at}.families.{$role}: no allowed effects";
            } else {
                $families[$role] = array_keys($keep);
            }
        }
        if ($families !== []) {
            $out['families'] = $families;
        }

        foreach (['motion' => self::MOTIONS, 'accents' => self::ACCENTS] as $field => $values) {
            if (in_array($section[$field] ?? null, $values, true)) {
                $out[$field] = $section[$field];
            } else {
                $dropped[] = "{$at}.{$field}: not one of ".implode('|', $values);
            }
        }

        if (is_bool($section['wholeHouseHit'] ?? null)) {
            $out['wholeHouseHit'] = $section['wholeHouseHit'];
        } else {
            $dropped[] = "{$at}.wholeHouseHit: not a boolean";
        }

        return $out;
    }
}
