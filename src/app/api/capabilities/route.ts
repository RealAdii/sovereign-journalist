import { NextResponse } from "next/server";
import { capabilitiesReport } from "@/lib/capabilities";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await capabilitiesReport(), { headers: { "Cache-Control": "no-store" } });
}
