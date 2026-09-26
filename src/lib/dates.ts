export type Lang = "de" | "en";
export type DateFormat = "dmy" | "iso" | "mdy";
export type WeekStart = "monday" | "sunday";
export type TimeFormat = "24h" | "12h";

const pad = (n: number) => String(n).padStart(2, "0");

export function toIso(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function isValidIso(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = fromIso(s);
  return toIso(d) === s;
}

export function todayIso(): string {
  return toIso(new Date());
}

export function fromIso(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(iso: string, days: number): string {
  const d = fromIso(iso);
  d.setDate(d.getDate() + days);
  return toIso(d);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((fromIso(b).getTime() - fromIso(a).getTime()) / 86_400_000);
}

export type DueStatus = "overdue" | "today" | "tomorrow" | "future";

export function dueStatus(due: string, today: string): DueStatus {
  const diff = daysBetween(today, due);
  if (diff < 0) return "overdue";
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  return "future";
}

const locale = (lang: Lang) => (lang === "de" ? "de-DE" : "en-US");

function weekdayShort(d: Date, lang: Lang): string {
  return new Intl.DateTimeFormat(locale(lang), { weekday: "short" }).format(d).replace(/\.$/, "");
}

/** List label: "Di, 22.09." / "Tue, Sep 22" (with year if not the current one). */
export function formatShort(iso: string, lang: Lang, today: string): string {
  const d = fromIso(iso);
  const sameYear = iso.slice(0, 4) === today.slice(0, 4);
  if (lang === "de") {
    return `${weekdayShort(d, lang)}, ${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${sameYear ? "" : d.getFullYear()}`;
  }
  const md = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) }).format(d);
  return `${weekdayShort(d, lang)}, ${md}`;
}

export function formatDate(iso: string, fmt: DateFormat): string {
  const [y, m, d] = iso.split("-");
  if (fmt === "iso") return iso;
  if (fmt === "mdy") return `${m}/${d}/${y}`;
  return `${d}.${m}.${y}`;
}

/** "Sa., 26.09.2026" / "Sat, 09/26/2026". */
export function formatWithWeekday(iso: string, lang: Lang, fmt: DateFormat): string {
  const wd = weekdayShort(fromIso(iso), lang);
  return `${wd}${lang === "de" ? "." : ""}, ${formatDate(iso, fmt)}`;
}

/** "12. September 2026" / "September 12, 2026". */
export function formatLong(iso: string, lang: Lang): string {
  return new Intl.DateTimeFormat(locale(lang), { day: "numeric", month: "long", year: "numeric" }).format(fromIso(iso));
}

export function formatTime(d: Date, fmt: TimeFormat, lang: Lang): string {
  return new Intl.DateTimeFormat(locale(lang), {
    hour: "numeric",
    minute: "2-digit",
    hour12: fmt === "12h",
  }).format(d);
}

export interface DateSuggestion {
  key: "today" | "tomorrow" | "monday" | "endOfMonth" | "inAWeek" | "nextMonth";
  iso: string;
}

/** Suggestions after typing due: — tomorrow, next start of week, end of month, in a week. */
export function dateSuggestions(today: string, weekStart: WeekStart): DateSuggestion[] {
  const d = fromIso(today);
  const target = weekStart === "sunday" ? 0 : 1;
  let toStart = (target - d.getDay() + 7) % 7;
  if (toStart === 0) toStart = 7;
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const list: DateSuggestion[] = [
    { key: "tomorrow", iso: addDays(today, 1) },
    { key: "monday", iso: addDays(today, toStart) },
    { key: "endOfMonth", iso: toIso(end) },
    { key: "inAWeek", iso: addDays(today, 7) },
  ];
  // Drop duplicates (e.g. tomorrow is Monday) while keeping order.
  const seen = new Set<string>();
  return list.filter((s) => (seen.has(s.iso) ? false : (seen.add(s.iso), true)));
}
