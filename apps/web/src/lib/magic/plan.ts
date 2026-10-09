import type { Role, Tier } from "../propRoles";

// The director's output: a plan per section, never per effect (docs/MAGIC-SEQUENCE.md 2.3).
// The rules director always makes one; the AI director may, and the server validates it first.

export type Motion = "left-to-right" | "right-to-left" | "centre-out" | "alternate" | "unison";
export type Accents = "none" | "downbeats" | "beats" | "hits";
export type Ending = "fade" | "hit-then-dark" | "hold";
export type Feel = "auto" | "traditional" | "joyful" | "peaceful" | "powerful" | "magical" | "rock";

export interface SectionPlan {
  /** Into SongMap.sections. */
  index: number;
  /** Sections with the same look id share a look; "" is a look of its own. */
  look: string;
  /** 0..1: how much of the house is lit, and how fast. */
  intensity: number;
  /** A key of ShowPlan.palettes. */
  palette: string;
  /** Roles that carry this section. */
  featured: Role[];
  /** Allowed effects per role, in preference order. */
  families: Partial<Record<Role, string[]>>;
  motion: Motion;
  accents: Accents;
  /** One unison hit at the section's first downbeat. */
  wholeHouseHit: boolean;
}

export interface ShowPlan {
  seed: number;
  /** name -> 2..6 hex colours; effects use one or two of them. */
  palettes: Record<string, string[]>;
  sections: SectionPlan[];
  ending: Ending;
}

/** What the AI director is sent: summaries only, never audio or the layout itself. */
export interface MagicPlanRequest {
  song: {
    title?: string;
    artist?: string;
    bpm: number;
    durationMs: number;
    sections: { index: number; label: string; bars: number; energy: number; rank: number; group: string; hits: number }[];
  };
  props: { roles: { role: Role; count: number; tier: Tier }[]; groups: string[] };
  feel: Feel;
  direction?: string;
}

/** A validated, possibly partial plan: whatever the server dropped, the rules director fills. */
export interface MagicPlanResponse {
  plan: Partial<Omit<ShowPlan, "sections">> & { sections?: Partial<SectionPlan>[] };
  dropped: string[];
  charged: boolean;
  usage: Record<string, unknown>;
  model: string;
}

export interface MagicStatus {
  available: boolean;
  accepts_user_keys: boolean;
  model: string;
  daily_limit: number;
  used_today: number;
  monthly_limit: number;
  used_this_month: number;
}
