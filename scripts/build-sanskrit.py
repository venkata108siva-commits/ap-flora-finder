"""Builds data/sanskrit.json from IMPPAT's Single Herbal Formulations file, which lists the
official monograph names of the Ayurvedic Pharmacopoeia of India (API), Govt of India.
Source: https://cb.imsc.res.in/imppat/download (CC BY-NC-ND 4.0, IMSc Chennai).
Usage: python3 scripts/build-sanskrit.py path/to/IMPPAT_SingleHerbalFormulations.tsv"""
import csv, json, re, sys
from collections import defaultdict

rows = list(csv.DictReader(open(sys.argv[1], encoding="utf-8"), delimiter="\t"))
by = defaultdict(lambda: {"plants": set(), "parts": set(), "uses": set(), "refs": set()})
for r in rows:
    name = re.sub(r"_\d+$", "", r["Formulation_name_in_API_original"].strip())
    plant = r["Plant_name_standardised"].strip()
    if not name or not plant:
        continue
    e = by[name]
    e["plants"].add(plant)
    if r["Plant_part_standardised"].strip():
        e["parts"].add(r["Plant_part_standardised"].strip())
    for u in r["Therapeutic_uses_standardised"].split("|"):
        if u.strip():
            e["uses"].add(u.strip())
    if r["References"].strip():
        e["refs"].add(r["References"].strip())
out = [
    {"sa": k, "plants": sorted(v["plants"]), "parts": sorted(v["parts"]), "uses": sorted(v["uses"])[:12], "refs": sorted(v["refs"])}
    for k, v in sorted(by.items())
]
json.dump(out, open("data/sanskrit.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print(len(out), "Sanskrit names,", len({p for e in out for p in e["plants"]}), "plants")
