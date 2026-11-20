// Data collectors for each external database. All run on the server and are cached for a day.
import { cleanName, getJSON, getText, parseCSV, qs, safe, stripTags, UA } from "./http";

/* ---------------- GBIF ---------------- */

export type GbifMatch = {
  usageKey: number;
  acceptedUsageKey?: number;
  scientificName: string;
  canonicalName?: string;
  status?: string;
  rank?: string;
  kingdom?: string;
  phylum?: string;
  class?: string;
  order?: string;
  family?: string;
  genus?: string;
  species?: string;
  matchType?: string;
};

export async function gbifMatch(name: string): Promise<GbifMatch | null> {
  const d = await safe(getJSON<GbifMatch>(`https://api.gbif.org/v1/species/match?${qs({ name, kingdom: "Plantae", strict: "false" })}`));
  return d && d.usageKey && d.matchType !== "NONE" ? d : null;
}

export function gbifKey(m: GbifMatch): number {
  return m.acceptedUsageKey || m.usageKey;
}

export async function gbifSpecies(key: number) {
  return safe(getJSON<any>(`https://api.gbif.org/v1/species/${key}`));
}

export async function gbifVernacular(key: number) {
  const d = await safe(getJSON<any>(`https://api.gbif.org/v1/species/${key}/vernacularNames?limit=500`));
  return (d?.results || []) as { vernacularName: string; language?: string; source?: string; country?: string }[];
}

export async function gbifDistributions(key: number) {
  const d = await safe(getJSON<any>(`https://api.gbif.org/v1/species/${key}/distributions?limit=500`));
  return (d?.results || []) as {
    locality?: string;
    country?: string;
    locationId?: string;
    establishmentMeans?: string;
    threatStatus?: string;
    endemic?: boolean;
    source?: string;
  }[];
}

export async function gbifSynonyms(key: number) {
  const d = await safe(getJSON<any>(`https://api.gbif.org/v1/species/${key}/synonyms?limit=60`));
  return (d?.results || []) as { scientificName: string; taxonomicStatus?: string; key: number }[];
}

export async function gbifIucn(key: number) {
  return safe(getJSON<{ code?: string; category?: string; iucnTaxonID?: string }>(`https://api.gbif.org/v1/species/${key}/iucnRedListCategory`));
}

export async function gbifOccurrence(params: Record<string, string | number | undefined>) {
  return safe(getJSON<any>(`https://api.gbif.org/v1/occurrence/search?${qs(params)}`));
}

/* ---------------- NCBI Taxonomy ---------------- */

export async function ncbiTaxon(name: string): Promise<{ id: string; lineage: { rank: string; name: string }[]; division?: string } | null> {
  const s = await safe(
    getJSON<any>(
      `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?${qs({ db: "taxonomy", term: `"${cleanName(name)}"[Scientific Name]`, retmode: "json", tool: "globalflora" })}`,
    ),
  );
  const id = s?.esearchresult?.idlist?.[0];
  if (!id) return null;
  const xml = await safe(getText(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?${qs({ db: "taxonomy", id, retmode: "xml", tool: "globalflora" })}`));
  if (!xml) return null;
  const lineage: { rank: string; name: string }[] = [];
  const lin = xml.match(/<LineageEx>([\s\S]*?)<\/LineageEx>/);
  if (lin) {
    for (const t of lin[1].matchAll(/<Taxon>\s*<TaxId>\d+<\/TaxId>\s*<ScientificName>([^<]+)<\/ScientificName>\s*<Rank>([^<]+)<\/Rank>/g)) {
      lineage.push({ name: decode(t[1]), rank: t[2] });
    }
  }
  const self = xml.match(/<Taxon>\s*<TaxId>\d+<\/TaxId>\s*<ScientificName>([^<]+)<\/ScientificName>[\s\S]*?<Rank>([^<]+)<\/Rank>/);
  if (self) lineage.push({ name: decode(self[1]), rank: self[2] });
  const division = xml.match(/<Division>([^<]+)<\/Division>/)?.[1];
  return { id, lineage, division };
}

function decode(s: string) {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}

/* ---------------- Wikidata ---------------- */

export async function wikidata(query: string): Promise<any[]> {
  const d = await safe(
    getJSON<any>(`https://query.wikidata.org/sparql?${qs({ query, format: "json" })}`, {
      timeout: 20000,
      headers: { Accept: "application/sparql-results+json" },
    }),
  );
  return d?.results?.bindings || [];
}

