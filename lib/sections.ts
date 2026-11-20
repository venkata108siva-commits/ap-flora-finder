// Builds the clean, screened content for each of the 9 sections.
import type { Block, Cell, SectionData, SectionId, Source } from "./types";
import { cleanName, fmt, safe } from "./http";
import { PM_TIERS, rank } from "./rank";
import { pmCounts, pmMesh, pmPapers, pmSearch, pubmedUrl } from "./pubmed";
import diseaseNames from "@/data/disease-names.json";
import {
  dukeChemicals,
  dukeEthno,
  gbifPhotos,
  europePMC,
  gbifDistributions,
  gbifIucn,
  gbifKey,
  gbifMatch,
  gbifOccurrence,
  gbifSpecies,
  gbifSynonyms,
  gbifVernacular,
  ncbiTaxon,
  pickWiki,
  wikiSections,
  wikiSummary,
  wikidata,
} from "./sources";

export type Ctx = { name: string; family?: string; powo?: string; country: string; lang: string };

const langNames = new Intl.DisplayNames(["en"], { type: "language" });
const regionNames = new Intl.DisplayNames(["en"], { type: "region" });

export function countryName(code: string) {
  try {
    return regionNames.of(code.toUpperCase()) || code;
  } catch {
    return code;
  }
}
function languageName(code: string) {
  if (!code) return "Unspecified";
  try {
    return langNames.of(code) || code;
  } catch {
    return code;
  }
}

const powoUrl = (id?: string) => (id ? `https://powo.science.kew.org/taxon/urn:lsid:ipni.org:names:${id}` : "");
const gbifUrl = (k: number) => `https://www.gbif.org/species/${k}`;
const ncbiUrl = (id: string) => `https://www.ncbi.nlm.nih.gov/Taxonomy/Browser/wwwtax.cgi?id=${id}`;

function dedupeSources(s: Source[]): Source[] {
  const seen = new Set<string>();
  return s.filter((x) => (x.url && !seen.has(x.url) ? (seen.add(x.url), true) : false));
}

export async function buildSection(id: SectionId, ctx: Ctx): Promise<SectionData> {
  const fn = BUILDERS[id];
  const data = await fn(ctx);
  data.sources = dedupeSources(data.sources);
  return data;
}

/* ===================== 1. OVERVIEW ===================== */

async function overview(ctx: Ctx): Promise<SectionData> {
  const name = cleanName(ctx.name);
  const m = await gbifMatch(name);
  const key = m ? gbifKey(m) : null;
  const [sp, vern, wp, wd] = await Promise.all([
    key ? gbifSpecies(key) : null,
    key ? gbifVernacular(key) : Promise.resolve([]),
    wikiSummary(name),
    wikidata(`SELECT ?item ?n WHERE { ?item wdt:P225 "${name}" . OPTIONAL { ?item wdt:P1843 ?n } } LIMIT 400`),
  ]);
  const blocks: Block[] = [];
  const sources: Source[] = [];

  const facts: Block = { type: "facts", items: [] };
  if (facts.type === "facts") {
    facts.items.push({
      label: "Scientific name",
      value: sp?.scientificName || m?.scientificName || ctx.name,
      italic: true,
      verified: !!m,
    });
    if (m && m.status && m.status !== "ACCEPTED" && sp?.scientificName) {
      facts.items.push({ label: "Accepted name", value: sp.scientificName, italic: true, verified: true });
    }
    facts.items.push({ label: "Family", value: sp?.family || m?.family || ctx.family || "—", verified: !!(sp?.family || m?.family) });
    if (sp?.genus || m?.genus) facts.items.push({ label: "Genus", value: sp?.genus || m?.genus, italic: true, verified: true });
    if (m?.status) facts.items.push({ label: "Taxonomic status", value: title(m.status.toLowerCase().replace(/_/g, " ")), verified: true });
  }
  blocks.push(facts);

  // Local-language names: GBIF checklists (verified) + Wikidata (general web)
  const byLang = new Map<string, { names: Set<string>; verified: boolean }>();
  const add = (lang: string, n: string, verified: boolean) => {
    const L = languageName(lang);
    const v = n.trim();
    if (!v) return;
    const e = byLang.get(L) || { names: new Set<string>(), verified: false };
    const exists = [...e.names].some((x) => x.toLowerCase() === v.toLowerCase());
    if (!exists) e.names.add(v);
    e.verified = e.verified || verified;
    byLang.set(L, e);
  };
  for (const v of vern) add(v.language || "", v.vernacularName, true);
  for (const r of wd) if (r.n?.value) add(r.n["xml:lang"] || "", r.n.value, false);

  const userLang = languageName(ctx.lang);
  const ordered = [...byLang.entries()]
    .filter(([L]) => L !== "Unspecified")
    .sort((a, b) => (a[0] === userLang ? -1 : b[0] === userLang ? 1 : a[0] === "English" ? -1 : b[0] === "English" ? 1 : a[0].localeCompare(b[0])));

  if (ordered.length) {
    const top = ordered.slice(0, 6);
    blocks.push({
      type: "facts",
      items: top.map(([L, e]) => ({ label: `${L} name${e.names.size > 1 ? "s" : ""}`, value: [...e.names].slice(0, 4).join(", "), verified: e.verified })),
    });
  }

  if (wp?.extract) {
    blocks.push({
      type: "text",
      title: "Summary",
      text: wp.extract,
      verified: false,
      image: wp.thumbnail?.source,
      via: "Wikipedia",
    });
    sources.push({ label: `Wikipedia – ${wp.title}`, url: wp.content_urls?.desktop?.page || "https://en.wikipedia.org", verified: false });
  }

  if (ordered.length > 6) {
    blocks.push({
      type: "deep",
      title: `All common names · ${ordered.length} languages`,
      blocks: [
        {
          type: "table",
          verified: true,
          columns: ["Language", "Names", "Source"],
          rows: ordered.map(([L, e]) => [L, [...e.names].join(", "), e.verified ? "GBIF checklists ✓" : "Wikidata"]),
        },
      ],
    });
  }

  if (key) sources.push({ label: `GBIF Backbone Taxonomy · key ${key}`, url: gbifUrl(key), verified: true });
  if (vern.length) sources.push({ label: "GBIF vernacular names (from published checklists)", url: `${gbifUrl(key!)}/vernaculars`, verified: true });
  if (ctx.powo) sources.push({ label: "Plants of the World Online – Royal Botanic Gardens, Kew", url: powoUrl(ctx.powo), verified: true });
  sources.push({ label: "Pl@ntNet identification service", url: "https://identify.plantnet.org/", verified: true });
  if (wd[0]?.item) sources.push({ label: "Wikidata taxon record", url: wd[0].item.value, verified: false });
  return { blocks, sources };
}

