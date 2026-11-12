import html
import io
import re
import xml.etree.ElementTree as ET

import requests
import streamlit as st
from PIL import Image, ImageOps

st.set_page_config(page_title="AP Flora Finder", page_icon="🌿", layout="centered")

UA = {"User-Agent": "APFloraFinder/1.0 (educational project)"}
TIMEOUT = 30
AP_GADM = "IND.2_1"  # GADM code for Andhra Pradesh
LOW_CONFIDENCE = 0.30

SECTIONS = [
    ("Overview", ":material/info:"),
    ("Taxonomy", ":material/account_tree:"),
    ("Systematics", ":material/hub:"),
    ("AP distribution", ":material/map:"),
    ("Conservation status", ":material/eco:"),
    ("Phytochemicals", ":material/science:"),
    ("Medicinal uses", ":material/medication:"),
    ("Ethnobotanical uses", ":material/diversity_3:"),
    ("Economic uses", ":material/payments:"),
]


# ---------- helpers ----------

def get_json(url, params=None):
    r = requests.get(url, params=params, headers=UA, timeout=TIMEOUT)
    r.raise_for_status()
    return r.json()


def clean(name):
    return re.sub(r"[^A-Za-z×\.\- ]", "", name).strip()


def sources_box(items):
    """Blue 'Sources' box at the end of each section. items = [(label, url), ...]"""
    if not items:
        return
    lis = "".join(
        f'<li style="margin:4px 0"><a href="{html.escape(u)}" target="_blank" '
        f'style="color:#0b57d0">{html.escape(t)}</a></li>'
        for t, u in items
    )
    st.markdown(
        f'<details style="background:#e8f0fe;border:1px solid #0b57d0;border-radius:10px;'
        f'padding:10px 14px;margin-top:18px"><summary style="color:#0b57d0;font-weight:600;'
        f'cursor:pointer">🔗 Sources ({len(items)}) – tap to verify</summary>'
        f'<ol style="color:#0b3d91;margin:8px 0 0">{lis}</ol></details>',
        unsafe_allow_html=True,
    )


def prepare_image(raw):
    img = ImageOps.exif_transpose(Image.open(io.BytesIO(raw))).convert("RGB")
    img.thumbnail((1280, 1280))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return buf.getvalue()


# ---------- data sources ----------

@st.cache_data(ttl=86400, show_spinner=False)
def identify(jpeg_bytes, key):
    r = requests.post(
        "https://my-api.plantnet.org/v2/identify/all",
        params={"api-key": key, "lang": "en"},
        files=[("images", ("plant.jpg", jpeg_bytes, "image/jpeg"))],
        data={"organs": "auto"},
        timeout=60,
    )
    if r.status_code == 404:
        return None
    r.raise_for_status()
    results = r.json().get("results", [])
    if not results:
        return None
    best = results[0]
    sp = best.get("species", {})
    return {
        "name": sp.get("scientificNameWithoutAuthor", ""),
        "author": sp.get("scientificNameAuthorship", ""),
        "family": (sp.get("family") or {}).get("scientificNameWithoutAuthor", ""),
        "common": sp.get("commonNames", []),
        "score": best.get("score", 0),
        "powo": (best.get("powo") or {}).get("id"),
    }


@st.cache_data(ttl=86400, show_spinner=False)
def gbif_match(name):
    d = get_json("https://api.gbif.org/v1/species/match", {"name": name, "kingdom": "Plantae"})
    return d if d.get("usageKey") else None


@st.cache_data(ttl=86400, show_spinner=False)
def ncbi_taxon(name):
    ids = get_json(
        "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi",
        {"db": "taxonomy", "term": f'"{name}"[Scientific Name]', "retmode": "json", "tool": "apflora"},
    )["esearchresult"]["idlist"]
    if not ids:
        return None
    r = requests.get(
        "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi",
        params={"db": "taxonomy", "id": ids[0], "retmode": "xml", "tool": "apflora"},
        headers=UA, timeout=TIMEOUT,
    )
    r.raise_for_status()
    t = ET.fromstring(r.content).find("Taxon")
    lineage = []
    lin = t.find("LineageEx")
    if lin is not None:
        for x in lin:
            lineage.append((x.findtext("Rank"), x.findtext("ScientificName")))
    lineage.append((t.findtext("Rank"), t.findtext("ScientificName")))
    return {"id": ids[0], "lineage": lineage}


