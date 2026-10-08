#!/usr/bin/env node
// Mines a folder of real xLights sequences for the statistics the Magic Sequence planner uses.
// The corpus itself is never committed (authors' work, shared for personal use); only the
// aggregate priors this writes are.
//
//   node tools/sequence-corpus/analyze.mjs <corpusDir> [outDir]
//
// corpusDir holds one folder per sequence: <id>/*.xsq[.gz] plus, when the author shipped it,
// their xlights_rgbeffects.xml[.gz] so element names resolve to model types.
import { XMLParser } from "fast-xml-parser";
import { gunzipSync } from "node:zlib";
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { roleOf, ROLES } from "./roles.mjs";

const [corpusDir, outDir = "tools/sequence-corpus"] = process.argv.slice(2);
if (!corpusDir) {
  console.error("usage: analyze.mjs <corpusDir> [outDir]");
  process.exit(1);
}

const xml = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: false,
  isArray: (name) => ["Effect", "Element", "EffectLayer", "ColorPalette", "model", "modelGroup", "SubModelEffectLayer", "Strand", "subModel"].includes(name),
});

const read = (p) => {
  const b = readFileSync(p);
  return (p.endsWith(".gz") ? gunzipSync(b) : b).toString("utf8");
};
const arr = (x) => (x == null ? [] : Array.isArray(x) ? x : [x]);
const text = (x) => (typeof x === "string" ? x : (x?.["#text"] ?? ""));

// "A=1,B=x,C=Active=TRUE|Id=..|" -> {A:"1",B:"x",C:"Active=TRUE|Id=..|"}. Values never contain ",X_" so split there.
function parseSettings(s) {
  const out = {};
  if (!s) return out;
  for (const part of s.split(/,(?=[A-Z]{1,2}_[A-Za-z0-9]+[_=])/)) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i)] = part.slice(i + 1);
  }
  return out;
}

function loadLayout(files, dir) {
  const f = files.find((n) => /rgbeffects\.xml(\.gz)?$/i.test(n));
  const models = new Map();
  const groups = new Map();
  if (!f) return { models, groups };
  try {
    const doc = xml.parse(read(join(dir, f)));
    const root = doc.xrgb ?? doc;
    for (const m of arr(root.models?.model)) {
      models.set(m.name, { displayAs: m.DisplayAs, parm1: +m.parm1 || 0, parm2: +m.parm2 || 0, subModels: arr(m.subModel).map((s) => s.name) });
    }
    for (const g of arr(root.modelGroups?.modelGroup)) {
      groups.set(g.name, String(g.models ?? "").split(",").filter(Boolean));
    }
  } catch (e) {
    console.warn(`layout parse failed ${dir}: ${e.message}`);
  }
  return { models, groups };
}

// Element -> {kind: model|group|unknown, displayAs, role, size}
function describe(name, layout) {
  const m = layout.models.get(name);
  if (m) return { kind: "model", displayAs: m.displayAs, role: roleOf(name, m.displayAs), nodesHint: m.parm1 * m.parm2 };
  const g = layout.groups.get(name);
  if (g) {
    const counts = {};
    for (const member of g) {
      const mm = layout.models.get(member.split("/")[0]);
      const r = mm ? roleOf(member, mm.displayAs) : roleOf(member, "");
      counts[r] = (counts[r] ?? 0) + 1;
    }
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    const own = roleOf(name, "");
    // Name wins when it is specific ("All Arches"); otherwise the members decide; mixed groups are "whole_house".
    const role = own !== "other" ? own : top && top[1] / g.length >= 0.6 ? top[0] : "whole_house";
    return { kind: "group", displayAs: "ModelGroup", role, members: g.length };
  }
  return { kind: "unknown", displayAs: "", role: roleOf(name, "") };
}

const inc = (o, k, n = 1) => (o[k] = (o[k] ?? 0) + n);
const inc2 = (o, a, b, n = 1) => inc((o[a] ??= {}), b, n);
const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};
const pct = (xs, ps = [10, 25, 50, 75, 90]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return Object.fromEntries(ps.map((p) => [`p${p}`, Math.round(s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] * 1000) / 1000]));
};
const nearest = (sorted, t) => {
  let lo = 0, hi = sorted.length - 1;
  if (hi < 0) return Infinity;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] < t) lo = mid + 1;
    else hi = mid;
  }
  return Math.min(Math.abs(sorted[lo] - t), lo > 0 ? Math.abs(sorted[lo - 1] - t) : Infinity);
};

