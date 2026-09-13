import { NextResponse } from "next/server";
import { listImports } from "@/lib/repo";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ items: listImports() });
}
