import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../src/lib/api";
import type { MagicPlanRequest } from "../src/lib/magic/plan";

// The AI director sends a caller's own key the way the shader assistant does: in headers, and
// only when there is a key. A provider or model header without one must never go out, because
// then the server is spending its own money and a header would be steering it.

const payload: MagicPlanRequest = {
  song: { bpm: 120, durationMs: 1000, sections: [{ index: 0, label: "verse", bars: 4, energy: 0.5, rank: 0, group: "A", hits: 0 }] },
  props: { roles: [{ role: "mega_tree", count: 1, tier: "hero" }], groups: [] },
  feel: "auto",
};

function stubFetch() {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ plan: {}, dropped: [], charged: true, usage: {}, model: "m" }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe("magicPlan", () => {
  it("posts to the sequence's magic-plan route with no key headers by default", async () => {
    const fetchMock = stubFetch();
    await api.magicPlan(7, payload);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/v1/sequences/7/magic-plan");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual(payload);
    const headers = init.headers as Record<string, string>;
    expect(Object.keys(headers).filter((h) => h.startsWith("X-Shader"))).toEqual([]);
  });

  it("sends the key, provider and model together", async () => {
    const fetchMock = stubFetch();
    await api.magicPlan(7, payload, { key: "sk-ant-mine", provider: "anthropic", model: "claude-sonnet-5-5" });

    const headers = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].headers as Record<string, string>;
    expect(headers["X-Shader-Key"]).toBe("sk-ant-mine");
    expect(headers["X-Shader-Provider"]).toBe("anthropic");
    expect(headers["X-Shader-Model"]).toBe("claude-sonnet-5-5");
  });

  it("drops the provider and model when there is no key", async () => {
    const fetchMock = stubFetch();
    await api.magicPlan(7, payload, { key: null, provider: "openai", model: "gpt-5" });

    const headers = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].headers as Record<string, string>;
    expect(Object.keys(headers).filter((h) => h.startsWith("X-Shader"))).toEqual([]);
  });

  it("turns a non-200 into an ApiError the caller can fall back on", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 503 })));
    await expect(api.magicPlan(7, payload)).rejects.toMatchObject({ status: 503 });
  });
});

describe("magicStatus", () => {
  it("reads /v1/magic/status", async () => {
    const fetchMock = stubFetch();
    await api.magicStatus();
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe("/api/v1/magic/status");
  });
});
