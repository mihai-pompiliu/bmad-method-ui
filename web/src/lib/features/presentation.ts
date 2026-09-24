export function formatFeatureDate(date: string | null, full = false): string | null {
  if (!date) return null;
  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) return full ? `${match[3]}.${match[2]}.${match[1]}` : `${match[3]}.${match[2]}`;
  const value = new Date(date);
  if (Number.isNaN(value.getTime())) return null;
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Minsk",
    day: "2-digit",
    month: "2-digit",
    ...(full ? { year: "numeric" } : {}),
  }).format(value);
}

export function formatFeatureReadAt(readAt: string): string {
  const value = new Date(readAt);
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Minsk",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(value).replace(",", " ·");
}

export function featureLibraryPath(source: string | null | undefined): string | null {
  if (!source) return null;
  const normalized = source.replaceAll("\\", "/").replace(/^\.\//, "");
  if (normalized.startsWith("_bmad-output/") || normalized.startsWith("_bmad/")) return normalized;
  if (/^[a-zA-Z]:\//.test(normalized) || normalized.startsWith("/")) return null;
  return `_bmad-output/${normalized}`;
}