/* ===================== 2. TAXONOMY ===================== */

async function taxonomy(ctx: Ctx): Promise<SectionData> {
  const name = cleanName(ctx.name);
  const [m, nc] = await Promise.all([gbifMatch(name), ncbiTaxon(name)]);
  if (!m && !nc) return empty("No taxonomy record was found in GBIF or NCBI for this name.");
  const key = m ? gbifKey(m) : null;
  const [sp, syn] = await Promise.all([key ? gbifSpecies(key) : null, key ? gbifSynonyms(key) : Promise.resolve([])]);
  const nr = Object.fromEntries((nc?.lineage || []).map((x) => [x.rank, x.name]));
  const g: any = sp || m || {};
  const rows: [string, string | undefined, string][] = [
    ["Kingdom", g.kingdom || nr.kingdom, g.kingdom ? "GBIF" : "NCBI"],
    ["Phylum (Division)", g.phylum || nr.phylum, g.phylum ? "GBIF" : "NCBI"],
    ["Class", g.class || nr.class, g.class ? "GBIF" : "NCBI"],
    ["Subclass", nr.subclass, "NCBI"],
    ["Order", g.order || nr.order, g.order ? "GBIF" : "NCBI"],
    ["Family", g.family || nr.family, g.family ? "GBIF" : "NCBI"],
    ["Subfamily", nr.subfamily, "NCBI"],
    ["Tribe", nr.tribe, "NCBI"],
    ["Genus", g.genus || nr.genus, g.genus ? "GBIF" : "NCBI"],
    ["Species", g.species || nr.species || name, g.species ? "GBIF" : "NCBI"],
  ];
  const tableRows: Cell[][] = rows
    .filter(([, v]) => !!v)
    .map(([r, v, s]) => [r, { text: v!, italic: ["Genus", "Species"].includes(r) }, { text: `${s} ✓`, muted: true }]);

  const blocks: Block[] = [
    { type: "table", verified: true, columns: ["Rank", "Name", "Source"], rows: tableRows },
    {
      type: "facts",
      items: [
        ...(sp?.authorship ? [{ label: "Authority", value: sp.authorship, verified: true }] : []),
        ...(sp?.publishedIn ? [{ label: "First published in", value: sp.publishedIn, verified: true }] : []),
        ...(m?.status ? [{ label: "Name status", value: title(m.status.toLowerCase().replace(/_/g, " ")), verified: true }] : []),
      ],
    },
  ];
  const synonyms = syn.filter((s) => s.scientificName).slice(0, 60);
  if (synonyms.length) {
    blocks.push({
      type: "deep",
      title: `Synonyms · ${synonyms.length}${syn.length >= 60 ? "+" : ""}`,
      blocks: [
        {
          type: "table",
          verified: true,
          columns: ["Synonym", "Status"],
          rows: synonyms.map((s) => [
            { text: s.scientificName, italic: true, href: gbifUrl(s.key) },
            { text: title((s.taxonomicStatus || "synonym").toLowerCase().replace(/_/g, " ")), muted: true },
          ]),
        },
      ],
    });
  }
  const sources: Source[] = [];
  if (key) sources.push({ label: `GBIF Backbone Taxonomy · key ${key}`, url: gbifUrl(key), verified: true });
  if (nc) sources.push({ label: `NCBI Taxonomy · ID ${nc.id}`, url: ncbiUrl(nc.id), verified: true });
  if (ctx.powo) sources.push({ label: "Plants of the World Online (Kew)", url: powoUrl(ctx.powo), verified: true });
  return { blocks, sources };
}

/* ===================== 3. SYSTEMATICS ===================== */

async function systematics(ctx: Ctx): Promise<SectionData> {
  const name = cleanName(ctx.name);
  const nc = await ncbiTaxon(name);
  if (!nc) return empty("No phylogenetic lineage was found in NCBI Taxonomy for this name.");
  const skip = new Set(["cellular organisms"]);
  const items = nc.lineage
    .filter((x) => !skip.has(x.name))
    .map((x) => ({ rank: x.rank === "no rank" || x.rank === "clade" ? "Clade" : title(x.rank), name: x.name, clade: x.rank === "no rank" || x.rank === "clade" }));
  const angio = items.find((x) => /Magnoliopsida|Mesangiospermae/.test(x.name));
  const majorClade = items.filter((x) => x.clade).map((x) => x.name).find((n) => /^(rosids|asterids|monocots|commelinids|eudicots|fabids|malvids|lamiids|campanulids|magnoliids)$/i.test(n));
  const blocks: Block[] = [
    {
      type: "facts",
      items: [
        { label: "Classification system", value: "Modern phylogenetic (consistent with APG IV)", verified: true },
        ...(majorClade ? [{ label: "Major clade", value: title(majorClade), verified: true }] : []),
        { label: "Flowering plant", value: angio ? "Yes (angiosperm)" : "No / not recorded", verified: true },
        ...(nc.division ? [{ label: "NCBI division", value: nc.division, verified: true }] : []),
      ],
    },
    { type: "lineage", verified: true, items },
    {
      type: "note",
      tone: "info",
      text: "Bentham & Hooker's classical system is not available in any open database, so it is not shown here to avoid unverified data.",
    },
  ];
  return {
    blocks,
    sources: [
      { label: `NCBI Taxonomy · ID ${nc.id}`, url: ncbiUrl(nc.id), verified: true },
      { label: "Angiosperm Phylogeny Website (APG IV)", url: "https://www.mobot.org/MOBOT/research/APweb/", verified: true },
    ],
  };
}

/* ===================== 4. DISTRIBUTION ===================== */

