import { NextResponse } from "next/server";
import type { IdentifyResult, Species } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  const key = process.env.PLANTNET_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "The Pl@ntNet API key is not configured on the server (PLANTNET_API_KEY)." }, { status: 500 });
  }
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Could not read the photo." }, { status: 400 });
  }
  const image = form.get("image");
  if (!(image instanceof Blob) || image.size === 0) {
    return NextResponse.json({ error: "No photo received." }, { status: 400 });
  }
  if (image.size > 4_000_000) {
    return NextResponse.json({ error: "Photo is too large. Please try again." }, { status: 413 });
  }

  const body = new FormData();
  body.append("images", image, "plant.jpg");
  body.append("organs", "auto");
  const url = `https://my-api.plantnet.org/v2/identify/all?api-key=${encodeURIComponent(key)}&lang=en&nb-results=5&include-related-images=false`;

  let r: Response;
  try {
    // Pl@ntNet checks "authorized domains" against Origin/Referer, so send the site's own address.
    // Try as a plain server request first; if Pl@ntNet demands an authorised domain, retry with the site's origin.
    const site = new URL(req.url).origin;
    r = await fetch(url, { method: "POST", body, signal: AbortSignal.timeout(25000) });
    if (r.status === 401 || r.status === 403) {
      r = await fetch(url, { method: "POST", body, headers: { Origin: site, Referer: `${site}/` }, signal: AbortSignal.timeout(25000) });
    }
  } catch {
    return NextResponse.json({ error: "Couldn't reach Pl@ntNet right now. Please try again in a minute." }, { status: 502 });
  }
  if (r.status === 404) return NextResponse.json({ error: "No plant recognised. Try a clearer photo of a flower or leaf." }, { status: 404 });
  if (r.status === 401 || r.status === 403) {
    let detail = "";
    try {
      const j = await r.json();
      detail = String(j.message || j.error || "").slice(0, 160);
    } catch {}
    return NextResponse.json(
      { error: `Pl@ntNet rejected the API key (${r.status}${detail ? `: ${detail}` : ""}). Check the key and its authorised domains.` },
      { status: 502 },
    );
  }
  if (r.status === 429) return NextResponse.json({ error: "Daily identification limit reached. Please try again later." }, { status: 429 });
  if (!r.ok) return NextResponse.json({ error: `Pl@ntNet error (${r.status}). Please try again.` }, { status: 502 });

  const d = await r.json();
  const results: any[] = d.results || [];
  if (!results.length) return NextResponse.json({ error: "No plant recognised. Try a clearer photo of a flower or leaf." }, { status: 404 });

  const toSpecies = (x: any): Species => {
    const sp = x.species || {};
    return {
      name: sp.scientificNameWithoutAuthor || "",
      author: sp.scientificNameAuthorship || "",
      family: sp.family?.scientificNameWithoutAuthor || "",
      genus: sp.genus?.scientificNameWithoutAuthor || "",
      common: (sp.commonNames || []).slice(0, 8),
      score: x.score || 0,
      powo: x.powo?.id || null,
      gbif: x.gbif?.id ? Number(x.gbif.id) : null,
    };
  };
  const all = results.map(toSpecies).filter((s) => s.name);
  const out: IdentifyResult = { best: all[0], alternatives: all.slice(1, 5), remaining: d.remainingIdentificationRequests ?? null };
  return NextResponse.json(out);
}
