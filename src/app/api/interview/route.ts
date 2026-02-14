import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken } from "@/lib/session";
import { conductInterviewStream } from "@/lib/gemini";
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

    if (!messages || messages.length === 0) {
      return NextResponse.json(
        { error: "No messages provided" },
        { status: 400 }
      );
    }

    const stream = await conductInterviewStream(messages, credential);

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
      },
    });
  } catch (error) {
    console.error("Interview error:", error);
    const message =
      error instanceof Error ? error.message : "Interview request failed";

    if (message.includes("429")) {
      return NextResponse.json(
        { error: "Rate limited. Please wait a moment and try again." },
        { status: 429 }
      );
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
