import { describe, expect, it } from "vitest";
import { subModelSource, toRenderableEffects } from "../src/lib/renderableEffects";
import type { ModelRecord, SequenceEffect, TimingTrack } from "../src/lib/api";

function effect(over: Partial<SequenceEffect> = {}): SequenceEffect {
  return { id: "e1", name: "State", startMs: 0, endMs: 1000, params: {}, ...over };
}

const TRACKS: TimingTrack[] = [
  { name: "Lyrics", marks: [0, 500, 1000], labels: ["wink", "eyesleft", ""] },
  { name: "Bars", marks: [0, 250, 500] },
];

const MODEL = {
  states: [
    { name: "State1", entries: [{ name: "wink", nodes: "1,5,8" }] },
    { name: "State2", entries: [{ name: "blink", nodes: "2" }] },
  ],
} as Pick<ModelRecord, "states">;

describe("resolving a row's effects for the renderer", () => {
  it("resolves the cells of the track an effect names", () => {
    const [resolved] = toRenderableEffects([effect({ params: { timingTrack: "Lyrics" } })], { timingTracks: TRACKS });
    expect(resolved!.data?.timing).toEqual([
      { startMs: 0, endMs: 500, label: "wink" },
      { startMs: 500, endMs: 1000, label: "eyesleft" },
    ]);
  });

  it("attaches nothing at all to an effect that names no track and no states", () => {
    // Every effect goes through here, so the ones that don't use any of this must come out the
    // shape they always were.
    const [resolved] = toRenderableEffects([effect({ name: "On", params: {} })], { timingTracks: TRACKS, model: MODEL });
    expect(resolved!.data).toBeUndefined();
    expect(resolved!.palette).toBeUndefined();
  });

  it("resolves the palette the same way for every effect", () => {
    const [resolved] = toRenderableEffects([effect({ name: "On", palette: ["#ff0000"] })]);
    expect(resolved!.palette).toEqual([{ r: 255, g: 0, b: 0, a: 255 }]);
  });

  it("picks the state definition an effect names", () => {
    const [resolved] = toRenderableEffects([effect({ params: { stateDefinition: "State2" } })], { model: MODEL });
    expect(resolved!.data?.states).toEqual([{ name: "blink", nodes: "2" }]);
  });

  it("uses the model's only definition when the effect names none", () => {
    const single = { states: [MODEL.states![0]!] };
    const [resolved] = toRenderableEffects([effect({ params: {} })], { model: single });
    expect(resolved!.data?.states).toEqual([{ name: "wink", nodes: "1,5,8" }]);
  });

  it("picks nothing when several definitions exist and the effect names none", () => {
    // Guessing would light one prop's states from another definition's node numbers, which is a
    // wrong show rather than an empty one.
    const [resolved] = toRenderableEffects([effect({ params: {} })], { model: MODEL });
    expect(resolved!.data).toBeUndefined();
  });

  it("resolves nothing for a track name the sequence hasn't got", () => {
    const [resolved] = toRenderableEffects([effect({ params: { timingTrack: "Deleted" } })], { timingTracks: TRACKS });
    expect(resolved!.data).toBeUndefined();
  });

  it("gives a track with no labels no cells, rather than empty ones", () => {
    const [resolved] = toRenderableEffects([effect({ params: { timingTrack: "Bars" } })], { timingTracks: TRACKS });
    expect(resolved!.data?.timing).toEqual([]);
  });
});

describe("resolving a face definition", () => {
  const FACE_MODEL = {
    faces: [
      { name: "Face1", mouths: [{ name: "AI", nodes: "1-5" }] },
      { name: "Face2", mouths: [{ name: "AI", nodes: "6-10" }] },
    ],
  } as Pick<ModelRecord, "faces">;

  it("picks the face an effect names", () => {
    const [resolved] = toRenderableEffects([effect({ name: "Faces", params: { faceDefinition: "Face2" } })], { model: FACE_MODEL });
    expect(resolved!.data?.face?.mouths[0]!.nodes).toBe("6-10");
  });

  it("uses the model's only face when the effect names none", () => {
    const single = { faces: [FACE_MODEL.faces![0]!] };
    const [resolved] = toRenderableEffects([effect({ name: "Faces", params: {} })], { model: single });
    expect(resolved!.data?.face?.name).toBe("Face1");
  });

  it("picks nothing when several faces exist and the effect names none", () => {
    const [resolved] = toRenderableEffects([effect({ name: "Faces", params: {} })], { model: FACE_MODEL });
    expect(resolved!.data).toBeUndefined();
  });
});

describe("definitions on a sub-model", () => {
  it("renumbers the parent's face and state ranges into the sub-model's own nodes, dropping the rest", () => {
    // A sub-model of parent nodes 21-80: parent node 31 is its node 11.
    const parentIndices = Array.from({ length: 60 }, (_, i) => 20 + i);
    const source = subModelSource({
      states: [{ name: "S", entries: [{ name: "wink", nodes: "31,90" }] }],
      faces: [{ name: "Face", mouths: [{ name: "AI", nodes: "31-33" }, { name: "MBP", nodes: "5-6" }], eyesOpen: "21-22" }],
    }, parentIndices);
    expect(source.faces![0]!.mouths).toEqual([{ name: "AI", nodes: "11,12,13" }, { name: "MBP", nodes: "" }]);
    expect(source.faces![0]!.eyesOpen).toBe("1,2");
    expect(source.faces![0]!.outline).toBeUndefined();
    expect(source.states![0]!.entries[0]!.nodes).toBe("11");
  });
});