/* ---------------- Europe PMC ---------------- */

export type Paper = {
  id: string;
  title: string;
  authors: string;
  journal: string;
  year: string;
  cited: number;
  open: boolean;
  href: string;
  types: string[];
  source: string;
  tier?: number;
  tierLabel?: string;
};

const EPMC = "https://www.ebi.ac.uk/europepmc/webservices/rest/search";
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Europe PMC call with retries, so brief hiccups never surface as empty sections. */
async function epmc(params: Record<string, string | number>, timeout = 15000): Promise<any> {
  let last: any;
  for (let i = 0; i < 3; i++) {
    try {
      const d = await getJSON<any>(`${EPMC}?${qs({ format: "json", ...params })}`, { timeout });
      if (d && !d.errCode) return d;
      last = new Error(d?.errMsg || "Europe PMC error");
    } catch (e) {
      last = e;
    }
    await pause(600 * (i + 1));
  }
  throw last;
}

function toPaper(p: any): Paper {
  const types = String(p.pubType || (p.pubTypeList?.pubType || []).join("; ") || "")
    .split(/;\s*/)
    .map((t: string) => t.trim())
    .filter(Boolean);
  return {
    id: String(p.id),
    title: stripTags(p.title || "").replace(/\.$/, ""),
    authors: shortAuthors(p.authorString || ""),
    journal: p.journalTitle || p.journalInfo?.journal?.title || (p.source === "PPR" ? "Preprint" : ""),
    year: p.pubYear || "",
    cited: p.citedByCount || 0,
    open: p.isOpenAccess === "Y",
    href: p.doi ? `https://doi.org/${p.doi}` : `https://europepmc.org/article/${p.source}/${p.id}`,
    types,
    source: p.source || "",
  };
}

