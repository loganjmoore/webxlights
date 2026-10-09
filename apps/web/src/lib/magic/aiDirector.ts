import type { SongMap } from "@webxlights/engine";
import { api, ApiError } from "../api";
import type { PropInfo, Role, Tier } from "../propRoles";
import { completePlan } from "./director";
import type { Feel, MagicPlanRequest, ShowPlan } from "./plan";
import { ROLE_EFFECTS } from "./roleEffects";

// The AI director's side of a press (docs/MAGIC-SEQUENCE.md 2.3): a compact brief out, a
// validated plan back, every gap filled by the rules director. Any failure falls back to the
// rules plan with a one-line notice; the button never depends on the network.

export interface BriefOptions {
  direction?: string;
  title?: string;
  artist?: string;
}

/** What the director is told: summaries of the song and the house, never audio or the layout. */
export function planRequest(song: SongMap, props: readonly PropInfo[], feel: Feel, options: BriefOptions = {}): MagicPlanRequest {
  const roles = new Map<Role, { count: number; tiers: Map<Tier, number> }>();
  for (const p of props) {
    if (!p.key.startsWith("model:") || ROLE_EFFECTS[p.role].length === 0) continue;
    const entry = roles.get(p.role) ?? { count: 0, tiers: new Map() };
    entry.count++;
    entry.tiers.set(p.tier, (entry.tiers.get(p.tier) ?? 0) + 1);
    roles.set(p.role, entry);
  }
  const direction = options.direction?.trim();
  return {
    song: {
      ...(options.title ? { title: options.title.slice(0, 200) } : {}),
      ...(options.artist ? { artist: options.artist.slice(0, 200) } : {}),
      bpm: Math.round(song.bpm * 100) / 100,
      durationMs: Math.round(song.durationMs),
      sections: song.sections.map((s, index) => ({
        index,
        label: s.label,
        bars: Math.max(1, song.downbeats.filter((d) => d >= s.startMs - 1 && d < s.endMs - 1).length),
        energy: Math.round(s.energy * 100) / 100,
        rank: s.rank,
        group: s.group.slice(0, 4),
        hits: song.hits.filter((h) => h.ms >= s.startMs && h.ms < s.endMs).length,
      })),
    },
    props: {
      roles: [...roles].map(([role, { count, tiers }]) => ({ role, count, tier: [...tiers].sort((a, b) => b[1] - a[1])[0]![0] })),
      groups: props.filter((p) => p.key.startsWith("group:")).map((p) => p.name.slice(0, 100)).slice(0, 40),
    },
    feel,
    ...(direction ? { direction: direction.slice(0, 500) } : {}),
  };
}

export interface DirectedPlan {
  plan: ShowPlan;
  /** Set when the AI director couldn't help and the rules director planned alone. */
  notice?: string;
  /** What the server dropped from the AI's plan, for the console. */
  dropped?: string[];
}

export async function directPlan(
  sequenceId: number,
  request: MagicPlanRequest,
  rules: ShowPlan,
  credentials?: { key?: string | null; provider?: string | null; model?: string | null },
): Promise<DirectedPlan> {
  try {
    const response = await api.magicPlan(sequenceId, request, credentials);
    return { plan: completePlan(response.plan, rules, request.props.roles.map((r) => r.role)), dropped: response.dropped };
  } catch (err) {
    // A cap or a refused direction is the user's to know about in the server's own words;
    // anything else is ours, and the built-in director has it covered.
    const said = err instanceof ApiError && (err.status === 429 || err.status === 422) ? `${serverMessage(err.message)} ` : "";
    return { plan: rules, notice: `${said}The built-in director planned this one.` };
  }
}

/** The server's own sentence from a JSON error body, or nothing. */
function serverMessage(body: string): string {
  try {
    const message = (JSON.parse(body) as { message?: unknown }).message;
    return typeof message === "string" ? message : "";
  } catch {
    return "";
  }
}
