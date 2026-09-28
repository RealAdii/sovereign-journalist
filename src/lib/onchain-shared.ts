// Browser-safe constants and helpers. Keep in sync with onchain.ts and the
// Cairo contract limits.
export const ARTICLE_LIMITS = { title: 180, subtitle: 420, body: 16384 } as const;

const encoder = new TextEncoder();

export function byteLength(value: string) {
  return encoder.encode(value.normalize("NFC")).length;
}