const A = {
  sequences: 0, skipped: [], withLayout: 0, frameMs: {}, versions: {}, durationsS: [], elementsPerSeq: [], effectsPerSeq: [],
  effectCount: {}, effectSeconds: {}, effectByRole: {}, effectSecondsByRole: {}, roleCount: {}, roleSeconds: {},
  targetKind: {}, durMsByEffect: {}, durBeatsByEffect: {}, layerByEffect: {}, layersPerElement: {}, layerMethod: {},
  inTransition: {}, outTransition: {}, fades: { fadeIn: 0, fadeOut: 0, total: 0 }, bufferStyleByRole: {}, bufferStyleByEffect: {},
  valueCurveByEffect: {}, valueCurveKeys: {}, paletteSize: [], colors: {}, paletteSizeByEffect: {}, settingsByEffect: {},
  timingTrackNames: {}, bpm: [], startAlignAny: { n: 0, hit: 0 }, startAlignBeat: { n: 0, hit: 0, half: 0, bar: 0 },
  nextEffect: {}, coverageByRole: {}, activityShape: [], onsetCorrelation: [], bigHits: { perMinute: [], effects: {} },
  concurrentEffectTypes: [], sameEffectAcrossElements: [], songRoleSeconds: [], perSeq: [], cyclesPerBeat: {}, colorsPerSeq: [], repeatRuns: [], layersByRole: {}, signatureShare: [], effectsFor90: [], beatAlignPerSeq: [], duplicates: 0, overCap: 0, effectCountW: {}, effectSecondsW: {}, effectByRoleW: {}, effectSecondsByRoleW: {}, roleSeqs: {}, effectByIntensityW: {}, roleEffectByIntensityW: {}, intensitySongs: 0, phraseSwing: [], activityByIntensity: {}, effectByIntensity: {}, roleEffectByIntensity: {}, durBeatsByIntensity: {},
};

