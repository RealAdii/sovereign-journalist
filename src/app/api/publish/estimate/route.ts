import { NextRequest, NextResponse } from "next/server";
import { requireBondedCapability } from "@/lib/session";
import { ArticleValidationError, estimatePublication, publisherConfigured } from "@/lib/onchain";
import { jsonError, rateLimited, readJson, tooManyRequests } from "@/lib/request";
import type { ArticleDraft } from "@/lib/types";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (rateLimited(req, "estimate", 20, 10 * 60 * 1000)) return tooManyRequests();
  const body = await readJson<{ article?: ArticleDraft; token?: string }>(req);
  if (!body?.article) return jsonError("An article is required", 400);

  const gate = requireBondedCapability(body.token);
  if ("error" in gate) {
    return gate.error === "bond-blocked"
      ? jsonError("Publishing requires a confirmed bond, which is blocked on Sepolia", 403)
      : jsonError("Invalid or expired session", 401);
  }
  if (!publisherConfigured()) return jsonError("Sepolia publishing is not configured", 503);

  try {
    return NextResponse.json(await estimatePublication(body.article));
  } catch (error) {
    if (error instanceof ArticleValidationError) {
      return jsonError(error.message, 422, { field: error.field, size: error.size, max: error.max });
    }
    return jsonError("Fee estimation failed on Sepolia. Try again in a moment.", 502);
  }
}
