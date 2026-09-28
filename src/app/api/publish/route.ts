import { NextRequest, NextResponse } from "next/server";
import { consumePublishCapability, getCapability, releasePublishCapability } from "@/lib/session";
import { ArticleValidationError, publishArticle, publisherConfigured } from "@/lib/onchain";
import { jsonError, rateLimited, readJson, tooManyRequests } from "@/lib/request";
import type { ArticleDraft } from "@/lib/types";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (rateLimited(req, "publish", 5, 10 * 60 * 1000)) return tooManyRequests();
  const body = await readJson<{ article?: ArticleDraft; approvedDigest?: string; token?: string }>(req);
  if (!body?.article || typeof body.approvedDigest !== "string") {
    return jsonError("article and approvedDigest are required", 400);
  }
  const existing = getCapability(body.token);
  if (!existing) return jsonError("Invalid or expired session", 401);
  if (existing.bondStatus === "blocked") {
    return jsonError("Publishing requires a confirmed bond, which is blocked on Sepolia", 403);
  }
  if (existing.usedForPublish) {
    return jsonError("This session already published an article", 409);
  }
  if (!publisherConfigured()) return jsonError("Sepolia publishing is not configured", 503);

  // Mark one-use before the transaction so a concurrent request cannot publish twice.
  const record = consumePublishCapability(body.token!);
  if (!record) return jsonError("This session cannot publish", 409);

  try {
    const result = await publishArticle(body.article, body.approvedDigest);
    return NextResponse.json(result);
  } catch (error) {
    // A failed or rejected transaction must not burn the session.
    releasePublishCapability(body.token!);
    if (error instanceof ArticleValidationError) {
      return jsonError(error.message, 422, { field: error.field, size: error.size, max: error.max });
    }
    const message = error instanceof Error ? error.message : "Publishing failed";
    return jsonError(message, 502);
  }
}