const dirs = readdirSync(corpusDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
// One author's whole show folder can hold dozens of songs plus xLights' own backups; left alone it
// would outvote everyone else. So: drop auto-backups, drop exact duplicates, and take at most
// PER_PACKAGE sequences (largest first) from any one download.
const PER_PACKAGE = 3;
const PRIVATE_KEY = /FILEPICKER|FONTPICKER|TimingTrack|LyricTrack|Definition|SketchDef|_Settings$|TEXTCTRL_Text|TEXTCTRL_Duration|TEXTCTRL\d|Filter$/i;
const BACKUP = /\d{4}-\d{2}-\d{2}-\d{6}_|backup|\.xbkp|autosave/i;
const seenHashes = new Set();
for (const id of dirs) {
  const dir = join(corpusDir, id);
  const files = readdirSync(dir);
  const layout = loadLayout(files, dir);
  const candidates = files
    .filter((n) => /\.xsq(\.gz)?$/i.test(n) && !BACKUP.test(n))
    .map((n) => ({ n, text: read(join(dir, n)) }))
    .sort((a, b) => b.text.length - a.text.length);
  let taken = 0;
  for (const { n: xf, text: body } of candidates) {
    const hash = createHash("sha1").update(body).digest("hex");
    if (seenHashes.has(hash)) {
      A.duplicates++;
      continue;
    }
    seenHashes.add(hash);
    if (taken >= PER_PACKAGE) {
      A.overCap++;
      continue;
    }
    let doc;
    try {
      doc = xml.parse(body);
    } catch (e) {
      A.skipped.push(`${id}/${xf}: ${e.message}`);
      continue;
    }
    if (analyzeSequence(`${id}/${xf}`, doc.xsequence, layout)) taken++;
  }
}

function analyzeSequence(key, seq, layout) {
  if (!seq?.ElementEffects) {
    A.skipped.push(`${key}: no ElementEffects`);
    return false;
  }
  const head = seq.head ?? {};
  const frameMs = parseInt(text(head.sequenceTiming)) || 50;
  const durMs = Math.round(parseFloat(text(head.sequenceDuration)) * 1000) || 0;
  if (!durMs) {
    A.skipped.push(`${key}: no duration`);
    return false;
  }
  const db = arr(seq.EffectDB?.Effect).map((e) => parseSettings(text(e)));
  const palettes = arr(seq.ColorPalettes?.ColorPalette).map((p) => parseSettings(text(p)));
  const tol = Math.max(frameMs, 25) + 1;

  // Timing tracks
  const timing = {};
  let effectsTotal = 0;
  const instances = [];
  const elements = arr(seq.ElementEffects.Element);
  for (const el of elements) {
    if (el.type === "timing") {
      const layer = arr(el.EffectLayer)[0];
      const marks = arr(layer?.Effect).map((e) => +e.startTime).filter(Number.isFinite).sort((a, b) => a - b);
      timing[el.name] = marks;
      inc(A.timingTrackNames, normTiming(el.name));
    }
  }
  const allMarks = [...new Set(Object.values(timing).flat())].sort((a, b) => a - b);
  const beatName = Object.keys(timing).find((n) => /beat/i.test(n) && !/bar/i.test(n) && timing[n].length > 20);
  const barName = Object.keys(timing).find((n) => /bar/i.test(n) && timing[n].length > 8);
  const onsetName = Object.keys(timing).find((n) => /onset/i.test(n) && timing[n].length > 20);
  const beats = beatName ? timing[beatName] : null;
  let beatMs = null;
  if (beats) {
    beatMs = median(beats.slice(1).map((t, i) => t - beats[i]).filter((d) => d > 150 && d < 2000));
    if (beatMs) A.bpm.push(Math.round(60000 / beatMs));
  }

  const elementsUsed = new Set();
  for (const el of elements) {
    if (el.type !== "model") continue;
    const d = describe(el.name, layout);
    const layers = [
      ...arr(el.EffectLayer).map((l, i) => ({ l, i, sub: null })),
      ...arr(el.SubModelEffectLayer).flatMap((s) => arr(s.EffectLayer ?? s).map((l, i) => ({ l: s.EffectLayer ? l : s, i, sub: s.name }))),
      ...arr(el.Strand).flatMap((s) => arr(s.EffectLayer ?? s).map((l, i) => ({ l: s.EffectLayer ? l : s, i, sub: `strand${s.index}` }))),
    ];
    let usedLayers = 0;
    for (const { l, i, sub } of layers) {
      const effs = arr(l.Effect).filter((e) => e.name);
      if (!effs.length) continue;
      usedLayers++;
      effs.sort((a, b) => +a.startTime - +b.startTime);
      let prev = null;
      let runKey = null, run = 0;
      for (const e of effs) {
        const start = +e.startTime, end = +e.endTime;
        if (!(end > start)) continue;
        const s = e.ref != null ? db[+e.ref] ?? {} : parseSettings(text(e));
        const pal = e.palette != null ? palettes[+e.palette] ?? {} : {};
        const role = sub ? `${d.role}:sub` : d.role;
        instances.push({ el: el.name, role: d.role, sub, kind: sub ? "submodel" : d.kind, layer: i, name: e.name, start, end, s, pal });
        if (prev) inc2(A.nextEffect, prev, e.name);
        const k = `${e.name}|${e.palette ?? ""}|${e.ref ?? ""}`;
        if (k === runKey) run++;
        else {
          if (run) A.repeatRuns.push(run);
          runKey = k;
          run = 1;
        }
        prev = e.name;
        effectsTotal++;
        elementsUsed.add(el.name + (sub ?? ""));
        void role;
      }
      if (run) A.repeatRuns.push(run);
    }
    if (usedLayers) {
      inc(A.layersPerElement, Math.min(usedLayers, 6));
      (A.layersByRole[d.role] ??= []).push(usedLayers);
    }
  }
  if (!instances.length) {
    A.skipped.push(`${key}: no effects`);
    return false;
  }

  A.sequences++;
  if (layout.models.size) A.withLayout++;
  inc(A.frameMs, frameMs);
  inc(A.versions, String(text(head.version)).split(".")[0]);
  A.durationsS.push(durMs / 1000);
  A.elementsPerSeq.push(elementsUsed.size);
  A.effectsPerSeq.push(effectsTotal);

  const secs = Math.ceil(durMs / 1000);
  const activeByS = new Array(secs).fill(0).map(() => new Set());
  const startsByS = new Array(secs).fill(0);
  const typesByS = new Array(secs).fill(0).map(() => new Set());
  const startsAt = new Map();
  const coverage = {};
  const seqColors = new Set();
  const seqBeat = { n: 0, hit: 0 };
  const seqEffects = {};
  const seqEffSec = {};
  const seqRoleCnt = {};
  const seqRoleSec = {};

  for (const x of instances) {
    const dur = x.end - x.start;
    const sec = dur / 1000;
    inc(A.effectCount, x.name);
    inc(seqEffects, x.name);
    inc(seqEffSec, x.name, sec);
    inc2(seqRoleCnt, x.role, x.name);
    inc2(seqRoleSec, x.role, x.name, sec);
    inc(A.effectSeconds, x.name, sec);
    inc2(A.effectByRole, x.role, x.name);
    inc2(A.effectSecondsByRole, x.role, x.name, sec);
    inc(A.roleCount, x.role);
    inc(A.roleSeconds, x.role, sec);
    inc(A.targetKind, x.kind);
    (A.durMsByEffect[x.name] ??= []).push(dur);
    if (beatMs) (A.durBeatsByEffect[x.name] ??= []).push(dur / beatMs);
    inc2(A.layerByEffect, x.name, Math.min(x.layer, 4));
    inc(A.layerMethod, x.s.T_CHOICE_LayerMethod ?? "Normal");
    // A transition type is stored even when its time is 0; only count the ones that play.
    if (parseFloat(x.s.T_TEXTCTRL_Fadein) > 0) inc(A.inTransition, x.s.T_CHOICE_In_Transition_Type ?? "Fade");
    if (parseFloat(x.s.T_TEXTCTRL_Fadeout) > 0) inc(A.outTransition, x.s.T_CHOICE_Out_Transition_Type ?? "Fade");
    A.fades.total++;
    if (parseFloat(x.s.T_TEXTCTRL_Fadein) > 0) A.fades.fadeIn++;
    if (parseFloat(x.s.T_TEXTCTRL_Fadeout) > 0) A.fades.fadeOut++;
    inc2(A.bufferStyleByRole, x.role, x.s.B_CHOICE_BufferStyle ?? "Default");
    inc2(A.bufferStyleByEffect, x.name, x.s.B_CHOICE_BufferStyle ?? "Default");
    const vcKeys = Object.keys(x.s).filter((k) => k.includes("VALUECURVE") && /Active=TRUE/.test(x.s[k]));
    inc2(A.valueCurveByEffect, x.name, vcKeys.length ? "yes" : "no");
    for (const k of vcKeys) inc(A.valueCurveKeys, `${x.name}:${k.replace(/^E_VALUECURVE_/, "")}`);
    // palette: checked colours only
    const active = [];
    for (let n = 1; n <= 8; n++) if (x.pal[`C_CHECKBOX_Palette${n}`] === "1" && x.pal[`C_BUTTON_Palette${n}`]) active.push(x.pal[`C_BUTTON_Palette${n}`]);
    if (active.length) {
      A.paletteSize.push(active.length);
      (A.paletteSizeByEffect[x.name] ??= []).push(active.length);
      for (const c of active) {
        inc(A.colors, c.startsWith("#") ? c.toUpperCase() : "curve");
        seqColors.add(c.toUpperCase());
      }
    }
    // settings: tally per-key values (numbers kept raw for percentiles)
    const sb = (A.settingsByEffect[x.name] ??= { n: 0, keys: {} });
    sb.n++;
    for (const [k, v] of Object.entries(x.s)) {
      // Only option choices and numbers go into the priors. File paths, fonts, free text and
      // timing-track or face names are personal or copyrighted (lyrics) and never leave the corpus.
      if (!k.startsWith("E_") || k.includes("VALUECURVE") || PRIVATE_KEY.test(k)) continue;
      const slot = (sb.keys[k] ??= { num: [], cat: {} });
      const f = Number(v);
      if (v !== "" && Number.isFinite(f) && !k.startsWith("E_CHOICE")) slot.num.push(f);
      else if (/^E_(CHOICE|CHECKBOX|NOTEBOOK)_/.test(k)) inc(slot.cat, v.slice(0, 40));
    }
    // Tempo coupling: how many cycles/rotations an author gives an effect per beat of music.
    if (beatMs) {
      for (const [k, v] of Object.entries(x.s)) {
        if (!/^E_(TEXTCTRL|SLIDER)_.*(Cycles|Rotations|Movement|Rotation)$/.test(k)) continue;
        const f = Number(v);
        if (Number.isFinite(f) && f > 0) ((A.cyclesPerBeat[x.name] ??= {})[k] ??= []).push(f / (dur / beatMs));
      }
      (A.durBeatsBySeqBpm ??= []).push([Math.round(60000 / beatMs), dur / beatMs]);
    }
    // alignment (skip starts at 0: they align with everything)
    if (x.start > 0 && allMarks.length) {
      A.startAlignAny.n++;
      if (nearest(allMarks, x.start) <= tol) A.startAlignAny.hit++;
    }
    if (x.start > 0 && beats && beatMs) {
      seqBeat.n++;
      if (nearest(beats, x.start) <= tol) seqBeat.hit++;
      A.startAlignBeat.n++;
      if (nearest(beats, x.start) <= tol) A.startAlignBeat.hit++;
      else if (nearest(beats, x.start - beatMs / 2) <= tol || nearest(beats, x.start + beatMs / 2) <= tol) A.startAlignBeat.half++;
      if (barName && nearest(timing[barName], x.start) <= tol) A.startAlignBeat.bar++;
    }
    // activity per second
    for (let t = Math.max(0, Math.floor(x.start / 1000)); t < Math.min(secs, Math.ceil(x.end / 1000)); t++) {
      activeByS[t].add(x.el + (x.sub ?? ""));
      typesByS[t].add(x.name);
    }
    const s0 = Math.floor(x.start / 1000);
    if (s0 >= 0 && s0 < secs) startsByS[s0]++;
    const q = Math.round(x.start / tol);
    if (!startsAt.has(q)) startsAt.set(q, []);
    startsAt.get(q).push(x);
    const cv = (coverage[x.role] ??= new Map());
    cv.set(x.el, (cv.get(x.el) ?? 0) + dur);
  }

  for (const [role, m] of Object.entries(coverage)) {
    for (const ms of m.values()) (A.coverageByRole[role] ??= []).push(Math.min(1, ms / durMs));
  }

  // Activity shape over normalized song time (10 buckets), as fraction of used elements active.
  const n = elementsUsed.size || 1;
  const shape = new Array(10).fill(0).map(() => []);
  activeByS.forEach((set, t) => shape[Math.min(9, Math.floor((t / secs) * 10))].push(set.size / n));
  A.activityShape.push(shape.map((b) => (b.length ? b.reduce((a, c) => a + c, 0) / b.length : 0)));
  // Phrase-scale swing: lit share averaged over 16 s windows (about 8 bars at 120 BPM); the
  // quietest vs the busiest window of the song.
  const win = [];
  for (let t = 0; t + 16 <= secs; t += 8) win.push(activeByS.slice(t, t + 16).reduce((a, set) => a + set.size / n, 0) / 16);
  if (win.length >= 4) {
    const w = [...win].sort((a, b) => a - b);
    A.phraseSwing.push([w[Math.floor(w.length * 0.1)], w[Math.floor(w.length * 0.9)]]);
  }
  A.concurrentEffectTypes.push(median(typesByS.map((s) => s.size).filter((v) => v > 0)));

  // Big hits: moments where >=40% of used elements start an effect together.
  let hits = 0;
  for (const xs of startsAt.values()) {
    const els = new Set(xs.map((x) => x.el));
    if (els.size >= Math.max(4, 0.4 * n)) {
      hits++;
      for (const x of xs) inc(A.bigHits.effects, x.name);
    }
    const byName = {};
    for (const x of xs) inc(byName, x.name);
    const top = Math.max(...Object.values(byName));
    if (xs.length >= 4) A.sameEffectAcrossElements.push(top / xs.length);
  }
  A.bigHits.perMinute.push(hits / (durMs / 60000));

  // Does sequencing activity follow the music? Correlate effect starts/sec with onset marks/sec.
  if (onsetName) {
    const on = new Array(secs).fill(0);
    for (const t of timing[onsetName]) if (t / 1000 < secs) on[Math.floor(t / 1000)]++;
    const r = pearson(on, startsByS);
    if (Number.isFinite(r)) A.onsetCorrelation.push(r);
    // Musical intensity proxy: onsets per second over a 4s window, split into this song's terciles.
    const dens = on.map((_, i) => on.slice(Math.max(0, i - 2), i + 2).reduce((a, b) => a + b, 0) / 4);
    const sorted = [...dens].sort((a, b) => a - b);
    const lo = sorted[Math.floor(sorted.length / 3)], hi = sorted[Math.floor((2 * sorted.length) / 3)];
    const level = (sec) => (dens[sec] <= lo ? "low" : dens[sec] >= hi ? "high" : "mid");
    if (hi > lo) {
      A.intensitySongs++;
      activeByS.forEach((set, sec) => (A.activityByIntensity[level(sec)] ??= []).push(set.size / n));
      const byLevel = {}, byRoleLevel = {};
      for (const x of instances) {
        const lv = level(Math.max(0, Math.min(secs - 1, Math.floor(x.start / 1000))));
        inc2(A.effectByIntensity, lv, x.name);
        inc2(A.roleEffectByIntensity, `${x.role}|${lv}`, x.name);
        inc2(byLevel, lv, x.name);
        inc2(byRoleLevel, `${x.role}|${lv}`, x.name);
        if (beatMs) (A.durBeatsByIntensity[lv] ??= []).push((x.end - x.start) / beatMs);
      }
      for (const [lv, c] of Object.entries(byLevel)) mergeNormalized((A.effectByIntensityW[lv] ??= {}), c);
      for (const [k, c] of Object.entries(byRoleLevel)) mergeNormalized((A.roleEffectByIntensityW[k] ??= {}), c);
    }
  }

  A.songRoleSeconds.push(seqRoleSec);
  A.colorsPerSeq.push(seqColors.size);
  mergeNormalized(A.effectCountW, seqEffects);
  mergeNormalized(A.effectSecondsW, seqEffSec);
  for (const role of Object.keys(seqRoleCnt)) {
    mergeNormalized((A.effectByRoleW[role] ??= {}), seqRoleCnt[role]);
    mergeNormalized((A.effectSecondsByRoleW[role] ??= {}), seqRoleSec[role]);
    inc(A.roleSeqs, role);
  }
  const sorted = Object.values(seqEffects).sort((a, b) => b - a);
  A.signatureShare.push(sorted[0] / instances.length);
  let cum = 0, k90 = 0;
  for (const v of sorted) {
    cum += v;
    k90++;
    if (cum >= 0.9 * instances.length) break;
  }
  A.effectsFor90.push(k90);
  if (seqBeat.n >= 30) A.beatAlignPerSeq.push([beatMs ? Math.round(60000 / beatMs) : 0, seqBeat.hit / seqBeat.n]);
  A.perSeq.push({ key, frameMs, durationS: durMs / 1000, elements: elementsUsed.size, effects: effectsTotal, bpm: beatMs ? Math.round(60000 / beatMs) : null, timingTracks: Object.keys(timing).length, layout: layout.models.size > 0, effectsPerMinute: Math.round(effectsTotal / (durMs / 60000)) });
  return true;
}

const NEVER_PLACED = new Set(["Faces", "Pictures", "Video", "Shader", "State", "DMX", "Moving Head", "Sketch", "Kaleidoscope", "Warp", "Piano", "Guitar", "Liquid", "Off"]);

export function jsd(p, q) {
  const sum = (d) => Object.values(d).reduce((a, b) => a + b, 0) || 1;
  const sp = sum(p), sq = sum(q);
  let s = 0;
  for (const k of new Set([...Object.keys(p), ...Object.keys(q)])) {
    const a = (p[k] ?? 0) / sp, b = (q[k] ?? 0) / sq, m = (a + b) / 2;
    if (a > 0) s += 0.5 * a * Math.log2(a / m);
    if (b > 0) s += 0.5 * b * Math.log2(b / m);
  }
  return s;
}

function roleEffectSpread() {
  const prior = {};
  for (const [role, counts] of Object.entries(A.effectSecondsByRoleW)) {
    prior[role] = Object.fromEntries(top(share(counts), 12).filter(([e]) => !NEVER_PLACED.has(e)));
  }
  const perRole = [], perSong = [];
  for (const song of A.songRoleSeconds) {
    let weighted = 0, weight = 0;
    for (const [role, secs] of Object.entries(song)) {
      if (!prior[role]) continue;
      const mine = Object.fromEntries(Object.entries(secs).filter(([e]) => e in prior[role]));
      const total = Object.values(mine).reduce((a, b) => a + b, 0);
      if (total < 10) continue;
      const d = jsd(mine, prior[role]);
      perRole.push(d);
      weighted += d * total;
      weight += total;
    }
    if (weight) perSong.push(weighted / weight);
  }
  return { perRole: pct(perRole, [25, 50, 75]), perSong: pct(perSong, [25, 50, 75]) };
}

function mergeNormalized(into, counts) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (!total) return;
  for (const [k, v] of Object.entries(counts)) inc(into, k, v / total);
}

