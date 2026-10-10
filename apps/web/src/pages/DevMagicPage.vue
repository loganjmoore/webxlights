<script setup lang="ts">
/**
 * Dev-only: a Magic Sequence on the test layout, drawn as frames of the house with the real WebGL
 * shaders. Registered by router/index.ts behind `import.meta.env.DEV`.
 *
 * It exists because the Magic tests run in Node, where a shader renders transparent, so how a
 * generated show actually looks (a shader bed across the house, a sweep crossing it) can only be
 * seen in a browser. Query: style, feel, bpm, seed, and `at`, a list of seconds to draw.
 *   /dev/magic?style=mood&feel=magical&bpm=120&seed=7&at=10,20.5,40
 */
import { nextTick, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { geometryCenter, nodeWorldOffset, transformedHalfExtents, type SongMap } from "@webxlights/engine";
import layoutUrl from "../../test/fixtures/magic-layout.json?url";
import shadersUrl from "../../../api/database/data/builtin-shaders.json?url";
import type { ModelGroupRecord, ModelRecord, SequenceBody } from "../lib/api";
import { propMap } from "../lib/propRoles";
import { rulesDirector } from "../lib/magic/director";
import { choreograph, type MagicShader } from "../lib/magic/choreograph";
import { feelSpec } from "../lib/magic/feels";
import type { Feel, Style } from "../lib/magic/plan";
import { magicBody, sectionNames } from "../lib/magic/apply";
import { createHouseRenderer } from "../lib/fseqExport";
import { fitScore } from "../lib/magic/score";
import { displayY, transformForModel } from "../lib/modelTransform";
import { NODE_SPACING } from "../lib/worldUnits";

const route = useRoute();
const frames = ref<{ label: string; canvas: HTMLCanvasElement }[]>([]);
const summary = ref("");
const host = ref<HTMLDivElement | null>(null);

onMounted(async () => {
  const q = route.query;
  const style = (q.style as Style) ?? "mood";
  const feel = (q.feel as Feel) ?? "magical";
  const bpm = Number(q.bpm ?? 120);
  const seed = Number(q.seed ?? 7);
  const layout = (await (await fetch(layoutUrl)).json()) as { models: ModelRecord[]; groups: ModelGroupRecord[] };
  const shaders = ((await (await fetch(shadersUrl)).json()) as Omit<MagicShader, "id">[]).map((s, i) => ({ id: i + 1, name: s.name, source: s.source, inputs: s.inputs }));
  // The test fixture, loaded at run time: it lives outside src, where the app's build can't see it.
  const { syntheticSong } = (await import(/* @vite-ignore */ `${"/test/fixtures/syntheticSong.ts"}`)) as { syntheticSong: (bpm: number) => SongMap };
  const song = syntheticSong(bpm);
  const props = propMap(layout.models, layout.groups);
  const plan = rulesDirector({ song, props, feel, seed, style });
  const placements = choreograph(song, props, plan, { feel: feelSpec(feel, song), frameMs: 25, title: "Jingle Bells", shaders });
  let n = 0;
  const empty: SequenceBody = { timingTracks: [], rows: [] };
  const { body } = magicBody(empty, placements, song, "replace", () => `e${n++}`);
  const house = createHouseRenderer(layout.models, body, 25, undefined, layout.groups);
  const names = sectionNames(song);
  const used = [...new Set(placements.filter((p) => p.effect.name === "Shader").map((p) => shaders.find((s) => s.id === p.effect.params.shaderId)?.name))];
  const fit = fitScore({ song, models: layout.models, groups: layout.groups, body, placements, frameMs: 25, blendBetweenModels: false });
  // Each section's mean brightness, a prop at a time, the way the fit score's lift part sees it.
  const level = (ms: number) => {
    const props = house.renderAt(ms).filter((n): n is NonNullable<typeof n> => !!n && n.length > 0);
    return props.reduce((sum, nodes) => sum + nodes.reduce((a, c) => a + (c.a > 0 ? (c.r + c.g + c.b) / 765 : 0), 0) / nodes.length, 0) / props.length;
  };
  const lift = song.sections.map((s) => {
    const samples = Array.from({ length: 12 }, (_, i) => level(s.startMs + ((i + 0.5) / 12) * (s.endMs - s.startMs)));
    return `${names[song.sections.indexOf(s)]} ${(samples.reduce((a, b) => a + b, 0) / samples.length).toFixed(2)}`;
  }).join(", ");
  summary.value = `${lift} · ${style} · ${feel} · ${bpm} BPM · seed ${seed} · ${placements.length} effects · fit ${fit.score} (loud ${fit.loud.toFixed(2)}, beat ${fit.beat.toFixed(2)}, lift ${fit.lift.toFixed(2)}, style ${fit.style.toFixed(2)}, variety ${fit.variety.toFixed(2)}) · shaders: ${used.join(", ")}`;

  // Every lit node's place in the yard, the way the views draw it.
  const points = house.models.map((model, i) => {
    const geo = house.geometries[i];
    if (!geo) return [];
    const transform = transformForModel(model);
    const centre = geometryCenter(geo);
    const y0 = displayY(model, transformedHalfExtents(geo, transform).halfH * NODE_SPACING, 0, true);
    return geo.nodes.map((node) => {
      const o = nodeWorldOffset(node, centre, transform);
      return { x: (model.screen.x ?? 0) + o.x * NODE_SPACING, y: y0 + o.y * NODE_SPACING };
    });
  });
  const all = points.flat();
  const [minX, maxX] = [Math.min(...all.map((p) => p.x)), Math.max(...all.map((p) => p.x))];
  const [minY, maxY] = [Math.min(...all.map((p) => p.y)), Math.max(...all.map((p) => p.y))];
  const W = Number(q.w ?? 560), H = Math.round((W * (maxY - minY + 40)) / (maxX - minX + 40));

  const times = String(q.at ?? "").split(",").filter(Boolean).map(Number).filter((t) => Number.isFinite(t) && t >= 0);
  const at = times.length ? times.map((t) => t * 1000) : song.sections.flatMap((s) => [s.startMs + 0.25 * (s.endMs - s.startMs), s.startMs + 0.6 * (s.endMs - s.startMs)]);
  const out: typeof frames.value = [];
  for (const ms of at.sort((a, b) => a - b)) {
    const colours = house.renderAt(ms);
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);
    colours.forEach((nodes, i) => nodes?.forEach((c, k) => {
      const p = points[i]![k];
      if (!p || c.a === 0) return;
      ctx.fillStyle = `rgba(${c.r},${c.g},${c.b},${c.a / 255})`;
      ctx.fillRect(((p.x - minX + 20) / (maxX - minX + 40)) * W - 1, H - ((p.y - minY + 20) / (maxY - minY + 40)) * H - 1, 2.5, 2.5);
    }));
    const si = song.sections.findIndex((s) => ms >= s.startMs && ms < s.endMs);
    out.push({ label: `${(ms / 1000).toFixed(2)} s · ${names[si] ?? ""}`, canvas });
  }
  frames.value = out;
  await nextTick();
  host.value?.querySelectorAll(".frame-slot").forEach((slot, i) => slot.replaceChildren(out[i]!.canvas));
});
</script>

<template>
  <div class="dev-magic">
    <p>{{ summary }}</p>
    <div ref="host" class="frames">
      <figure v-for="f in frames" :key="f.label">
        <div class="frame-slot"></div>
        <figcaption>{{ f.label }}</figcaption>
      </figure>
    </div>
  </div>
</template>

<style scoped>
.dev-magic {
  padding: 12px;
  color: #ccc;
  font: 12px system-ui;
  background: #0b0b0e;
  min-height: 100vh;
}
.frames {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
figure {
  margin: 0;
}
</style>
