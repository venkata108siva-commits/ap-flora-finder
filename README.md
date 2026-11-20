# 🌿 Global Flora Finder

Identify any plant on Earth from a photo and explore verified scientific data, with every fact linked to its source.

**Live:** https://global-flora-finder.vercel.app

## Features
- **Back camera** capture (falls back to webcam on PC) plus gallery upload, with an optional **crop** step
- Identification by **Pl@ntNet**, with match % and alternative matches (a note appears only when the match is below 10%)
- 9 sections, each loaded in the background so they open instantly:
  Overview · Taxonomy · Systematics · Distribution · Conservation · Phytochemicals · Medicinal · Ethnobotanical · Economic uses
- **Green ✓** on data from verified scientific sources; general web data is labelled `web`
- **Blue Sources box** at the end of every section, with clickable links
- **Measured phytochemical concentrations** (ppm and %, by plant part) from USDA Dr. Duke's database
- Works on phones, tablets and PCs, and can be installed as an app (PWA)

## Data sources
Pl@ntNet · GBIF · Kew (POWO / WCVP) · NCBI Taxonomy · IUCN Red List (via GBIF) · USDA Dr. Duke's Phytochemical Database · LOTUS / Wikidata · PubChem · Europe PMC · Wikipedia (unverified)

## Setup
1. `npm install`
2. Set the environment variable `PLANTNET_API_KEY` (free key from https://my.plantnet.org). On Vercel: Project → Settings → Environment Variables.
3. `npm run dev` and open http://localhost:3000

Built with Next.js 15 (App Router) and deployed on Vercel.

## Search by name
Scientific names, common names (GBIF Backbone) and **Sanskrit names**, typed in Roman letters with or without diacritics or in Devanagari (e.g. *haridra*, *Haridrā*, *हरिद्रा*).

Sanskrit names are the official monograph names of the **Ayurvedic Pharmacopoeia of India** (Govt of India), taken from IMPPAT 2.0, Institute of Mathematical Sciences, Chennai (https://cb.imsc.res.in/imppat/, licence CC BY-NC-ND 4.0, non-commercial use with attribution). Rebuild the list with:
```bash
python3 scripts/build-sanskrit.py IMPPAT_SingleHerbalFormulations.tsv
```