@st.cache_data(ttl=86400, show_spinner=False)
def wikidata(query):
    return get_json("https://query.wikidata.org/sparql", {"query": query, "format": "json"})["results"]["bindings"]


@st.cache_data(ttl=86400, show_spinner=False)
def europepmc(query, n=8):
    d = get_json(
        "https://www.ebi.ac.uk/europepmc/webservices/rest/search",
        {"query": query, "format": "json", "pageSize": n, "resultType": "lite"},
    )
    return d.get("resultList", {}).get("result", []), d.get("hitCount", 0)


@st.cache_data(ttl=86400, show_spinner=False)
def wikipedia(name):
    try:
        return get_json(f"https://en.wikipedia.org/api/rest_v1/page/summary/{name.replace(' ', '_')}")
    except requests.HTTPError:
        return None


# ---------- sections ----------

def show_overview(sp):
    name = sp["name"]
    st.markdown(f"**Scientific name:** *{name}* {sp['author']}")
    st.markdown(f"**Family:** {sp['family']}")
    if sp["common"]:
        st.markdown(f"**Common names:** {', '.join(sp['common'][:6])}")
    src = [("Pl@ntNet identification service", "https://identify.plantnet.org/")]

    rows = wikidata(
        f'SELECT ?item ?te WHERE {{ ?item wdt:P225 "{clean(name)}" . '
        f'OPTIONAL {{ ?item rdfs:label ?te . FILTER(LANG(?te)="te") }} }} LIMIT 1'
    )
    if rows:
        if rows[0].get("te"):
            st.markdown(f"**Telugu name:** {rows[0]['te']['value']}")
        src.append(("Wikidata taxon record", rows[0]["item"]["value"]))

    wp = wikipedia(name)
    if wp and wp.get("extract"):
        st.write(wp["extract"])
        src.append(("Wikipedia: " + wp.get("title", name),
                    wp.get("content_urls", {}).get("desktop", {}).get("page", "https://en.wikipedia.org")))
    if sp["powo"]:
        src.append(("Plants of the World Online (Kew)",
                    f"https://powo.science.kew.org/taxon/urn:lsid:ipni.org:names:{sp['powo']}"))
    sources_box(src)


def show_taxonomy(sp):
    g = gbif_match(sp["name"])
    nc = ncbi_taxon(sp["name"])
    if not g and not nc:
        st.warning("No cited taxonomy found.")
        return
    ncbi_ranks = {r: n for r, n in (nc["lineage"] if nc else [])}
    rows = [
        ("Kingdom", (g or {}).get("kingdom")),
        ("Division (Phylum)", (g or {}).get("phylum")),
        ("Class", (g or {}).get("class")),
        ("Subclass", ncbi_ranks.get("subclass")),
        ("Order", (g or {}).get("order")),
        ("Family", (g or {}).get("family")),
        ("Subfamily", ncbi_ranks.get("subfamily")),
        ("Tribe", ncbi_ranks.get("tribe")),
        ("Genus", (g or {}).get("genus")),
        ("Species", (g or {}).get("species") or sp["name"]),
    ]
    table = "| Rank | Name |\n|---|---|\n" + "\n".join(
        f"| {r} | {v if v else '_Not recorded in these databases_'} |" for r, v in rows
    )
    st.markdown(table)
    if g:
        st.caption(f"Authority: {g.get('scientificName', '')} · Status: {g.get('status', '').title()}")
    src = []
    if g:
        src.append((f"GBIF Backbone Taxonomy, key {g['usageKey']}", f"https://www.gbif.org/species/{g['usageKey']}"))
    if nc:
        src.append((f"NCBI Taxonomy, ID {nc['id']}",
                    f"https://www.ncbi.nlm.nih.gov/Taxonomy/Browser/wwwtax.cgi?id={nc['id']}"))
    sources_box(src)