function dedupe(items: Paper[]): Paper[] {
  const seen = new Set<string>();
  return items.filter((p) => {
    const k = p.title.toLowerCase();
    if (!p.title || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export async function europePMC(query: string, n = 8, sort?: "cited"): Promise<{ total: number; items: Paper[] }> {
  const d = await safe(epmc({ query, pageSize: n, resultType: "lite", ...(sort === "cited" ? { sort: "CITED desc" } : {}) }));
  return { total: d?.hitCount || 0, items: dedupe((d?.resultList?.result || []).map(toPaper)) };
}

export async function epmcCount(query: string): Promise<number> {
  const d = await safe(epmc({ query, pageSize: 1, resultType: "idlist" }, 12000));
  return d ? Number(d.hitCount) || 0 : -1;
}

export async function epmcCounts(queries: Record<string, string>, concurrency = 4): Promise<Record<string, number>> {
  const keys = Object.keys(queries);
  const out: Record<string, number> = {};
  let i = 0;
  const worker = async () => {
    while (i < keys.length) {
      const k = keys[i++];
      out[k] = await epmcCount(queries[k]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, keys.length) }, worker));
  return out;
}

/** MeSH headings of the most-cited indexed papers (used to find which diseases a plant is studied for). */
export async function epmcMesh(query: string, n = 100): Promise<string[][]> {
  const d = await safe(epmc({ query: `${query} AND SRC:MED`, pageSize: n, resultType: "core", sort: "CITED desc" }, 20000));
  return (d?.resultList?.result || []).map((p: any) => (p.meshHeadingList?.meshHeading || []).map((m: any) => m.descriptorName as string));
}

function shortAuthors(s: string) {
  const a = s.replace(/\.$/, "").split(", ");
  return a.length > 3 ? `${a.slice(0, 3).join(", ")} et al.` : a.join(", ");
}

/* ---------------- Wikipedia (unverified, general web) ---------------- */

export async function wikiSummary(name: string) {
  return safe(getJSON<any>(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(name.replace(/ /g, "_"))}`, { timeout: 8000 }));
}

/** Returns sections of the English Wikipedia article as {heading: text}. */
export async function wikiSections(name: string): Promise<{ title: string; url: string; sections: Record<string, string> } | null> {
  const d = await safe(
    getJSON<any>(
      `https://en.wikipedia.org/w/api.php?${qs({ action: "query", prop: "extracts", explaintext: 1, titles: name, format: "json", redirects: 1 })}`,
      { timeout: 8000 },
    ),
  );
  const page: any = d && Object.values(d.query?.pages || {})[0];
  if (!page?.extract) return null;
  const sections: Record<string, string> = {};
  const parts = String(page.extract).split(/\n(=+) ?([^=\n]+?) ?\1\n/);
  sections["_intro"] = parts[0];
  for (let i = 1; i < parts.length; i += 3) sections[parts[i + 1].trim().toLowerCase()] = (parts[i + 2] || "").trim();
  return { title: page.title, url: `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, "_"))}`, sections };
}

export function pickWiki(sections: Record<string, string>, keys: string[], max = 900): { heading: string; text: string } | null {
  for (const [h, t] of Object.entries(sections)) {
    if (h === "_intro" || t.length < 60) continue;
    if (keys.some((k) => h.includes(k))) {
      const text = t.length > max ? t.slice(0, max).replace(/\s+\S*$/, "") + "…" : t;
      return { heading: h.replace(/^\w/, (c) => c.toUpperCase()), text };
    }
  }
  return null;
}

/* ---------------- USDA Dr. Duke's Phytochemical Database ---------------- */

export type DukeRow = { chemical: string; activities: number; part: string; low: number | null; high: number | null; sd: string; ref: string };

export async function dukeChemicals(name: string): Promise<{ url: string; csv: string; rows: DukeRow[] } | null> {
  const slug = "plant-" + cleanName(name).toLowerCase().replace(/×/g, "x").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const url = `https://phytochem.nal.usda.gov/${slug}`;
  const html = await safe(getText(url, 12000));
  if (!html) return null;
  const id = html.match(/plant-chemicals-csv-export\/(\d+)/)?.[1];
  if (!id) return null;
  const csvUrl = `https://phytochem.nal.usda.gov/plant-chemicals-csv-export/${id}?page&_format=csv`;
  const csv = await safe(getText(csvUrl, 15000));
  if (!csv) return null;
  const all = parseCSV(csv);
  const rows: DukeRow[] = [];
  for (const r of all.slice(1)) {
    if (r.length < 7) continue;
    rows.push({
      chemical: r[0].trim(),
      activities: Number(r[1]) || 0,
      part: r[2].trim() || "Plant",
      low: num(r[3]),
      high: num(r[4]),
      sd: r[5],
      ref: r[6].replace(/\s*\*\s*$/, "").trim(),
    });
  }
  return { url, csv: csvUrl, rows };
}

function num(s: string): number | null {
  const n = Number(s);
  return s && !isNaN(n) && /\d/.test(s) ? n : null;
}

/* ---------------- USDA Dr. Duke's Ethnobotanical Database ---------------- */

export type EthnoRow = { use: string; region: string; ref: string };

export async function dukeEthno(name: string): Promise<{ url: string; csv: string; rows: EthnoRow[] } | null> {
  const slug = "ethnobotanical-plant-" + cleanName(name).toLowerCase().replace(/×/g, "x").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const url = `https://phytochem.nal.usda.gov/${slug}`;
  const html = await safe(getText(url, 12000));
  if (!html) return null;
  const id = html.match(/ethnobotanical-plant-uses-csv-export\/(\d+)/)?.[1];
  if (!id) return null;
  const csvUrl = `https://phytochem.nal.usda.gov/ethnobotanical-plant-uses-csv-export/${id}?page&_format=csv`;
  const csv = await safe(getText(csvUrl, 15000));
  if (!csv) return null;
  const rows: EthnoRow[] = [];
  const seen = new Set<string>();
  for (const r of parseCSV(csv).slice(1)) {
    if (r.length < 2 || !r[0].trim()) continue;
    const row = { use: r[0].trim(), region: (r[1] || "").trim() || "Not stated", ref: (r[2] || "").replace(/\s*\*\s*$/, "").trim() };
    const k = `${row.use}|${row.region}`.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    rows.push(row);
  }
  return { url, csv: csvUrl, rows };
}

/* ---------------- GBIF photos ---------------- */

export type Photo = { thumb: string; full: string; credit: string; license: string; href: string; part: string; place?: string; date?: string };

const PLANTNET_DATASET = "7a3679ef-5582-4aaa-81f0-8c2545cafc81"; // Pl@ntNet observations (expert-reviewed, organ-labelled)

function md5hex(s: string): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require("node:crypto").createHash("md5").update(s).digest("hex");
}

function licenseLabel(l?: string): string {
  const s = (l || "").toLowerCase();
  if (!s) return "Licence not stated";
  if (s.includes("zero") || s.includes("cc0")) return "CC0";
  const m = s.match(/(by(?:-nc)?(?:-sa|-nd)?)/);
  return m ? `CC ${m[1].toUpperCase()}` : l!;
}

function toPhotos(results: any[], partOf: (m: any, o: any) => string, max: number): Photo[] {
  const out: Photo[] = [];
  for (const o of results) {
    for (const m of o.media || []) {
      if (m.type && m.type !== "StillImage") continue;
      if (!m.identifier) continue;
      const lic = licenseLabel(m.license || o.license);
      if (/ND/.test(lic) && /NC/.test(lic)) continue;
      const h = md5hex(m.identifier);
      out.push({
        thumb: `https://api.gbif.org/v1/image/cache/400x/occurrence/${o.key}/media/${h}`,
        full: `https://api.gbif.org/v1/image/cache/1200x/occurrence/${o.key}/media/${h}`,
        credit: m.creator || m.rightsHolder || o.recordedBy || o.institutionCode || "Unknown",
        license: lic,
        href: `https://www.gbif.org/occurrence/${o.key}`,
        part: partOf(m, o),
        place: [o.stateProvince, o.country].filter(Boolean).join(", ") || undefined,
        date: o.eventDate ? String(o.eventDate).slice(0, 10) : undefined,
      });
      break; // one photo per record keeps the gallery varied
    }
    if (out.length >= max) break;
  }
  return out;
}

export async function gbifPhotos(key: number) {
  const [pn, field, herb] = await Promise.all([
    gbifOccurrence({ taxonKey: key, datasetKey: PLANTNET_DATASET, mediaType: "StillImage", limit: 300 }),
    gbifOccurrence({ taxonKey: key, mediaType: "StillImage", basisOfRecord: "HUMAN_OBSERVATION", limit: 40 }),
    gbifOccurrence({ taxonKey: key, mediaType: "StillImage", basisOfRecord: "PRESERVED_SPECIMEN", limit: 12 }),
  ]);
  const organ = (m: any) => String(m.title || m.description || "").split(":").pop()!.trim().toLowerCase() || "other";
  const parts = toPhotos(pn?.results || [], organ, 300);
  const seen = new Set(parts.map((p) => p.href));
  const more = toPhotos((field?.results || []).filter((o: any) => !seen.has(`https://www.gbif.org/occurrence/${o.key}`)), () => "field", 18);
  const specimens = toPhotos(herb?.results || [], () => "specimen", 12);
  return { parts, more, specimens, counts: { plantnet: pn?.count || 0, field: field?.count || 0, specimens: herb?.count || 0 } };
}

/* ---------------- GBIF name search ---------------- */

export async function gbifSuggest(q: string) {
  const [sci, vern] = await Promise.all([
    safe(getJSON<any[]>(`https://api.gbif.org/v1/species/suggest?${qs({ q, higherTaxonKey: 6, limit: 10 })}`, { timeout: 8000 })),
    safe(
      getJSON<any>(
        `https://api.gbif.org/v1/species/search?${qs({ q, qField: "VERNACULAR", higherTaxonKey: 6, rank: "SPECIES", status: "ACCEPTED", datasetKey: "d7dddbf4-2cf0-4f39-9b2a-bb099caae36c", limit: 6 })}`,
        { timeout: 8000 },
      ),
    ),
  ]);
  return { sci: sci || [], vern: (vern?.results || []) as any[] };
}

export { UA };
