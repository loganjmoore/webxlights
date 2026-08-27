#!/usr/bin/env node
// Fits the thresholds to the only human judgements this project has, instead of guessing them.
//
//   node tools/shader-check/calibrate.mjs [--write]
//
// A threshold picked by feel is untestable: when it later rejects something good, there is no
// way to tell whether the shader or the number was wrong. So every threshold here is fitted
// against `calibration.json` - the 26 round-4 shaders a human scored by eye - and reported with
// the two facts that decide whether it is any good:
//
//   keeps   how many human-scored-good shaders (>= 4) survive it. This must be ALL of them.
//           A threshold that rejects work a person would ship is a broken threshold, and the
//           brief is explicit about it: "a threshold that rejects something beautiful is wrong".
//   catches how many human-scored-bad shaders (<= 2) it rejects. Higher is better, but never
//           at the cost of `keeps`.
//
// The search is deliberately one-sided. Each metric is fitted on its own, at the strictest value
// that still keeps every good shader, with a small safety margin so that a shader marginally
// dimmer than the dimmest thing a person liked is not instantly disqualified. Metrics that
// separate nothing are reported as such and left at their brief-given defaults rather than being
// tuned into a number that only looks decisive.
//
// `--write` updates thresholds.json in place, preserving every `why` and `severity`.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { measureFiles } from "./metrics.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const calibration = JSON.parse(readFileSync(join(here, "calibration.json"), "utf8"));
const thresholds = JSON.parse(readFileSync(join(here, "thresholds.json"), "utf8"));

const GOOD = 4; // "a person would use it in a show without editing it"
const BAD = 2;  // "recognisable but wrong"
const MARGIN = 0.15; // 15% headroom below the worst good shader, so the fit is not knife-edge

// How loose to set a gate whose failure mode is real and documented but which no shader in this
// corpus exhibits. Four times the worst good value: still catches a gross failure, cannot reject
// work that merely resembles the good examples more than they resemble each other.
const UNVALIDATED_SLACK = 4;

// megatree and screen carry no human scores of their own, so they are gated by the 32x32 set:
// all three are 2D canvases, and a shader that reads on a 32x32 matrix reads on a megatree.
const SHAPES_2D = ["matrix-32x32", "megatree-16x50", "screen-192x108"];