def show_systematics(sp):
    nc = ncbi_taxon(sp["name"])
    if not nc:
        st.warning("No cited systematic data found.")
        return
    st.markdown("**Phylogenetic lineage** (modern classification, consistent with APG IV clades)")
    lines = []
    for rank, name in nc["lineage"]:
        label = "Clade" if rank in ("clade", "no rank") else rank.title()
        lines.append(f"- **{label}:** {name}")
    st.markdown("\n".join(lines))
    st.info("Bentham & Hooker classification is not available in an open database. "
            "It can be added later from a cited textbook table.")
    sources_box([(f"NCBI Taxonomy, ID {nc['id']}",
                  f"https://www.ncbi.nlm.nih.gov/Taxonomy/Browser/wwwtax.cgi?id={nc['id']}")])


def show_distribution(sp):
    g = gbif_match(sp["name"])
    if not g:
        st.warning("No cited distribution data found.")
        return
    key = g.get("acceptedUsageKey") or g["usageKey"]
    ap = get_json("https://api.gbif.org/v1/occurrence/search",
                  {"taxonKey": key, "gadmGid": AP_GADM, "limit": 5})
    india = get_json("https://api.gbif.org/v1/occurrence/search",
                     {"taxonKey": key, "country": "IN", "limit": 0})
    c1, c2 = st.columns(2)
    c1.metric("Records in Andhra Pradesh", f"{ap.get('count', 0):,}")
    c2.metric("Records in India", f"{india.get('count', 0):,}")
    src = [
        ("GBIF occurrence records – Andhra Pradesh",
         f"https://www.gbif.org/occurrence/search?taxon_key={key}&gadm_gid={AP_GADM}"),
        ("GBIF occurrence records – India",
         f"https://www.gbif.org/occurrence/search?taxon_key={key}&country=IN"),
    ]
    if ap.get("count", 0) == 0:
        st.info("No GBIF records yet from Andhra Pradesh. The plant may be cultivated or under-recorded.")
    else:
        st.markdown("**Recent records from Andhra Pradesh**")
        for o in ap.get("results", []):
            place = o.get("locality") or o.get("county") or o.get("stateProvince") or "Andhra Pradesh"
            st.markdown(f"- {place} · {o.get('year', 'year not given')} · "
                        f"{(o.get('basisOfRecord') or '').replace('_', ' ').lower()}")
            src.append((f"GBIF record {o['key']}", f"https://www.gbif.org/occurrence/{o['key']}"))
    if sp["powo"]:
        src.append(("Native range – Plants of the World Online (Kew)",
                    f"https://powo.science.kew.org/taxon/urn:lsid:ipni.org:names:{sp['powo']}"))
    sources_box(src)


IUCN_NAMES = {
    "EX": "Extinct", "EW": "Extinct in the Wild", "CR": "Critically Endangered",
    "EN": "Endangered", "VU": "Vulnerable", "NT": "Near Threatened",
    "LC": "Least Concern", "DD": "Data Deficient", "NE": "Not Evaluated",
}


def safe_json(url, params=None):
    try:
        return get_json(url, params)
    except (requests.RequestException, ValueError):
        return None


