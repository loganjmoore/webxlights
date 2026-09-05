import { describe, expect, it } from "vitest";
import { relativeTime } from "../src/lib/relativeTime";

const now = new Date("2026-09-05T12:00:00Z");

describe("relative time", () => {
  it("says just now under a minute", () => {
    expect(relativeTime("2026-09-05T11:59:30Z", now)).toBe("just now");
  });
  it("picks the largest unit that fits", () => {
    expect(relativeTime("2026-09-05T11:15:00Z", now)).toBe("45 minutes ago");
    expect(relativeTime("2026-09-05T09:00:00Z", now)).toBe("3 hours ago");
    expect(relativeTime("2026-09-03T12:00:00Z", now)).toBe("2 days ago");
  });
  it("becomes a date past a month", () => {
    expect(relativeTime("2026-07-01T12:00:00Z", now)).toMatch(/2026/);
  });
  it("is empty for nothing or nonsense", () => {
    expect(relativeTime(undefined, now)).toBe("");
    expect(relativeTime("not a date", now)).toBe("");
  });
});
