import { NextResponse } from "next/server";
import { buildSection } from "@/lib/sections";
import type { SectionId } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const IDS: SectionId[] = ["overview", "photos", "taxonomy", "systematics", "distribution", "conservation", "phytochemicals", "medicinal", "ethnobotanical", "economic"];

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!IDS.includes(id as SectionId)) return NextResponse.json({ error: "Unknown section" }, { status: 404 });
  const u = new URL(req.url);
  const name = (u.searchParams.get("name") || "").slice(0, 120);
  if (!/^[A-Za-z×. \-]{3,120}$/.test(name)) return NextResponse.json({ error: "Invalid name" }, { status: 400 });
  const country = (u.searchParams.get("country") || "IN").replace(/[^A-Za-z]/g, "").slice(0, 2) || "IN";
  const lang = (u.searchParams.get("lang") || "en").replace(/[^A-Za-z-]/g, "").slice(0, 12) || "en";
  try {
    const data = await buildSection(id as SectionId, {
      name,
      family: u.searchParams.get("family") || undefined,
      powo: (u.searchParams.get("powo") || "").replace(/[^0-9-]/g, "") || undefined,
      country,
      lang,
    });
    return NextResponse.json(data, { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" } });
  } catch (e) {
    return NextResponse.json({ error: "One of the databases didn't respond. Please try again." }, { status: 502 });
  }
}