def show_conservation(sp):
    g = gbif_match(sp["name"])
    if not g:
        st.warning("No cited conservation data found.")
        return
    key = g.get("acceptedUsageKey") or g["usageKey"]
    name = clean(sp["name"])
    src = []

    # 1. IUCN Red List category (IUCN data as published through GBIF)
    st.markdown("**IUCN Red List status**")
    iucn = safe_json(f"https://api.gbif.org/v1/species/{key}/iucnRedListCategory")
    code = (iucn or {}).get("code")
    if code:
        st.markdown(f"- {IUCN_NAMES.get(code, code)} ({code})")
        src.append(("IUCN Red List category, via GBIF", f"https://www.gbif.org/species/{key}"))
    else:
        st.markdown("- _No IUCN assessment found_")
    src.append(("IUCN Red List search", f"https://www.iucnredlist.org/search?query={name.replace(' ', '%20')}"))

    # 2. Native or introduced in India, and endemism, from published checklists in GBIF
    dist = (safe_json(f"https://api.gbif.org/v1/species/{key}/distributions", {"limit": 300}) or {}).get("results", [])
    india, endemic_places = [], []
    for d in dist:
        place = d.get("locality") or d.get("country") or ""
        if d.get("country") == "IN" or "india" in place.lower():
            if d.get("establishmentMeans"):
                india.append((place or "India", d["establishmentMeans"].lower(), d.get("source", "")))
        if d.get("endemic") and place:
            endemic_places.append((place, d.get("source", "")))

    st.markdown("**Status in India**")
    if india:
        seen = set()
        for place, means, source in india:
            if (place, means) in seen:
                continue
            seen.add((place, means))
            st.markdown(f"- {place}: {means}")
            if source:
                src.append((f"Checklist via GBIF: {source[:90]}", f"https://www.gbif.org/species/{key}"))
    else:
        st.markdown("- _No cited native/introduced record for India_")

    # 3. Endemism (GBIF checklists + Wikidata 'endemic to')
    rows = wikidata(
        f'SELECT ?t ?pLabel WHERE {{ ?t wdt:P225 "{name}" . ?t wdt:P183 ?p . '
        f'SERVICE wikibase:label {{ bd:serviceParam wikibase:language "en". }} }}'
    )
    for r in rows:
        endemic_places.append((r["pLabel"]["value"], ""))
    st.markdown("**Endemic to**")
    if endemic_places:
        for place in sorted({p for p, _ in endemic_places}):
            st.markdown(f"- {place}")
        if rows:
            src.append(("Wikidata – 'endemic to' record", rows[0]["t"]["value"]))
    else:
        st.markdown("- _No cited record of endemism_")

    st.caption("Eastern Ghats and Andhra Pradesh endemic lists from BSI and the Flora of "
               "Andhra Pradesh can be added later from the department's checked table.")
    sources_box(src)


def show_phytochemicals(sp):
    name = clean(sp["name"])
    rows = wikidata(
        f'SELECT DISTINCT ?t ?c ?cLabel ?cid WHERE {{ ?t wdt:P225 "{name}" . ?c wdt:P703 ?t . '
        f'OPTIONAL {{ ?c wdt:P662 ?cid }} '
        f'SERVICE wikibase:label {{ bd:serviceParam wikibase:language "en". }} }} LIMIT 150'
    )
    src = []
    if not rows:
        st.warning("No cited phytochemical records found in Wikidata/LOTUS for this species.")
    else:
        st.markdown(f"**{len(rows)} compounds recorded** (tap a name to open it in PubChem)")
        items = []
        for r in rows:
            label = r["cLabel"]["value"]
            if "cid" in r:
                items.append(f"[{label}](https://pubchem.ncbi.nlm.nih.gov/compound/{r['cid']['value']})")
            else:
                items.append(f"[{label}]({r['c']['value']})")
        cols = st.columns(2)
        for i, it in enumerate(items):
            cols[i % 2].markdown(f"- {it}")
        src.append(("Wikidata (compound–species links, mostly from the LOTUS natural products database)",
                    rows[0]["t"]["value"]))
        src.append(("LOTUS natural products database", "https://lotus.naturalproducts.net/"))
    src.append(("KNApSAcK species–metabolite database (search)",
                f"http://www.knapsackfamily.com/knapsack_core/result.php?sname=organism&word={name.replace(' ', '%20')}"))
    src.append(("IMPPAT – Indian Medicinal Plants, Phytochemistry And Therapeutics",
                "https://cb.imsc.res.in/imppat/"))
    sources_box(src)


