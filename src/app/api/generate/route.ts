import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken } from "@/lib/session";
import { generateArticle } from "@/lib/gemini";
import type { ChatMessage } from "@/lib/types";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { messages, sessionToken } = (await req.json()) as {
      messages: ChatMessage[];
      sessionToken: string;
    };

    const credential = verifySessionToken(sessionToken);
    if (!credential) {
      return NextResponse.json(
        { error: "Invalid or expired session" },
        { status: 401 }
      );
    }

    if (!messages || messages.length < 4) {
      return NextResponse.json(
        { error: "Interview too short to publish" },
        { status: 400 }
      );
    }

    const article = await generateArticle(messages, credential);

    return NextResponse.json({ article });
  } catch (error) {
    console.error("Generate error:", error);
    const message =
      error instanceof Error ? error.message : "Article generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
