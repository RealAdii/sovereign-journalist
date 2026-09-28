import { NextResponse } from "next/server";
import { getArticle, registryConfigured } from "@/lib/onchain";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  if (!registryConfigured()) {
    return NextResponse.json({ error: "Sepolia registry is not configured" }, { status: 503 });
  }
  try {
    const article = await getArticle(params.id);
    return NextResponse.json({
      article,
      source: "starknet-sepolia",
      registry: process.env.NEXT_PUBLIC_ARTICLE_REGISTRY_ADDRESS,
    });
  } catch {
    return NextResponse.json({ error: "Article not found on Sepolia" }, { status: 404 });
  }
}
