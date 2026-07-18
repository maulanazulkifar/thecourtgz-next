export function stripTags(input: string): string {
  return input.replace(/<[^>]*>/g, "");
}

export function sanitizeText(input: string | null | undefined, max = 500): string | null {
  if (input == null) return null;
  let clean = stripTags(input).trim();
  clean = clean.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
  if (!clean) return null;
  return clean.length > max ? clean.slice(0, max) : clean;
}

export function sanitizeName(name: string, max = 100): string {
  const clean = sanitizeText(name, max);
  return clean ?? "Discord User";
}
