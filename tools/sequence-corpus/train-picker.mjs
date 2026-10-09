// Learns the effect picker from shared Magic Sequence edits (docs/MAGIC-SEQUENCE.md 6.3).
//
//   cd apps/api && php artisan magic:export-feedback ../../tools/sequence-corpus/.feedback.jsonl
//   node tools/sequence-corpus/train-picker.mjs tools/sequence-corpus/.feedback.jsonl
//
// Each shared edit says, per prop, how many seconds of each effect Magic placed and how many are
// there after the user's edits. Summed over every song for each role, the ratio of seconds wanted
// to seconds given is how much more (or less) of that effect people want on that kind of prop
// than the corpus-based picker gives them. Smoothed towards 1, clamped to 0.05..4, and only kept
// once enough songs have spoken. The rules director multiplies it into its effect weights.
//
// ponytail: one multiplier per role and effect. With enough data, condition on section label,
// energy and tempo too (the spec's gradient-boosted picker); the payload already carries them.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export function trainPicker(records, { minSongs = 5, smoothing = 30 } = {}) {
  const stats = {};
  records.forEach((record, song) => {
    for (const row of record.rows ?? []) {
      for (const name of new Set([...Object.keys(row.placed ?? {}), ...Object.keys(row.now ?? {})])) {
        const s = ((stats[row.role] ??= {})[name] ??= { given: 0, wanted: 0, songs: new Set() });
        s.given += row.placed?.[name] ?? 0;
        s.wanted += row.now?.[name] ?? 0;
        s.songs.add(song);
      }
    }
  });
  const multipliers = {};
  for (const [role, effects] of Object.entries(stats)) {
    for (const [name, s] of Object.entries(effects)) {
      if (s.songs.size < minSongs) continue;
      // Down to 0.05: the director squares its weights, and a corpus favourite (SingleStrand is 43%
      // of arch time) only gives way when people take it off nearly every time.
      const m = Math.round(Math.max(0.05, Math.min(4, (s.wanted + smoothing) / (s.given + smoothing))) * 100) / 100;
      if (Math.abs(m - 1) >= 0.05) (multipliers[role] ??= {})[name] = m;
    }
  }
  return { version: 1, trainedOn: records.length, multipliers };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [input, output = fileURLToPath(new URL("../../apps/web/src/lib/magic/picker.json", import.meta.url))] = process.argv.slice(2);
  if (!input) {
    console.error("usage: node train-picker.mjs feedback.jsonl [picker.json]");
    process.exit(1);
  }
  const records = readFileSync(input, "utf-8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
  const model = trainPicker(records);
  writeFileSync(output, `${JSON.stringify(model, null, 2)}\n`);
  console.log(`${records.length} shared edits -> ${Object.values(model.multipliers).reduce((n, e) => n + Object.keys(e).length, 0)} multipliers in ${output}`);
}