/** Which metrics are fitted, in which shape group, and in which direction. */
const FITTED = [
  { key: "meanBrightness", group: "2d", dir: "min" },
  { key: "peakBrightness", group: "2d", dir: "min" },
  { key: "deadFrames", group: "2d", dir: "max" },
  { key: "chroma", group: "2d", dir: "min" },
  { key: "mudFraction", group: "2d", dir: "max" },
  { key: "motionEnergy", group: "2d", dir: "min" },
  { key: "slowMotionEnergy", group: "2d", dir: "min" },
  { key: "paletteFidelity", group: "2d", dir: "min" },
  { key: "contrast", group: "2d", dir: "min", role: "diagnostic" },
  { key: "flowCoherence", group: "2d", dir: "min", role: "diagnostic" },

  { key: "meanBrightness", group: "roofline", dir: "min" },
  { key: "peakBrightness", group: "roofline", dir: "min" },
  { key: "deadFrames", group: "roofline", dir: "max" },
  { key: "chroma", group: "roofline", dir: "min" },
  { key: "motionEnergy", group: "roofline", dir: "min" },
  { key: "slowMotionEnergy", group: "roofline", dir: "min" },
  { key: "paletteFidelity", group: "roofline", dir: "min" },
  { key: "aliasEnergy", group: "roofline", dir: "max" },
  { key: "rooflineLiveness", group: "roofline", dir: "min", role: "diagnostic" },
];
function fit({ key, group, dir, role = "gate" }, measured) {
  const rows = [];
  for (const [id, score] of Object.entries(calibration.scores)) {
    // A recorded score that the code itself contradicts cannot be used as ground truth. These
    // are listed with their proof in calibration.json rather than quietly edited, because the
    // point of the file is to be arguable.
    if (score.disputed) continue;
    const s = measured.shaders.find((x) => x.id === id);
    if (!s?.shapes) continue;

    // Gates are fitted per shape GROUP, against that group's own human labels, because the two
    // are genuinely different canvases and the corpus was scored separately at each. Fitting on
    // matrix-32x32 and enforcing everywhere flagged half the human-approved shaders; fitting
    // across all four at once collapsed the motion gates to zero, because a vertical effect that
    // is legitimately static on a one-pixel line dragged the cut down with it. Neither is a real
    // threshold. A roofline is judged by the roofline score, a 2D canvas by the 32x32 score.
    const shapes = group === "roofline" ? ["roofline-60x1"] : SHAPES_2D;
    const values = shapes
      .map((name) => s.shapes[name]?.[key])
      .filter((v) => typeof v === "number" && Number.isFinite(v));
    if (!values.length) continue;
    // Worst shape in the group: the one that would trip the gate first.
    const v = dir === "min" ? Math.min(...values) : Math.max(...values);
    const human = group === "roofline" ? score["roofline-60x1"] : score["matrix-32x32"];
    rows.push({ id, v, human });
  }
  const good = rows.filter((r) => r.human >= GOOD);
  const bad = rows.filter((r) => r.human <= BAD);
  if (!good.length) return { key, group, dir, skipped: "no good examples" };

  const worstGood = dir === "min"
    ? Math.min(...good.map((r) => r.v))
    : Math.max(...good.map((r) => r.v));
  const tight = dir === "min" ? worstGood * (1 - MARGIN) : worstGood * (1 + MARGIN) + 1e-6;
  const rejectsAt = (cut) => (v) => (dir === "min" ? v < cut : v > cut);
  const catchesAt = (cut) => bad.filter((r) => rejectsAt(cut)(r.v)).length;

  // A metric that catches nothing at its tightest keep-everything setting has no evidence behind
  // it in this corpus. Rather than ship a decisive-looking number fitted to noise, back it off to
  // UNVALIDATED_SLACK and say plainly that it is unvalidated.
  const separates = catchesAt(tight) > 0;
  const cut = separates ? tight : (dir === "min" ? worstGood / UNVALIDATED_SLACK : worstGood * UNVALIDATED_SLACK || 1e-6);
  const keeps = good.filter((r) => !rejectsAt(cut)(r.v)).length;
  const catches = catchesAt(cut);

  return {
    key, group, dir,
    role,
    cut: Number(cut.toPrecision(3)),
    worstGood: Number(worstGood.toPrecision(3)),
    keeps, good: good.length,
    catches, bad: bad.length,
    // A metric whose bad examples all sit on the good side separates nothing here. Saying so is
    // more useful than shipping a number that merely looks like a decision.
    separates: catches > 0,
    goodRange: [Number(Math.min(...good.map((r) => r.v)).toPrecision(3)), Number(Math.max(...good.map((r) => r.v)).toPrecision(3))],
    badRange: bad.length ? [Number(Math.min(...bad.map((r) => r.v)).toPrecision(3)), Number(Math.max(...bad.map((r) => r.v)).toPrecision(3))] : null,
  };
}

const files = Object.keys(calibration.scores).map((id) => join(here, "..", "..", calibration.shaderDir, `${id}.fs`));
console.log(`measuring ${files.length} human-scored shaders...\n`);
const measured = await measureFiles(files, { quiet: true });

const fits = FITTED.map((f) => fit(f, measured));
console.log("metric            group     fitted  worstGood  keeps   catches  good-range        bad-range");
for (const f of fits) {
  if (f.skipped) { console.log(`${f.key.padEnd(17)} ${f.group.padEnd(9)} skipped: ${f.skipped}`); continue; }
  console.log(
    `${f.key.padEnd(17)} ${f.group.padEnd(9)} ${String(f.cut).padStart(6)} ${String(f.worstGood).padStart(10)}  ` +
    `${f.keeps}/${f.good}   ${String(f.catches + "/" + f.bad).padStart(5)}    ` +
    `${JSON.stringify(f.goodRange).padEnd(17)} ${JSON.stringify(f.badRange)}` +
    `${f.role === "diagnostic" ? "   <- DIAGNOSTIC, not enforced" : f.separates ? "" : "   <- unvalidated, set loose"}`,
  );
}

if (process.argv.includes("--write")) {
  for (const f of fits) {
    if (f.skipped) continue;
    const bucket = f.group === "roofline"
      ? (thresholds.byShape["roofline-60x1"] ??= {})
      : thresholds.perShape;
    const entry = (bucket[f.key] ??= { severity: "soft", why: thresholds.perShape[f.key]?.why ?? "" });
    entry.role = f.role;
    if (f.role === "gate") entry[f.dir] = f.cut;
    entry.fitted = {
      keeps: `${f.keeps}/${f.good}`,
      catches: `${f.catches}/${f.bad}`,
      group: f.group,
      evidence: f.separates ? "separates good from bad in the calibration corpus" : "no bad example in the calibration corpus exhibits this failure - set loose, unvalidated",
    };
  }
  thresholds.calibratedOn = new Date().toISOString().slice(0, 10);
  writeFileSync(join(here, "thresholds.json"), JSON.stringify(thresholds, null, 2) + "\n");
  console.log("\nwrote thresholds.json");
} else {
  console.log("\n(dry run - pass --write to update thresholds.json)");
}