async function distribution(ctx: Ctx): Promise<SectionData> {
  const name = cleanName(ctx.name);
  const m = await gbifMatch(name);
  if (!m) return empty("No distribution records were found in GBIF for this name.");
  const key = gbifKey(m);
  const cc = ctx.country.toUpperCase();
  const cname = countryName(cc);
  const [world, here, recent, dist] = await Promise.all([
    gbifOccurrence({ taxonKey: key, limit: 0, facet: "country", facetLimit: 12 }),
    gbifOccurrence({ taxonKey: key, country: cc, limit: 0 }),
    gbifOccurrence({ taxonKey: key, country: cc, limit: 8, hasCoordinate: "true", occurrenceStatus: "PRESENT" }),
    gbifDistributions(key),
  ]);
  const total = world?.count || 0;
  const inC = here?.count || 0;
  const facets: { name: string; count: number }[] = world?.facets?.[0]?.counts || [];
  const rank = facets.findIndex((f) => f.name === cc);

  const blocks: Block[] = [
    {
      type: "stats",
      items: [
        { label: "Records worldwide", value: fmt(total), verified: true },
        { label: `Records in ${cname}`, value: fmt(inC), verified: true },
        { label: "Countries with records", value: facets.length >= 12 ? "12+" : String(facets.length), verified: true },
        ...(rank >= 0 ? [{ label: `${cname} ranks`, value: `#${rank + 1}`, verified: true }] : []),
      ],
    },
    {
      type: "map",
      title: "Where it has been recorded",
      base: "https://tile.gbif.org/3857/omt/0/0/0@2x.png?style=gbif-light",
      overlay: `https://api.gbif.org/v2/map/occurrence/density/0/0/0@2x.png?srs=EPSG:3857&taxonKey=${key}&style=green.poly&bin=hex&hexPerTile=60`,
      verified: true,
      caption: "Each hexagon = verified occurrence records (GBIF).",
    },
  ];
  if (facets.length) {
    blocks.push({
      type: "bars",
      title: "Top countries by records",
      verified: true,
      items: facets.map((f) => ({ label: countryName(f.name), value: f.count, highlight: f.name === cc })),
    });
  }

  // Native vs introduced (WCVP via GBIF)
  const wcvp = dist.filter((d) => /World Checklist of Vascular Plants|WCVP/i.test(d.source || ""));
  const native = uniq(wcvp.filter((d) => !d.establishmentMeans).map((d) => d.locality || ""));
  const intro = uniq(wcvp.filter((d) => d.establishmentMeans === "INTRODUCED").map((d) => d.locality || ""));
  if (native.length || intro.length) {
    blocks.push({
      type: "chips",
      title: `Native range · ${native.length} regions`,
      verified: true,
      items: native.slice(0, 40).map((l) => ({ label: l, tone: "native" as const })),
    });
    if (intro.length)
      blocks.push({
        type: "chips",
        title: `Introduced in · ${intro.length} regions`,
        verified: true,
        items: intro.slice(0, 40).map((l) => ({ label: l, tone: "introduced" as const })),
      });
  }

  const recs = (recent?.results || []) as any[];
  if (recs.length) {
    blocks.push({
      type: "records",
      title: `Latest records in ${cname}`,
      verified: true,
      items: recs.map((o) => ({
        place: [o.locality, o.county || o.municipality, o.stateProvince].filter(Boolean).slice(0, 2).join(", ") || cname,
        date: o.eventDate ? String(o.eventDate).slice(0, 10) : o.year ? String(o.year) : "Date not given",
        kind: title(String(o.basisOfRecord || "").replace(/_/g, " ").toLowerCase()),
        href: `https://www.gbif.org/occurrence/${o.key}`,
      })),
    });
  } else {
    blocks.push({ type: "note", tone: "info", text: `No GBIF records from ${cname} yet. The plant may be cultivated or under-recorded there.` });
  }

  if (native.length > 40 || intro.length > 40) {
    blocks.push({
      type: "deep",
      title: "Full native and introduced range",
      blocks: [
        {
          type: "table",
          verified: true,
          columns: ["Region", "Status"],
          rows: [...native.map((n) => [n, "Native"]), ...intro.map((n) => [n, "Introduced"])],
          filterColumn: 1,
        },
      ],
    });
  }

  return {
    blocks,
    sources: [
      { label: `GBIF occurrence records – ${cname}`, url: `https://www.gbif.org/occurrence/search?taxon_key=${key}&country=${cc}`, verified: true },
      { label: "GBIF occurrence records – worldwide", url: `https://www.gbif.org/occurrence/search?taxon_key=${key}`, verified: true },
      ...(wcvp.length ? [{ label: "World Checklist of Vascular Plants (Kew) via GBIF", url: `${gbifUrl(key)}/metrics`, verified: true }] : []),
      ...(ctx.powo ? [{ label: "Native range map – Plants of the World Online (Kew)", url: powoUrl(ctx.powo), verified: true }] : []),
    ],
  };
}

/* ===================== 5. CONSERVATION ===================== */

async function conservation(ctx: Ctx): Promise<SectionData> {
  const name = cleanName(ctx.name);
  const m = await gbifMatch(name);
  const key = m ? gbifKey(m) : null;
  const [iucn, dist, wd] = await Promise.all([
    key ? gbifIucn(key) : null,
    key ? gbifDistributions(key) : Promise.resolve([]),
    wikidata(
      `SELECT ?t ?statusLabel ?pLabel WHERE { ?t wdt:P225 "${name}" . OPTIONAL { ?t wdt:P141 ?status } OPTIONAL { ?t wdt:P183 ?p } SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } } LIMIT 50`,
    ),
  ]);
  const blocks: Block[] = [];
  const sources: Source[] = [];
  const cc = ctx.country.toUpperCase();
  const cname = countryName(cc);

  if (iucn?.code && iucn.code !== "NE") {
    blocks.push({ type: "redlist", code: iucn.code, verified: true });
    sources.push({
      label: "IUCN Red List of Threatened Species",
      url: iucn.iucnTaxonID ? `https://www.iucnredlist.org/species/${iucn.iucnTaxonID}` : `https://www.iucnredlist.org/search?query=${encodeURIComponent(name)}`,
      verified: true,
    });
  } else {
    const wdStatus = wd.find((r) => r.statusLabel)?.statusLabel?.value as string | undefined;
    const code = wdStatus ? IUCN_FROM_LABEL[wdStatus.toLowerCase()] : undefined;
    if (code) {
      blocks.push({ type: "redlist", code, verified: false });
      blocks.push({ type: "note", tone: "info", text: "IUCN status taken from Wikidata (general web data); confirm on the IUCN Red List." });
    } else {
      blocks.push({ type: "redlist", code: "NE", verified: true });
    }
    sources.push({ label: "IUCN Red List search", url: `https://www.iucnredlist.org/search?query=${encodeURIComponent(name)}`, verified: true });
  }

  // Status in the selected country (WCVP, via GBIF)
  const wcvp = dist.filter((d) => /World Checklist of Vascular Plants|WCVP/i.test(d.source || ""));
  const facts: { label: string; value: string; verified?: boolean }[] = [];
  const inCountry = wcvp.filter((d) => inCountryRegion(d.locality || "", cc, cname));
  if (inCountry.length) {
    const st = inCountry.some((d) => !d.establishmentMeans) ? "Native" : "Introduced";
    facts.push({ label: `Status in ${cname}`, value: st, verified: true });
  } else if (wcvp.length) {
    facts.push({ label: `Status in ${cname}`, value: "Not listed for this country in Kew's World Checklist", verified: true });
  }
  const native = uniq(wcvp.filter((d) => !d.establishmentMeans).map((d) => d.locality || ""));
  if (native.length) facts.push({ label: "Native regions", value: String(native.length), verified: true });

  // Endemism
  const endemicChecklist = uniq(dist.filter((d) => d.endemic).map((d) => d.locality || d.country || ""));
  const endemicWd = uniq(wd.map((r) => r.pLabel?.value).filter(Boolean));
  if (endemicChecklist.length) facts.push({ label: "Endemic to", value: endemicChecklist.join(", "), verified: true });
  else if (endemicWd.length) facts.push({ label: "Endemic to", value: endemicWd.join(", "), verified: false });
  else if (native.length === 1) facts.push({ label: "Endemic to", value: `${native[0]} (only native region)`, verified: true });
  else facts.push({ label: "Endemism", value: "Not endemic to a single region", verified: native.length > 0 });

  // Threat statuses from regional checklists
  const threats = dist.filter((d) => d.threatStatus).map((d) => [d.locality || d.country || "—", title(d.threatStatus!.toLowerCase().replace(/_/g, " ")), (d.source || "").slice(0, 80)]);
  if (facts.length) blocks.push({ type: "facts", items: facts });
  if (threats.length) {
    blocks.push({
      type: "deep",
      title: `Regional threat assessments · ${threats.length}`,
      blocks: [{ type: "table", verified: true, columns: ["Region", "Status", "Checklist"], rows: threats }],
    });
  }

  if (key) sources.push({ label: "World Checklist of Vascular Plants (Kew) – distribution via GBIF", url: gbifUrl(key), verified: true });
  if (ctx.powo) sources.push({ label: "Plants of the World Online (Kew)", url: powoUrl(ctx.powo), verified: true });
  if (wd[0]?.t) sources.push({ label: "Wikidata taxon record", url: wd[0].t.value, verified: false });
  return { blocks, sources };
}

