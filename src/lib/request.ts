import { NextResponse, type NextRequest } from "next/server";
import { enforceRateLimit } from "./session";

export function clientKey(req: NextRequest, route: string) {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || req.headers.get("x-real-ip") || req.ip || "unknown";
  // The raw address is only ever HMAC-hashed inside enforceRateLimit. Never log it.
  return `${route}:${ip}`;
}

export function rateLimited(req: NextRequest, route: string, limit: number, windowMs: number) {
  return !enforceRateLimit(clientKey(req, route), limit, windowMs);
}

export function jsonError(message: string, status: number, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

export async function readJson<T>(req: NextRequest): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}

export function tooManyRequests() {
  return jsonError("Too many requests. Wait a minute and try again.", 429);
}
