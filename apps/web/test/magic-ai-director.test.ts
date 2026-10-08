import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { propMap } from "../src/lib/propRoles";
import { rulesDirector } from "../src/lib/magic/director";
import { directPlan, planRequest } from "../src/lib/magic/aiDirector";
import type { ModelGroupRecord, ModelRecord } from "../src/lib/api";
import { syntheticSong } from "./fixtures/syntheticSong";

const layout = JSON.parse(readFileSync(fileURLToPath(new URL("./fixtures/magic-layout.json", import.meta.url)), "utf-8")) as { models: ModelRecord[]; groups: ModelGroupRecord[] };
const props = propMap(layout.models, layout.groups);
const song = syntheticSong(120);
const rules = rulesDirector({ song, props, feel: "auto", seed: 3 });
const request = planRequest(song, props, "joyful", { direction: "  icy blue and white  ", title: "Carol of the Bells" });

function respond(status: number, body: unknown): void {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })));
}
afterEach(() => vi.unstubAllGlobals());

describe("the AI director's brief", () => {
  it("summarises the song and the house, and nothing else", () => {
    expect(request.song.title).toBe("Carol of the Bells");
    expect(request.direction).toBe("icy blue and white");
    expect(request.song.sections).toHaveLength(song.sections.length);
    expect(request.song.sections[0]).toEqual({ index: 0, label: "intro", bars: 8, energy: 0.15, rank: 6, group: "I", hits: 0 });
    expect(request.props.roles.find((r) => r.role === "arch")).toEqual({ role: "arch", count: 4, tier: "feature" });
    expect(request.props.roles.some((r) => r.role === "moving_head")).toBe(false);
    expect(request.props.groups).toContain("All Arches");
  });
});

describe("asking the AI director", () => {
  it("fills the AI's validated plan from the rules plan", async () => {
    respond(200, { plan: { palettes: { ice: ["#00ffff", "#ffffff"] }, sections: [{ index: 2, palette: "ice", featured: ["mega_tree"] }] }, dropped: ["sections[0].families.arch: Fire not allowed"], charged: true, usage: {}, model: "claude-opus-5-5" });
    const { plan, notice, dropped } = await directPlan(1, request, rules);
    expect(notice).toBeUndefined();
    expect(dropped).toHaveLength(1);
    expect(plan.sections[2]).toMatchObject({ palette: "ice", featured: ["mega_tree"] });
    expect(plan.sections[3]).toEqual(rules.sections[3]);
  });

  it("falls back to the rules plan, saying so in one line, on any failure", async () => {
    respond(503, { message: "No API key is configured for the shader assistant." });
    expect(await directPlan(1, request, rules)).toEqual({ plan: rules, notice: "The built-in director planned this one." });
    respond(429, { message: "You have used this month's 60 free generations.", code: "monthly_limit" });
    expect((await directPlan(1, request, rules)).notice).toBe("You have used this month's 60 free generations. The built-in director planned this one.");
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("offline"); }));
    expect((await directPlan(1, request, rules)).plan).toBe(rules);
  });
});