const IUCN_FROM_LABEL: Record<string, string> = {
  "least concern": "LC",
  "near threatened": "NT",
  vulnerable: "VU",
  endangered: "EN",
  "critically endangered": "CR",
  "extinct in the wild": "EW",
  extinct: "EX",
  "data deficient": "DD",
};

// Kew's World Checklist (WCVP) uses botanical regions (TDWG), not always country names.
const US_STATES = [
  "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut", "Delaware", "Florida", "Georgia, U.S.A.",
  "Idaho", "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan",
  "Minnesota", "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire", "New Jersey", "New Mexico", "New York",
  "North Carolina", "North Dakota", "Ohio", "Oklahoma", "Oregon", "Pennsylvania", "Rhode I.", "South Carolina", "South Dakota",
  "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington", "West Virginia", "Wisconsin", "Wyoming", "District of Columbia", "Hawaii",
];
const REGION_ALIASES: Record<string, string[]> = {
  GB: ["Great Britain", "Northern Ireland"],
  IE: ["Ireland"],
  US: US_STATES,
  CA: ["Alberta", "British Columbia", "Manitoba", "New Brunswick", "Newfoundland", "Northwest Territ", "Nova Scotia", "Nunavut", "Ontario", "Prince Edward I.", "Québec", "Saskatchewan", "Yukon", "Labrador"],
  AU: ["New South Wales", "Queensland", "Victoria", "Western Australia", "Northern Territory", "South Australia", "Tasmania", "Australian Capital"],
  IN: ["India", "Assam", "Andaman Is.", "Nicobar Is.", "Laccadive Is.", "West Himalaya", "East Himalaya"],
  CN: ["China", "Hainan", "Tibet", "Xinjiang", "Inner Mongolia", "Manchuria", "Qinghai"],
  ID: ["Jawa", "Sumatera", "Borneo", "Sulawesi", "Maluku", "Lesser Sunda Is.", "New Guinea", "Bali"],
  MY: ["Malaya", "Borneo"],
  RU: ["Russia", "Siberia", "Kamchatka", "Krasnoyarsk", "Altay", "Amur", "Buryatiya", "Chita", "Irkutsk", "Khabarovsk", "Kuril Is.", "Magadan", "Primorye", "Sakhalin", "Tuva", "Yakutskiya"],
  BR: ["Brazil"],
  MX: ["Mexico"],
  AR: ["Argentina"],
  CL: ["Chile"],
  ES: ["Spain", "Baleares", "Canary Is."],
  PT: ["Portugal", "Madeira", "Azores"],
  IT: ["Italy", "Sicilia", "Sardegna"],
  FR: ["France", "Corse"],
  GR: ["Greece", "Kriti", "East Aegean Is."],
  JP: ["Japan", "Nansei-shoto", "Ogasawara-shoto"],
  KR: ["Korea"],
  KP: ["Korea"],
  CD: ["Zaïre"],
  CI: ["Ivory Coast"],
  CZ: ["Czechoslovakia"],
  SK: ["Czechoslovakia"],
  PG: ["New Guinea", "Bismarck Archipelago", "Solomon Is."],
  ZA: ["Cape Provinces", "KwaZulu-Natal", "Free State", "Northern Provinces"],
  SA: ["Saudi Arabia"],
  YE: ["Yemen", "Socotra"],
  EC: ["Ecuador", "Galápagos"],
  TZ: ["Tanzania", "Zanzibar"],
  LK: ["Sri Lanka"],
  MM: ["Myanmar"],
  VN: ["Vietnam"],
  TH: ["Thailand"],
  PH: ["Philippines"],
  NZ: ["New Zealand North", "New Zealand South", "Chatham Is.", "Kermadec Is."],
};

function inCountryRegion(locality: string, cc: string, cname: string) {
  const l = locality.toLowerCase();
  const names = [cname, ...(REGION_ALIASES[cc] || [])].map((x) => x.toLowerCase());
  return names.some((n) => l === n || l.startsWith(n + " ") || l.startsWith(n + ",") || (n.length > 5 && l.includes(n)));
}

/* ===================== 6. PHYTOCHEMICALS ===================== */