function pearson(a, b) {
  const n = Math.min(a.length, b.length);
  const ma = a.slice(0, n).reduce((x, y) => x + y, 0) / n, mb = b.slice(0, n).reduce((x, y) => x + y, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  return num / Math.sqrt(da * db);
}

function normTiming(n) {
  if (/beat/i.test(n)) return "beats";
  if (/bar/i.test(n)) return "bars";
  if (/onset/i.test(n)) return "note onsets";
  if (/lyric|vocal|sing|word|phrase/i.test(n)) return "lyrics";
  if (/intro|verse|chorus|section|structure|song part/i.test(n)) return "sections";
  if (/fixed|\d+\s*ms/i.test(n)) return "fixed interval";
  return "other";
}

// ---------- summarise ----------
const top = (o, k = 15) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, k);
const share = (o) => {
  const t = Object.values(o).reduce((a, b) => a + b, 0) || 1;
  return Object.fromEntries(Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, Math.round((v / t) * 10000) / 10000]));
};
const round = (o, d = 1) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Math.round(v * 10 ** d) / 10 ** d]));

const MIN_N = 25;
const effects = Object.keys(A.effectCount).filter((e) => A.effectCount[e] >= MIN_N);
const presets = {};
for (const e of effects) {
  const sb = A.settingsByEffect[e];
  if (!sb) continue;
  presets[e] = {};
  for (const [k, v] of Object.entries(sb.keys)) {
    if (v.num.length + Object.values(v.cat).reduce((a, b) => a + b, 0) < sb.n * 0.15) continue;
    presets[e][k] = v.num.length >= Object.values(v.cat).reduce((a, b) => a + b, 0) ? { type: "number", ...pct(v.num) } : { type: "choice", shares: Object.fromEntries(top(share(v.cat), 6)) };
  }
}
const byRole = {};
for (const [role, counts] of Object.entries(A.effectSecondsByRole)) {
  if ((A.roleCount[role] ?? 0) < MIN_N) continue;
  // Shares are averaged over songs (each song that has this role counts once), not pooled over
  // effects, so one 20,000-effect sequence can't define what a role looks like.
  byRole[role] = { songs: A.roleSeqs[role] ?? 0, effects: A.roleCount[role], seconds: Math.round(A.roleSeconds[role]), effectShareBySeconds: Object.fromEntries(top(share(A.effectSecondsByRoleW[role] ?? {}), 12)), effectShareByCount: Object.fromEntries(top(share(A.effectByRoleW[role] ?? {}), 12)), bufferStyle: Object.fromEntries(top(share(A.bufferStyleByRole[role] ?? {}), 5)), coverage: pct(A.coverageByRole[role] ?? []) };
}
// Lift: how much more an effect is used on a role than across the corpus (by seconds). >1.5 = "this effect belongs here".
const overall = share(A.effectSecondsW);
const lift = {};
for (const [role, counts] of Object.entries(A.effectSecondsByRoleW)) {
  if ((A.roleCount[role] ?? 0) < MIN_N || (A.roleSeqs[role] ?? 0) < 5) continue;
  const local = share(counts);
  lift[role] = Object.fromEntries(
    Object.entries(local)
      .filter(([e]) => A.effectCount[e] >= MIN_N && (A.effectByRole[role][e] ?? 0) >= 8 && overall[e] > 0)
      .map(([e, v]) => [e, Math.round((v / overall[e]) * 100) / 100])
      .sort((a, b) => b[1] - a[1]),
  );
}
const markov = {};
for (const [a, nexts] of Object.entries(A.nextEffect)) {
  if (A.effectCount[a] < MIN_N) continue;
  markov[a] = Object.fromEntries(top(share(nexts), 6));
}
const avgShape = A.activityShape.length ? A.activityShape[0].map((_, i) => Math.round((A.activityShape.reduce((s, v) => s + v[i], 0) / A.activityShape.length) * 1000) / 1000) : [];

