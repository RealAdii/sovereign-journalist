import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken } from "@/lib/session";
import { pinArticle } from "@/lib/pinata";
import type { IPFSArticle } from "@/lib/types";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { article, sessionToken } = (await req.json()) as {
      article: IPFSArticle;
      sessionToken: string;
    };

    const credential = verifySessionToken(sessionToken);
    if (!credential) {
      return NextResponse.json(
        { error: "Invalid or expired session" },
        { status: 401 }
      );
    }

    if (!article?.article?.title || !article?.article?.body) {
      return NextResponse.json(
        { error: "Invalid article data" },
        { status: 400 }
      );
    }

    const cid = await pinArticle(article);

    return NextResponse.json({ cid });
  } catch (error) {
    console.error("Publish error:", error);
    const message =
      error instanceof Error ? error.message : "Publishing failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