def show_papers(sp, topic_query, intro, ap_first=False):
    name = clean(sp["name"])
    note = ""
    papers, total = [], 0
    if ap_first:
        papers, total = europepmc(f'"{name}" AND ({topic_query}) AND "Andhra Pradesh"')
        if len(papers) < 3:
            note = "Few Andhra Pradesh studies found, so studies from other regions are included."
            papers, total = europepmc(f'"{name}" AND ({topic_query})')
    else:
        papers, total = europepmc(f'"{name}" AND ({topic_query})')
    st.caption(intro)
    if note:
        st.info(note)
    if not papers:
        st.warning("No cited studies found.")
        return
    st.markdown(f"**{total:,} published studies found.** Most relevant:")
    src = []
    for p in papers:
        title = re.sub(r"<[^>]+>", "", p.get("title", "")).rstrip(".")
        st.markdown(f"- **{title}** — {p.get('journalTitle', '')} ({p.get('pubYear', '')})")
        src.append((f"{p.get('authorString', '')[:60]} ({p.get('pubYear', '')}). {title[:80]}",
                    f"https://europepmc.org/article/{p.get('source', 'MED')}/{p.get('id', '')}"))
    sources_box(src)


RENDER = {
    "Overview": show_overview,
    "Taxonomy": show_taxonomy,
    "Systematics": show_systematics,
    "AP distribution": show_distribution,
    "Conservation status": show_conservation,
    "Phytochemicals": show_phytochemicals,
    "Medicinal uses": lambda sp: show_papers(
        sp, "medicinal OR pharmacological OR therapeutic",
        "Published research on medicinal and pharmacological properties."),
    "Ethnobotanical uses": lambda sp: show_papers(
        sp, "ethnobotany OR ethnobotanical OR ethnomedicinal OR tribal OR traditional",
        "Published ethnobotanical studies, Andhra Pradesh first.", ap_first=True),
    "Economic uses": lambda sp: show_papers(
        sp, "economic OR fibre OR fiber OR timber OR food OR fodder OR dye OR oil OR cultivation",
        "Published research on economic uses."),
}


# ---------- page ----------

st.title("🌿 AP Flora Finder")
st.caption("Photograph a plant from Andhra Pradesh and get cited details.")

try:
    key = st.secrets["PLANTNET_API_KEY"]
except Exception:
    key = st.sidebar.text_input("Pl@ntNet API key", type="password")

tab_up, tab_cam = st.tabs(["📁 Upload photo", "📷 Use camera"])
with tab_up:
    file_up = st.file_uploader("Choose a plant photo", type=["jpg", "jpeg", "png", "webp"])
with tab_cam:
    file_cam = st.camera_input("Point at the plant and take a photo")
upload = file_cam or file_up
if not upload:
    st.info("Tip: a clear photo of the flower gives the most accurate result.")
    st.stop()
if not key:
    st.error("Pl@ntNet API key missing. Add it in the app's Secrets settings.")
    st.stop()

jpeg = prepare_image(upload.getvalue())
st.image(jpeg, use_container_width=True)

with st.spinner("Identifying the plant…"):
    try:
        sp = identify(jpeg, key)
    except requests.RequestException:
        st.error("Couldn't reach Pl@ntNet right now. Try again in a minute.")
        st.stop()

if not sp:
    st.error("No plant recognised. Try a clearer photo of a flower or leaf.")
    st.stop()

if st.session_state.get("species") != sp["name"]:
    st.session_state.species = sp["name"]
    st.session_state.section = None

st.subheader(f"*{sp['name']}*")
st.caption(f"{sp['family']} · match {sp['score'] * 100:.0f}%")
if sp["score"] < LOW_CONFIDENCE:
    st.warning("Low confidence. Try a clearer photo of the flower or leaf.")

cols = st.columns(4)
for i, (label, icon) in enumerate(SECTIONS):
    with cols[i % 4]:
        active = st.session_state.section == label
        if st.button(label, icon=icon, key=f"btn_{label}", use_container_width=True,
                     type="primary" if active else "secondary"):
            st.session_state.section = label
            st.rerun()

section = st.session_state.section
if section:
    st.divider()
    st.subheader(section)
    with st.spinner(f"Fetching {section.lower()} from verified sources…"):
        try:
            RENDER[section](sp)
        except requests.RequestException:
            st.error("One of the databases didn't respond. Tap the button again in a minute.")