const priors = {
  generatedAt: new Date().toISOString().slice(0, 10),
  corpus: { sequences: A.sequences, withLayout: A.withLayout, effects: Object.values(A.effectCount).reduce((a, b) => a + b, 0), skipped: A.skipped.length, frameMs: A.frameMs, xlightsMajorVersions: A.versions, durationS: pct(A.durationsS), elementsPerSequence: pct(A.elementsPerSeq), effectsPerSequence: pct(A.effectsPerSeq), effectsPerMinute: pct(A.perSeq.map((p) => p.effectsPerMinute)), bpm: pct(A.bpm) },
  dedupe: { duplicateFilesSkipped: A.duplicates, overPackageCap: A.overCap },
  // Averaged over songs: each song's own mix counts once.
  effectShareByCount: share(A.effectCountW),
  effectShareBySeconds: share(A.effectSecondsW),
  effectCountsRaw: Object.fromEntries(top(A.effectCount, 60)),
  targetKind: share(A.targetKind),
  roles: byRole,
  roleLift: lift,
  durationMsByEffect: Object.fromEntries(effects.map((e) => [e, pct(A.durMsByEffect[e])])),
  durationBeatsByEffect: Object.fromEntries(effects.filter((e) => (A.durBeatsByEffect[e] ?? []).length >= MIN_N).map((e) => [e, pct(A.durBeatsByEffect[e])])),
  layers: { perElement: share(A.layersPerElement), layerIndexByEffect: Object.fromEntries(effects.map((e) => [e, share(A.layerByEffect[e])])), method: share(A.layerMethod) },
  transitions: { in: share(A.inTransition), out: share(A.outTransition), fadeInShare: Math.round((A.fades.fadeIn / A.fades.total) * 1000) / 1000, fadeOutShare: Math.round((A.fades.fadeOut / A.fades.total) * 1000) / 1000 },
  bufferStyleByEffect: Object.fromEntries(effects.map((e) => [e, Object.fromEntries(top(share(A.bufferStyleByEffect[e]), 4))])),
  valueCurves: { shareByEffect: Object.fromEntries(effects.map((e) => [e, Math.round(((A.valueCurveByEffect[e]?.yes ?? 0) / A.effectCount[e]) * 1000) / 1000])), topKeys: Object.fromEntries(top(A.valueCurveKeys, 40)) },
  palette: { distinctColorsPerSequence: pct(A.colorsPerSeq), size: pct(A.paletteSize), sizeShare: share(A.paletteSize.reduce((o, v) => (inc(o, v), o), {})), topColors: Object.fromEntries(top(share(A.colors), 30)), sizeByEffect: Object.fromEntries(effects.filter((e) => A.paletteSizeByEffect[e]).map((e) => [e, median(A.paletteSizeByEffect[e])])) },
  timing: {
    trackKinds: share(A.timingTrackNames),
    startOnAnyTimingMark: Math.round((A.startAlignAny.hit / (A.startAlignAny.n || 1)) * 1000) / 1000,
    startOnBeat: Math.round((A.startAlignBeat.hit / (A.startAlignBeat.n || 1)) * 1000) / 1000,
    startOnHalfBeat: Math.round((A.startAlignBeat.half / (A.startAlignBeat.n || 1)) * 1000) / 1000,
    startOnBar: Math.round((A.startAlignBeat.bar / (A.startAlignBeat.n || 1)) * 1000) / 1000,
    beatSampleSize: A.startAlignBeat.n,
    onsetVsEffectStartsCorrelation: pct(A.onsetCorrelation),
  },
  structure: { activityByTenthOfSong: avgShape, litShareQuietPhrase: pct(A.phraseSwing.map(([q]) => q), [25, 50, 75]), litShareBusyPhrase: pct(A.phraseSwing.map(([, b]) => b), [25, 50, 75]), busyOverQuietPhrase: pct(A.phraseSwing.filter(([q]) => q > 0.01).map(([q, b]) => b / q), [25, 50, 75]), concurrentEffectTypes: pct(A.concurrentEffectTypes.filter((x) => x != null)), bigHitsPerMinute: pct(A.bigHits.perMinute), bigHitEffects: Object.fromEntries(top(share(A.bigHits.effects), 12)), sameEffectShareAtSharedStarts: pct(A.sameEffectAcrossElements) },
  // How sequencers respond to the music getting busier (onset-density terciles within each song).
  intensity: {
    songs: A.intensitySongs,
    activeShareOfProps: Object.fromEntries(["low", "mid", "high"].map((l) => [l, pct(A.activityByIntensity[l] ?? [], [25, 50, 75])])),
    durationBeats: Object.fromEntries(["low", "mid", "high"].map((l) => [l, pct(A.durBeatsByIntensity[l] ?? [], [25, 50, 75])])),
    effectShare: Object.fromEntries(["low", "mid", "high"].map((l) => [l, Object.fromEntries(top(share(A.effectByIntensityW[l] ?? {}), 14))])),
    // Lift of each effect at high vs low intensity: >1 means "used when the music is busy".
    highVsLowLift: (() => {
      const h = share(A.effectByIntensityW.high ?? {}), l = share(A.effectByIntensityW.low ?? {});
      return Object.fromEntries(Object.keys(h).filter((e) => A.effectCount[e] >= MIN_N && l[e]).map((e) => [e, Math.round((h[e] / l[e]) * 100) / 100]).sort((a, b) => b[1] - a[1]));
    })(),
    byRole: Object.fromEntries(
      Object.entries(A.roleEffectByIntensity)
        .filter(([, c]) => Object.values(c).reduce((a, b) => a + b, 0) >= 60)
        .map(([k]) => [k, Object.fromEntries(top(share(A.roleEffectByIntensityW[k] ?? {}), 6))]),
    ),
  },
  nextEffect: markov,
  style: {
    signatureEffectShare: pct(A.signatureShare),
    distinctEffectsCovering90pct: pct(A.effectsFor90),
    identicalRepeatRunLength: pct(A.repeatRuns, [50, 75, 90, 99]),
    layersByRole: Object.fromEntries(Object.entries(A.layersByRole).filter(([, xs]) => xs.length >= 10).map(([r, xs]) => [r, pct(xs, [50, 90])])),
    beatAlignmentPerSong: pct(A.beatAlignPerSeq.map(([, a]) => a)),
    // How far one song's effect-by-role mix sits from the corpus's: the yardstick for a generated
    // sequence's style. Jensen-Shannon divergence (base 2) over each role's top effects, leaving out
    // the ones Magic Sequence never places (they need a file, a face or a fixture).
    roleEffectJsd: roleEffectSpread(),
    beatAlignmentByTempo: Object.fromEntries([[0, 90], [90, 120], [120, 999]].map(([lo, hi]) => [`${lo}-${hi === 999 ? "" : hi}bpm`, pct(A.beatAlignPerSeq.filter(([b]) => b >= lo && b < hi).map(([, a]) => a), [25, 50, 75])])),
  },
  // Median cycles per beat for each speed-like setting: multiply by an effect's length in beats
  // to get a tempo-matched value.
  cyclesPerBeat: Object.fromEntries(
    Object.entries(A.cyclesPerBeat)
      .filter(([e]) => A.effectCount[e] >= MIN_N)
      .map(([e, keys]) => [e, Object.fromEntries(Object.entries(keys).filter(([, xs]) => xs.length >= 15).map(([k, xs]) => [k, pct(xs, [25, 50, 75])]))]),
  ),
  durationBeatsByTempo: Object.fromEntries(
    [[0, 100], [100, 130], [130, 999]].map(([lo, hi]) => [`${lo}-${hi === 999 ? "" : hi}bpm`, pct((A.durBeatsBySeqBpm ?? []).filter(([b]) => b >= lo && b < hi).map(([, d]) => d))]),
  ),
  parameterPresets: presets,
  roleTaxonomy: ROLES.map(([r, re]) => [r, re.source]),
};

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "priors.json"), JSON.stringify(priors, null, 1) + "\n");
writeFileSync(join(outDir, "per-sequence.local.json"), JSON.stringify({ perSeq: A.perSeq, skipped: A.skipped }, null, 1));
console.log(`analysed ${A.sequences} sequences (${A.withLayout} with layouts), ${priors.corpus.effects} effects, skipped ${A.skipped.length}`);
console.log("top effects by count:", top(A.effectCount, 12).map(([k, v]) => `${k} ${v}`).join(", "));
console.log("roles:", top(A.roleCount, 20).map(([k, v]) => `${k} ${v}`).join(", "));
void round;