const GREEK: [RegExp, string][] = [
  [/\bALPHA\b/g, "α"],
  [/\bBETA\b/g, "β"],
  [/\bGAMMA\b/g, "γ"],
  [/\bDELTA\b/g, "δ"],
];
function prettyChem(s: string): string {
  let t = s;
  for (const [re, g] of GREEK) t = t.replace(re, g);
  t = t.toLowerCase().replace(/-acid\b/g, " acid").replace(/-oil\b/g, " oil");
  return t.replace(/^([^a-zα-δ]*)([a-z])/, (_, a, b) => a + b.toUpperCase());
}
const pubchem = (n: string) => `https://pubchem.ncbi.nlm.nih.gov/#query=${encodeURIComponent(n)}`;
function ppm(low: number | null, high: number | null) {
  const f = (n: number) => (n >= 100 ? fmt(Math.round(n)) : String(+n.toFixed(2)));
  if (low != null && high != null && low !== high) return `${f(low)} – ${f(high)}`;
  const v = high ?? low;
  return v == null ? "—" : f(v);
}
function pct(high: number | null, low: number | null) {
  const v = high ?? low;
  if (v == null) return "—";
  const p = v / 10000;
  return p >= 1 ? `${p.toFixed(1)} %` : p >= 0.01 ? `${p.toFixed(2)} %` : `${p.toFixed(4)} %`;
}

const NOT_COMPOUNDS =
  /^(EO|ASH|FAT|FIBER|FIBRE|PROTEIN|WATER|CARBOHYDRATES?|KILOCALORIES|CALORIES|ENERGY|ESSENTIAL-OIL|FIXED-OIL|OIL|SUGARS?|STARCH|CELLULOSE|LIGNIN|HEMICELLULOSE|MINERALS?|NITROGEN|CALCIUM|IRON|MAGNESIUM|PHOSPHORUS|POTASSIUM|SODIUM|ZINC|MANGANESE|COPPER|SULFUR|CHROMIUM|COBALT|SELENIUM|SILICON|ALUMINUM|BORON|HEXOURONIC-ACID)$|^[A-Z]+(OSES|ATES|OIDS|INS|ANS|IDES|ALS|ONES)$/;

