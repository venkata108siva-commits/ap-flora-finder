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

export type Paper = { title: string; authors: string; journal: string; year: string; cited: number; open: boolean; href: string };

export async function europePMC(query: string, n = 8): Promise<{ total: number; items: Paper[] }> {
  const d = await safe(
    getJSON<any>(
      `https://www.ebi.ac.uk/europepmc/webservices/rest/search?${qs({ query, format: "json", pageSize: n, resultType: "lite" })}`,
      { timeout: 15000 },
    ),
  );
  const res: any[] = d?.resultList?.result || [];
  const seen = new Set<string>();
  const items: Paper[] = [];
  for (const p of res) {
    const title = stripTags(p.title || "").replace(/\.$/, "");
    const k = title.toLowerCase();
    if (!title || seen.has(k)) continue;
    seen.add(k);
    items.push({
      title,
      authors: shortAuthors(p.authorString || ""),
      journal: p.journalTitle || (p.source === "PPR" ? "Preprint" : ""),
      year: p.pubYear || "",
      cited: p.citedByCount || 0,
      open: p.isOpenAccess === "Y",
      href: p.doi ? `https://doi.org/${p.doi}` : `https://europepmc.org/article/${p.source}/${p.id}`,
    });
  }
  return { total: d?.hitCount || 0, items };
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

export { UA };
