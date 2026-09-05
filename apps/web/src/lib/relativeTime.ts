// "2 days ago", for the lists that show when something was last touched.
//
// The browser's own formatter does the words and the language; this only picks the unit, the
// way people do - seconds are "just now", and anything past a month is a date, because "47 days
// ago" is a number nobody wants to subtract from today.

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["minute", 60_000],
  ["hour", 3_600_000],
  ["day", 86_400_000],
];

export function relativeTime(iso: string | undefined | null, now: Date = new Date(), locale = "en"): string {
  if (!iso) return "";
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "";
  const diff = then.getTime() - now.getTime();
  const abs = Math.abs(diff);
  if (abs < 60_000) return "just now";
  if (abs >= 30 * 86_400_000) return then.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "always" });
  for (let i = UNITS.length - 1; i >= 0; i--) {
    const [unit, ms] = UNITS[i]!;
    if (abs >= ms) return formatter.format(Math.round(diff / ms), unit);
  }
  return "just now";
}