async function phytochemicals(ctx: Ctx): Promise<SectionData> {
  const name = cleanName(ctx.name);
  const m = await gbifMatch(name);
  const accepted = m?.species && m.species !== name ? m.species : null;
  const [dukeA, lotus] = await Promise.all([
    dukeChemicals(name),
    wikidata(
      `SELECT DISTINCT ?c ?cLabel ?cid ?formula WHERE { ?t wdt:P225 "${name}" . ?c wdt:P703 ?t . OPTIONAL { ?c wdt:P662 ?cid } OPTIONAL { ?c wdt:P274 ?formula } SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } } LIMIT 400`,
    ),
  ]);
  const duke = dukeA || (accepted ? await dukeChemicals(accepted) : null);

  const blocks: Block[] = [];
  const sources: Source[] = [];
  const rows = duke?.rows || [];
  const measured = rows.filter((r) => r.high != null || r.low != null).sort((a, b) => (b.high ?? b.low ?? 0) - (a.high ?? a.low ?? 0));
  const measuredCompounds = measured.filter((r) => !NOT_COMPOUNDS.test(r.chemical));
  const proximates = measured.filter((r) => NOT_COMPOUNDS.test(r.chemical));
  const parts = uniq(rows.map((r) => r.part));

  // LOTUS / Wikidata compounds (deduplicated)
  const lotusMap = new Map<string, { label: string; cid?: string; formula?: string; qid: string }>();
  for (const r of lotus) {
    const label = r.cLabel?.value as string;
    if (!label || /^Q\d+$/.test(label)) continue;
    const k = label.toLowerCase();
    if (!lotusMap.has(k)) lotusMap.set(k, { label, cid: r.cid?.value, formula: r.formula?.value, qid: r.c.value });
  }
  const lotusList = [...lotusMap.values()].sort((a, b) => a.label.localeCompare(b.label));
  const allNames = new Set([...rows.map((r) => prettyChem(r.chemical).toLowerCase()), ...lotusList.map((l) => l.label.toLowerCase())]);

  if (!rows.length && !lotusList.length) {
    return {
      blocks: [{ type: "note", tone: "info", text: "No phytochemical records were found for this species in USDA Dr. Duke's database or LOTUS/Wikidata." }],
      sources: [
        { label: "IMPPAT – Indian Medicinal Plants, Phytochemistry And Therapeutics", url: "https://cb.imsc.res.in/imppat/", verified: true },
        { label: "LOTUS natural products database", url: "https://lotus.naturalproducts.net/", verified: true },
      ],
    };
  }

  blocks.push({
    type: "stats",
    items: [
      { label: "Compounds recorded", value: fmt(allNames.size), verified: true },
      { label: "With measured amounts", value: fmt(measuredCompounds.length), verified: true },
      { label: "Plant parts studied", value: String(parts.length || "—"), hint: parts.slice(0, 4).join(", "), verified: true },
    ],
  });

  if (measuredCompounds.length) {
    blocks.push({
      type: "table",
      title: "Measured concentrations",
      verified: true,
      caption: "ppm = parts per million (mg per kg of dry plant part). 10,000 ppm = 1 %.",
      columns: ["Compound", "Plant part", "Range (ppm)", "Max %"],
      align: ["left", "left", "right", "right"],
      filterColumn: 1,
      rows: measuredCompounds.slice(0, 30).map((r) => [
        { text: prettyChem(r.chemical), href: pubchem(prettyChem(r.chemical)) },
        r.part,
        ppm(r.low, r.high),
        pct(r.high, r.low),
      ]),
    });
  } else {
    blocks.push({
      type: "note",
      tone: "info",
      text: "No measured concentrations are recorded for this species. Compounds below are reported as present, without amounts.",
    });
  }

  if (lotusList.length) {
    blocks.push({
      type: "chips",
      title: `Compounds reported in scientific literature · ${lotusList.length}`,
      verified: true,
      items: lotusList
        .filter((c) => c.label.length <= 32 && !/^[(\d]/.test(c.label))
        .slice(0, 36)
        .map((c) => ({ label: c.label, href: c.cid ? `https://pubchem.ncbi.nlm.nih.gov/compound/${c.cid}` : c.qid })),
    });
  }

  // Deep detail: everything, with references
  const deep: Block[] = [];
  if (measured.length) {
    deep.push({
      type: "table",
      title: `All measured values · ${measured.length}`,
      verified: true,
      columns: ["Compound", "Part", "Low ppm", "High ppm", "Std. dev.", "Reference"],
      align: ["left", "left", "right", "right", "right", "left"],
      filterColumn: 1,
      rows: measured.map((r) => [
        { text: prettyChem(r.chemical), href: pubchem(prettyChem(r.chemical)) },
        r.part,
        r.low != null ? ppm(r.low, r.low) : "—",
        r.high != null ? ppm(r.high, r.high) : "—",
        /\d/.test(r.sd) ? r.sd : "—",
        { text: r.ref || "Duke, 1992", muted: true },
      ]),
    });
  }
  if (proximates.length) {
    deep.push({
      type: "table",
      title: "Nutrients and general constituents",
      verified: true,
      columns: ["Constituent", "Part", "Range (ppm)", "Max %"],
      align: ["left", "left", "right", "right"],
      rows: proximates.map((r) => [prettyChem(r.chemical), r.part, ppm(r.low, r.high), pct(r.high, r.low)]),
    });
  }
  const unmeasured = rows.filter((r) => r.high == null && r.low == null);
  if (unmeasured.length) {
    deep.push({
      type: "table",
      title: `Reported without amounts · ${unmeasured.length}`,
      verified: true,
      columns: ["Compound", "Part", "Known activities"],
      align: ["left", "left", "right"],
      filterColumn: 1,
      rows: unmeasured.map((r) => [{ text: prettyChem(r.chemical), href: pubchem(prettyChem(r.chemical)) }, r.part, String(r.activities)]),
    });
  }
  if (lotusList.length) {
    deep.push({
      type: "table",
      title: `Full literature compound list · ${lotusList.length}`,
      verified: true,
      columns: ["Compound", "Formula", "PubChem"],
      rows: lotusList.map((c) => [
        c.label,
        { text: c.formula || "—", muted: true },
        c.cid ? { text: `CID ${c.cid}`, href: `https://pubchem.ncbi.nlm.nih.gov/compound/${c.cid}` } : { text: "—", muted: true },
      ]),
    });
  }
  if (deep.length) blocks.push({ type: "deep", title: "Deep detail · full data with references", blocks: deep });

  if (duke) {
    sources.push({ label: "USDA-ARS Dr. Duke's Phytochemical and Ethnobotanical Databases", url: duke.url, verified: true });
    sources.push({ label: "Dr. Duke's – full chemical table (CSV download)", url: duke.csv, verified: true });
  }
  if (lotusList.length) {
    sources.push({ label: "LOTUS natural products database (via Wikidata)", url: "https://lotus.naturalproducts.net/", verified: true });
  }
  sources.push({ label: "PubChem (NIH) – compound records", url: "https://pubchem.ncbi.nlm.nih.gov/", verified: true });
  return { blocks, sources };
}

/* ===================== PHOTOS ===================== */

const PART_LABELS: Record<string, string> = {
  habit: "Whole plant / shoot",
  leaf: "Leaf",
  flower: "Flower",
  fruit: "Fruit & seed",
  bark: "Bark & stem",
  other: "Other parts",
  scan: "Other parts",
};
const PART_ORDER = ["habit", "leaf", "flower", "fruit", "bark", "other"];

async function photos(ctx: Ctx): Promise<SectionData> {
  const m = await gbifMatch(cleanName(ctx.name));
  if (!m) return empty("No verified photos found: this name is not in the GBIF backbone.");
  const key = gbifKey(m);
  const ph = await gbifPhotos(key);
  const groups: Extract<Block, { type: "gallery" }>["groups"] = [];
  const byPart = new Map<string, typeof ph.parts>();
  for (const p of ph.parts) {
    const k = PART_LABELS[p.part] ? (p.part === "scan" ? "other" : p.part) : "other";
    byPart.set(k, [...(byPart.get(k) || []), p]);
  }
  for (const k of PART_ORDER) {
    const items = byPart.get(k);
    if (items?.length) groups.push({ id: k, label: PART_LABELS[k], verified: true, items: items.slice(0, 24) });
  }
  if (ph.more.length) groups.push({ id: "field", label: "More field photos", verified: true, items: ph.more });
  if (ph.specimens.length) groups.push({ id: "specimen", label: "Herbarium specimens", verified: true, items: ph.specimens });
  if (!groups.length) return empty("No verified photos of this species have been published to GBIF yet.");

  const blocks: Block[] = [
    {
      type: "gallery",
      groups,
      note: "Plant parts are labelled by the original Pl@ntNet observations (reviewed by botanists). Tap a photo to enlarge; every photo links to its record with photographer and licence.",
    },
    {
      type: "stats",
      items: [
        { label: "Photos labelled by part", value: fmt(ph.counts.plantnet), verified: true },
        { label: "Field photo records", value: fmt(ph.counts.field), verified: true },
        { label: "Herbarium specimens with images", value: fmt(ph.counts.specimens), verified: true },
      ],
    },
  ];
  return {
    blocks,
    sources: [
      { label: "Pl@ntNet observations (organ-labelled) via GBIF", url: `https://www.gbif.org/occurrence/gallery?taxon_key=${key}&dataset_key=7a3679ef-5582-4aaa-81f0-8c2545cafc81`, verified: true },
      { label: "GBIF – all photos of this species", url: `https://www.gbif.org/occurrence/gallery?taxon_key=${key}`, verified: true },
      { label: "GBIF – herbarium specimens", url: `https://www.gbif.org/occurrence/gallery?taxon_key=${key}&basis_of_record=PRESERVED_SPECIMEN`, verified: true },
    ],
  };
}

/* ===================== MEDICINAL (structured) ===================== */

const PHARMA: [string, string][] = [
  ["Anti-inflammatory", "Anti-Inflammatory Agents"],
  ["Antioxidant", "Antioxidants"],
  ["Antibacterial", "Anti-Bacterial Agents"],
  ["Antifungal", "Antifungal Agents"],
  ["Antiviral", "Antiviral Agents"],
  ["Anticancer", "Antineoplastic Agents"],
  ["Antidiabetic", "Hypoglycemic Agents"],
  ["Cholesterol-lowering", "Hypolipidemic Agents"],
  ["Blood-pressure lowering", "Antihypertensive Agents"],
  ["Pain relief", "Analgesics"],
  ["Neuroprotective", "Neuroprotective Agents"],
  ["Anti-anxiety", "Anti-Anxiety Agents"],
  ["Antidepressant", "Antidepressive Agents"],
  ["Protective (cell/organ)", "Protective Agents"],
  ["Immune-modulating", "Immunologic Factors"],
  ["Antiparasitic", "Antiparasitic Agents"],
];

const DISEASES = diseaseNames as Record<string, string>;
const ATLAS = "https://disease-research-atlas.vercel.app";

/** Tier counts for the Rank order panel (tier 4 = everything not in another tier). */
async function tierCounts(base: string, total: number): Promise<Record<string, number>> {
  const c = await pmCounts(Object.fromEntries(Object.entries(PM_TIERS).map(([k, q]) => [k, `(${base}) AND ${q}`])));
  const known = ["1", "2", "3", "5", "6"].map((k) => Math.max(0, c[k] || 0)).reduce((a, b) => a + b, 0);
  return { ...c, "4": Math.max(0, total - known) };
}

async function medicinal(ctx: Ctx): Promise<SectionData> {
  const name = cleanName(ctx.name);
  const sp = `"${name}"[tiab]`;
  const medQ = `${sp} AND (medicinal[tiab] OR pharmacolog*[tiab] OR therapeutic[tiab] OR "plant extracts"[MeSH Terms] OR "phytotherapy"[MeSH Terms] OR "medicine, traditional"[MeSH Terms])`;
  const clinQ = `${sp} AND (systematic review[pt] OR meta-analysis[pt] OR randomized controlled trial[pt] OR clinical trial[pt])`;
  const safeQ = `${sp} AND ("drug-related side effects and adverse reactions"[MeSH Terms] OR "herb-drug interactions"[MeSH Terms] OR "chemical and drug induced liver injury"[MeSH Terms] OR "toxicity tests"[MeSH Terms] OR toxicity[ti] OR safety[ti] OR "adverse"[ti])`;

  // Fast local / USDA lookups run alongside the paced PubMed requests.
  const ethnoP = dukeEthno(name);
  const dukeP = dukeChemicals(name);

  const [pharma, sample, clinical, safety, research] = await Promise.all([
    pmCounts(Object.fromEntries(PHARMA.map(([, m]) => [m, `${sp} AND ("${m}"[MeSH Terms] OR "${m}"[Pharmacological Action])`]))),
    pmSearch(`${sp} AND hasabstract`, 150),
    pmPapers(clinQ, 20),
    pmPapers(safeQ, 6),
    pmPapers(medQ, 60),
  ]);
  const mesh = await pmMesh(sample.ids);
  const freq = new Map<string, number>();
  for (const heads of mesh) for (const h of new Set(heads)) if (DISEASES[h]) freq.set(h, (freq.get(h) || 0) + 1);
  const candidates = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([d]) => d);
  const [dCounts, tiers, ethno, duke] = await Promise.all([
    pmCounts(Object.fromEntries(candidates.map((d) => [d, `${sp} AND "${d}"[MeSH Terms]`]))),
    tierCounts(medQ, research.total),
    ethnoP,
    dukeP,
  ]);

  const blocks: Block[] = [];
  const sources: Source[] = [];

  // 1. Traditional uses
  blocks.push({ type: "heading", n: 1, text: "Traditional uses", sub: "Recorded uses by country or medical system" });
  if (ethno?.rows.length) {
    const useFreq = new Map<string, number>();
    for (const r of ethno.rows) useFreq.set(r.use, (useFreq.get(r.use) || 0) + 1);
    const systems = uniq(ethno.rows.map((r) => r.region));
    blocks.push({
      type: "stats",
      items: [
        { label: "Traditional uses recorded", value: fmt(useFreq.size), verified: true },
        { label: "Countries / systems", value: fmt(systems.length), hint: systems.slice(0, 4).join(", "), verified: true },
      ],
    });
    blocks.push({
      type: "chips",
      title: "Most frequently recorded uses",
      verified: true,
      items: [...useFreq.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 18).map(([u, n]) => ({ label: n > 1 ? `${u} · ${n}` : u, tone: "native" as const })),
    });
    blocks.push({
      type: "deep",
      title: `All traditional-use records · ${ethno.rows.length}`,
      blocks: [{ type: "table", verified: true, columns: ["Use", "Country / system", "Reference"], filterColumn: 1, rows: ethno.rows.map((r) => [r.use, r.region, { text: r.ref || "Duke, 1992", muted: true }]) }],
    });
    sources.push({ label: "USDA-ARS Dr. Duke's Ethnobotanical Database – uses for this plant", url: ethno.url, verified: true });
    sources.push({ label: "Dr. Duke's – traditional uses (CSV download)", url: ethno.csv, verified: true });
  } else {
    blocks.push({ type: "note", tone: "info", text: "No traditional-use records for this species in USDA Dr. Duke's Ethnobotanical Database." });
  }

  // 2. Pharmacological activities
  blocks.push({ type: "heading", n: 2, text: "Pharmacological activities studied", sub: "PubMed papers indexed with each official MeSH pharmacological term" });
  const pharmaBars = PHARMA.map(([label, m]) => ({ label, value: pharma[m] ?? -1, href: pubmedUrl(`${sp} AND ("${m}"[MeSH Terms] OR "${m}"[Pharmacological Action])`) }))
    .filter((x) => x.value > 0)
    .sort((a, b) => b.value - a.value);
  if (pharmaBars.length) blocks.push({ type: "bars", title: "Activities by number of papers", verified: true, items: pharmaBars, caption: "Live counts from PubMed (plant named in title or abstract). Tap a bar to see those papers on PubMed." });
  else blocks.push({ type: "note", tone: "info", text: "No papers indexed with pharmacological activity terms yet." });

  // 3. Diseases studied
  blocks.push({ type: "heading", n: 3, text: "Diseases studied", sub: "Most frequent MeSH diseases in this plant's research" });
  const dBars = candidates
    .map((d) => ({ label: d, value: dCounts[d] ?? -1, href: `${ATLAS}/d/m${DISEASES[d]}#organism=${encodeURIComponent(name)}` }))
    .filter((x) => x.value > 0)
    .sort((a, b) => b.value - a.value);
  if (dBars.length) blocks.push({ type: "bars", title: "Diseases by number of papers", verified: true, items: dBars, caption: "Disease terms from NLM MeSH; counts from PubMed. Tap a disease to open all its research in Research Atlas, filtered to this plant." });
  else blocks.push({ type: "note", tone: "info", text: "Not enough MeSH-indexed papers to list diseases studied." });

  // 4. Clinical evidence
  blocks.push({ type: "heading", n: 4, text: "Clinical evidence", sub: "Systematic reviews, meta-analyses and human trials only" });
  if (clinical.items.length) blocks.push({ type: "papers", verified: true, total: clinical.total, title: "Strongest evidence first", items: rank(clinical.items).slice(0, 6) });
  else blocks.push({ type: "note", tone: "warn", text: "No systematic reviews or human clinical trials found. Evidence so far comes from lab or animal studies." });

  // 5. Active compounds
  blocks.push({ type: "heading", n: 5, text: "Active compounds behind the effects", sub: "Highest measured concentrations (full list in Phytochemicals)" });
  const measured = (duke?.rows || []).filter((r) => (r.high ?? r.low) != null && !NOT_COMPOUNDS.test(r.chemical)).sort((a, b) => (b.high ?? b.low ?? 0) - (a.high ?? a.low ?? 0));
  if (measured.length) {
    blocks.push({
      type: "table",
      verified: true,
      columns: ["Compound", "Plant part", "Range (ppm)", "Known activities"],
      align: ["left", "left", "right", "right"],
      rows: measured.slice(0, 8).map((r) => [{ text: prettyChem(r.chemical), href: pubchem(prettyChem(r.chemical)) }, r.part, ppm(r.low, r.high), String(r.activities)]),
    });
    sources.push({ label: "USDA-ARS Dr. Duke's Phytochemical Database – chemicals in this plant", url: duke!.url, verified: true });
  } else blocks.push({ type: "note", tone: "info", text: "No measured compound concentrations recorded. See the Phytochemicals section for compounds reported in the literature." });

  // 6. Safety & toxicity
  blocks.push({ type: "heading", n: 6, text: "Safety & toxicity", sub: "Toxicity, side effects and herb–drug interactions" });
  if (safety.items.length) blocks.push({ type: "papers", verified: true, total: safety.total, title: "Safety studies", items: rank(safety.items) });
  else blocks.push({ type: "note", tone: "info", text: "No toxicity or adverse-effect studies found. Absence of studies is not evidence of safety." });

  // 7. Research papers, ranked
  blocks.push({ type: "heading", n: 7, text: "Research papers", sub: "Ranked standard-first: systematic reviews → trials → reviews → articles → case reports → preprints" });
  if (research.items.length) blocks.push({ type: "papers", verified: true, total: research.total, ranked: true, tierCounts: tiers, items: rank(research.items).slice(0, 15) });
  else blocks.push({ type: "note", tone: "info", text: "No medicinal research papers found for this species." });

  blocks.push({ type: "note", tone: "warn", text: "Research summary for education only, not medical advice. Consult a qualified doctor before using any plant medicinally." });

  sources.push(
    { label: "PubMed – all medicinal research on this plant", url: pubmedUrl(medQ), verified: true },
    { label: "PubMed – clinical evidence (systematic reviews and trials)", url: pubmedUrl(clinQ), verified: true },
    { label: "PubMed – safety and toxicity studies", url: pubmedUrl(safeQ), verified: true },
    { label: "NLM Medical Subject Headings (MeSH) – disease and pharmacology terms", url: "https://www.nlm.nih.gov/mesh/", verified: true },
    { label: "Europe PMC – citation counts", url: "https://europepmc.org/", verified: true },
  );
  return { blocks, sources };
}

