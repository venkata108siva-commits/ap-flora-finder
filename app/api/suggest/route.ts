import { NextResponse } from "next/server";
import { gbifMatch, gbifSpecies, gbifSuggest } from "@/lib/sources";
import { iastToDevanagari, searchSanskrit } from "@/lib/sanskrit";

export const runtime = "nodejs";

type Hit = { key: number; name: string; author: string; family: string; genus: string; common?: string; via?: string; sanskrit?: string; score?: number };

/** Plant name suggestions from the GBIF Backbone: scientific names (synonyms resolved) and common names. */
export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") || "").replace(/[^\p{L}\p{M}\s.\-×']/gu, " ").replace(/\s+/g, " ").trim().slice(0, 60);
  if (q.length < 2) return NextResponse.json({ items: [] });
  // Sanskrit names (Ayurvedic Pharmacopoeia of India) are matched locally, in parallel with GBIF.
  const skEntries = searchSanskrit(q, 4);
  const skPlants = skEntries.flatMap((e) => e.plants.map((plant) => ({ e, plant }))).slice(0, 5);
  const [{ sci, vern }, skMatches] = await Promise.all([gbifSuggest(q), Promise.all(skPlants.map((x) => gbifMatch(x.plant)))]);
  const out: Hit[] = [];
  const seen = new Set<number>();
  const push = (h: Hit) => {
    if (!seen.has(h.key)) {
      seen.add(h.key);
      out.push(h);
    }
  };
  const ranks = new Set(["SPECIES", "SUBSPECIES", "VARIETY"]);
  const synonyms: any[] = [];
  for (const x of sci) {
    if (!ranks.has(x.rank)) continue;
    if (x.status === "ACCEPTED" || x.status === "DOUBTFUL") {
      push({ key: x.key, name: x.canonicalName || x.scientificName, author: (x.scientificName || "").replace(x.canonicalName || "", "").trim(), family: x.family || "", genus: x.genus || "" });
    } else if (synonyms.length < 3) synonyms.push(x);
  }
  // Resolve a few synonyms to their accepted name.
  const acc = await Promise.all(synonyms.map((x) => (x.acceptedKey || x.acceptedUsageKey ? gbifSpecies(x.acceptedKey || x.acceptedUsageKey) : gbifSpecies(x.key))));
  acc.forEach((a: any, i) => {
    const k = a?.acceptedKey || a?.key;
    if (!a || !k) return;
    const target = a.acceptedKey ? null : a;
    const name = target ? a.canonicalName : (a.accepted || "").replace(/\s+[A-Z(].*$/, "");
    if (name) push({ key: k, name, author: "", family: a.family || "", genus: a.genus || "", via: `synonym: ${synonyms[i].canonicalName}` });
  });
  const ql = q.toLowerCase();
  for (const h of out) h.score = h.name.toLowerCase() === ql ? 0 : h.name.toLowerCase().startsWith(ql) ? 2 : h.via ? 4 : 3;
  vern.forEach((v, i) => {
    const names: string[] = (v.vernacularNames || []).map((n: any) => String(n.vernacularName || ""));
    const exact = names.find((n) => n.toLowerCase().split(/[,;]\s*/).includes(ql));
    const common = exact || names.find((n) => n.toLowerCase().includes(ql));
    const key = v.key;
    const existing = out.find((h) => h.key === key);
    if (existing) {
      existing.common = existing.common || common;
      existing.score = Math.min(existing.score ?? 9, exact ? 0.5 + i / 100 : 2.5);
      return;
    }
    push({ key, name: v.canonicalName || v.scientificName, author: v.authorship || "", family: v.family || "", genus: v.genus || "", common, score: exact ? 0.5 + i / 100 : 2.5 + i / 100 });
  });
  skPlants.forEach(({ e, plant }, i) => {
    const m = skMatches[i];
    if (!m) return;
    const key = m.acceptedUsageKey || m.usageKey;
    const label = `${e.sa} · ${iastToDevanagari(e.sa)}${e.parts.length ? ` (${e.parts.join(", ")})` : ""}`;
    const existing = out.find((h) => h.key === key);
    if (existing) {
      existing.sanskrit = existing.sanskrit || label;
      existing.score = Math.min(existing.score ?? 9, 0.3 + i / 100);
      return;
    }
    out.push({ key, name: m.species || m.canonicalName || plant, author: "", family: m.family || "", genus: m.genus || "", sanskrit: label, score: 0.3 + i / 100 });
  });
  out.sort((a, b) => (a.score ?? 9) - (b.score ?? 9));
  return NextResponse.json({ items: out.slice(0, 10).map(({ score, ...h }) => h) }, { headers: { "Cache-Control": "public, s-maxage=86400" } });
}
