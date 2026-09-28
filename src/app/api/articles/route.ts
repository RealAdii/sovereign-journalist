import { NextResponse } from "next/server";
import { listArticles, registryConfigured } from "@/lib/onchain";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!registryConfigured()) {
    return NextResponse.json({ articles: [], source: "unconfigured" });
  }
  try {
    const articles = await listArticles(20);
    return NextResponse.json({
      articles,
      source: "starknet-sepolia",
      registry: process.env.NEXT_PUBLIC_ARTICLE_REGISTRY_ADDRESS,
    });
  } catch {
    return NextResponse.json({ error: "Sepolia read failed" }, { status: 502 });
  }
}