/* ===================== ETHNOBOTANICAL & ECONOMIC (ranked papers) ===================== */

async function uses(ctx: Ctx, kind: "ethnobotanical" | "economic"): Promise<SectionData> {
  const name = cleanName(ctx.name);
  const cname = countryName(ctx.country);
  const sp = `"${name}"[tiab]`;
  const cfg = {
    ethnobotanical: {
      q: `${sp} AND (ethnobotan*[tiab] OR ethnomedic*[tiab] OR ethnopharmacolog*[tiab] OR traditional[tiab] OR folk[tiab] OR indigenous[tiab] OR "medicine, traditional"[MeSH Terms] OR "ethnobotany"[MeSH Terms])`,
      wiki: ["tradition", "folk", "culture", "ethno", "religio", "ayurved", "uses"],
      intro: `Ethnobotanical studies on traditional use, ranked standard-first; ${cname} studies shown first when available.`,
    },
    economic: {
      q: `${sp} AND (economic*[tiab] OR timber[tiab] OR fibre[tiab] OR fiber[tiab] OR food[tiab] OR fodder[tiab] OR dye[tiab] OR oil[tiab] OR cultivation[tiab] OR commercial[tiab] OR agroforestry[tiab] OR "crop production"[tiab])`,
      wiki: ["uses", "cultivation", "culinary", "food", "timber", "economic", "commercial", "agricult"],
      intro: "Peer-reviewed research on economic uses (food, timber, fibre, oil, fodder and more), ranked standard-first.",
    },
  }[kind];
  const [res, local, wiki] = await Promise.all([
    pmPapers(cfg.q, 40),
    kind === "ethnobotanical" ? pmPapers(`(${cfg.q}) AND ("${cname}"[tiab] OR "${cname}"[ad])`, 8) : Promise.resolve({ total: 0, items: [] }),
    safe(wikiSections(name)),
  ]);
  const tiers = res.total ? await tierCounts(cfg.q, res.total) : undefined;
  const web = wiki ? pickWiki(wiki.sections, cfg.wiki) : null;
  const items = dedupePapers([...rank(local.items).slice(0, 3), ...rank(res.items)]).slice(0, 12);

  const blocks: Block[] = [{ type: "note", tone: "info", text: cfg.intro }];
  if (items.length) blocks.push({ type: "papers", verified: true, total: res.total, ranked: true, tierCounts: tiers, items });
  if (web) blocks.push({ type: "text", title: `From the web · ${web.heading}`, text: web.text, verified: false, via: "Wikipedia" });
  if (!items.length && !web) return empty(`No published ${kind} information was found for this species.`);
  if (!items.length) blocks.splice(1, 0, { type: "note", tone: "warn", text: "No peer-reviewed studies found. Showing general web information (not verified)." });

  const sources: Source[] = items.map((p) => ({ label: `${p.authors} (${p.year}). ${p.title.slice(0, 90)}${p.title.length > 90 ? "…" : ""}`, url: p.href, verified: true }));
  sources.push({ label: "PubMed – all matching studies", url: pubmedUrl(cfg.q), verified: true });
  if (web && wiki) sources.push({ label: `Wikipedia – ${wiki.title}`, url: wiki.url, verified: false });
  return { blocks, sources };
}

function dedupePapers<T extends { title: string }>(a: T[]): T[] {
  const s = new Set<string>();
  return a.filter((p) => (s.has(p.title.toLowerCase()) ? false : (s.add(p.title.toLowerCase()), true)));
}

/* ===================== helpers ===================== */

function empty(text: string): SectionData {
  return { blocks: [{ type: "note", tone: "info", text }], sources: [] };
}
function uniq<T>(a: T[]): T[] {
  return [...new Set(a.filter(Boolean))];
}
function title(s: string) {
  return s.replace(/^\w/, (c) => c.toUpperCase());
}

const BUILDERS: Record<SectionId, (c: Ctx) => Promise<SectionData>> = {
  overview,
  photos,
  taxonomy,
  systematics,
  distribution,
  conservation,
  phytochemicals,
  medicinal,
  ethnobotanical: (c) => uses(c, "ethnobotanical"),
  economic: (c) => uses(c, "economic"),
};
