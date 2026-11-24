export function absoluteUrl(value: string | undefined, base: string): string | undefined {
  if (!value) return undefined;
  try {
    return new URL(value, base).toString();
  } catch {
    return undefined;
  }
}

export function normalizeId(value: string): string {
  return value.trim().replace(/\\s+/g, "-");
}
