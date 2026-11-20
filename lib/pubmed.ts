// NCBI PubMed E-utilities: fast, official MeSH-indexed literature.
// Rate limit is 3 requests/second without an API key, so all calls go through a small pacer.
import { getJSON, getText, qs, safe } from "./http";
import type { Paper } from "./sources";

const EU = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
const KEY = process.env.NCBI_API_KEY; // optional: raises the limit to 10/s
const GAP = KEY ? 110 : 360;

let next = 0;
async function pace() {
  const now = Date.now();
  const wait = Math.max(0, next - now);
  next = Math.max(now, next) + GAP;
  if (wait) await new Promise((r) => setTimeout(r, wait));
}

async function eu<T>(path: string, params: Record<string, string | number>, kind: "json" | "text" = "json"): Promise<T> {
  const url = `${EU}/${path}?${qs({ ...params, tool: "globalflora", ...(KEY ? { api_key: KEY } : {}) })}`;
  let last: any;
  for (let i = 0; i < 3; i++) {
    await pace();
    try {
      return (kind === "json" ? await getJSON<T>(url, { timeout: 15000 }) : ((await getText(url, 20000)) as any)) as T;
    } catch (e) {
      last = e; // 429 / 5xx: back off and retry
      await new Promise((r) => setTimeout(r, 700 * (i + 1)));
    }
  }
  throw last;
}

export async function pmCount(term: string): Promise<number> {
  const d = await safe(eu<any>("esearch.fcgi", { db: "pubmed", term, rettype: "count", retmode: "json" }));
  return d ? Number(d.esearchresult?.count) || 0 : -1;
}

export async function pmCounts(terms: Record<string, string>): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  await Promise.all(Object.entries(terms).map(async ([k, t]) => (out[k] = await pmCount(t))));
  return out;
}

export async function pmSearch(term: string, retmax = 20, sort: "relevance" | "pub_date" = "relevance"): Promise<{ total: number; ids: string[] }> {
  const d = await safe(eu<any>("esearch.fcgi", { db: "pubmed", term, retmax, sort, retmode: "json" }));
  return { total: Number(d?.esearchresult?.count) || 0, ids: d?.esearchresult?.idlist || [] };
}

function shortAuthors(a: { name: string }[] = []) {
  const n = a.map((x) => x.name);
  return n.length > 3 ? `${n.slice(0, 3).join(", ")} et al.` : n.join(", ");
}

export async function pmSummary(ids: string[]): Promise<Paper[]> {
  if (!ids.length) return [];
  const d = await safe(eu<any>("esummary.fcgi", { db: "pubmed", id: ids.join(","), retmode: "json" }));
  const r = d?.result || {};
  return ids
    .map((id) => r[id])
    .filter((p: any) => p && p.title)
    .map((p: any) => {
      const doi = (p.articleids || []).find((x: any) => x.idtype === "doi")?.value;
      const types: string[] = p.pubtype || [];
      return {
        id: String(p.uid),
        title: String(p.title).replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/\.$/, ""),
        authors: shortAuthors(p.authors),
        journal: p.fulljournalname || p.source || "",
        year: String(p.pubdate || p.epubdate || "").slice(0, 4),
        cited: 0,
        open: (p.articleids || []).some((x: any) => x.idtype === "pmc"),
        href: doi ? `https://doi.org/${doi}` : `https://pubmed.ncbi.nlm.nih.gov/${p.uid}/`,
        types,
        source: types.some((t) => /preprint/i.test(t)) ? "PPR" : "MED",
      } as Paper;
    });
}

/** MeSH headings per paper (MEDLINE format), used to find which diseases a plant is studied for. */
export async function pmMesh(ids: string[]): Promise<string[][]> {
  if (!ids.length) return [];
  const txt = await safe(eu<string>("efetch.fcgi", { db: "pubmed", id: ids.join(","), rettype: "medline", retmode: "text" }, "text"));
  if (!txt) return [];
  return txt.split(/\n\s*\nPMID- /).map((rec) =>
    [...rec.matchAll(/^MH  - \*?([^/\n]+)/gm)].map((m) => m[1].trim()),
  );
}

/** Citation counts from Europe PMC for a batch of PMIDs (optional enrichment; skipped if slow). */
export async function citations(ids: string[], timeout = 8000): Promise<Record<string, number>> {
  if (!ids.length) return {};
  const query = `(${ids.map((i) => `EXT_ID:${i}`).join(" OR ")}) AND SRC:MED`;
  const d = await safe(
    getJSON<any>(`https://www.ebi.ac.uk/europepmc/webservices/rest/search?${qs({ query, format: "json", pageSize: ids.length, resultType: "lite" })}`, { timeout }),
  );
  const out: Record<string, number> = {};
  for (const p of d?.resultList?.result || []) out[String(p.id)] = p.citedByCount || 0;
  return out;
}

/** Search + summaries + (best-effort) citation counts. */
export async function pmPapers(term: string, retmax = 20, withCites = true): Promise<{ total: number; items: Paper[] }> {
  const s = await pmSearch(term, retmax);
  const items = await pmSummary(s.ids);
  if (withCites && items.length) {
    const c = await citations(items.map((p) => p.id));
    for (const p of items) p.cited = c[p.id] || 0;
  }
  return { total: s.total, items };
}

export const pubmedUrl = (term: string) => `https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(term)}`;
