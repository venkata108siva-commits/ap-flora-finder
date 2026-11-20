// Sanskrit plant names from the Ayurvedic Pharmacopoeia of India (via IMPPAT, IMSc Chennai).
// Supports Roman spellings with or without diacritics (haridra, haridrā) and Devanagari (हरिद्रा).
import data from "@/data/sanskrit.json";

export type SanskritEntry = { sa: string; plants: string[]; parts: string[]; uses: string[]; refs: string[] };
const ENTRIES = data as SanskritEntry[];

/* ---------- Devanagari → IAST ---------- */
const VOWELS: Record<string, string> = { "अ": "a", "आ": "ā", "इ": "i", "ई": "ī", "उ": "u", "ऊ": "ū", "ऋ": "ṛ", "ॠ": "ṝ", "ऌ": "ḷ", "ए": "e", "ऐ": "ai", "ओ": "o", "औ": "au" };
const SIGNS: Record<string, string> = { "ा": "ā", "ि": "i", "ी": "ī", "ु": "u", "ू": "ū", "ृ": "ṛ", "ॄ": "ṝ", "ॢ": "ḷ", "े": "e", "ै": "ai", "ो": "o", "ौ": "au" };
const CONS: Record<string, string> = {
  "क": "k", "ख": "kh", "ग": "g", "घ": "gh", "ङ": "ṅ", "च": "c", "छ": "ch", "ज": "j", "झ": "jh", "ञ": "ñ",
  "ट": "ṭ", "ठ": "ṭh", "ड": "ḍ", "ढ": "ḍh", "ण": "ṇ", "त": "t", "थ": "th", "द": "d", "ध": "dh", "न": "n",
  "प": "p", "फ": "ph", "ब": "b", "भ": "bh", "म": "m", "य": "y", "र": "r", "ल": "l", "ळ": "ḷ", "व": "v",
  "श": "ś", "ष": "ṣ", "स": "s", "ह": "h",
};
const VIRAMA = "्";

export function devanagariToIAST(s: string): string {
  let out = "";
  const ch = [...s];
  for (let i = 0; i < ch.length; i++) {
    const c = ch[i];
    if (CONS[c] !== undefined) {
      out += CONS[c];
      const n = ch[i + 1];
      if (n === VIRAMA) i++;
      else if (n && SIGNS[n] !== undefined) {
        out += SIGNS[n];
        i++;
      } else out += "a";
    } else if (VOWELS[c] !== undefined) out += VOWELS[c];
    else if (c === "ं") out += "ṃ";
    else if (c === "ः") out += "ḥ";
    else if (c === "ँ") out += "m̐";
    else if (c === "़") continue;
    else out += c;
  }
  return out;
}

/* ---------- IAST → Devanagari (for display) ---------- */
const R_CONS = Object.entries(CONS).map(([d, r]) => [r, d] as const).sort((a, b) => b[0].length - a[0].length);
const R_VOW = Object.entries(VOWELS).map(([d, r]) => [r, d] as const).sort((a, b) => b[0].length - a[0].length);
const R_SIGN: Record<string, string> = Object.fromEntries(Object.entries(SIGNS).map(([d, r]) => [r, d]));

export function iastToDevanagari(s: string): string {
  const t = s.toLowerCase().normalize("NFC");
  let out = "";
  let i = 0;
  while (i < t.length) {
    const c = R_CONS.find(([r]) => t.startsWith(r, i));
    if (c) {
      out += c[1];
      i += c[0].length;
      const v = R_VOW.find(([r]) => t.startsWith(r, i));
      if (v) {
        if (v[0] !== "a") out += R_SIGN[v[0]] || "";
        i += v[0].length;
      } else out += VIRAMA;
      continue;
    }
    const v = R_VOW.find(([r]) => t.startsWith(r, i));
    if (v) {
      out += v[1];
      i += v[0].length;
      continue;
    }
    if (t[i] === "ṃ") out += "ं";
    else if (t[i] === "ḥ") out += "ः";
    else out += t[i];
    i++;
  }
  return out;
}

/* ---------- Spelling-tolerant key ---------- */
export function sanskritKey(s: string): string {
  let t = /[ऀ-ॿ]/.test(s) ? devanagariToIAST(s) : s;
  t = t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); // strip diacritics
  return t
    .replace(/[^a-z]/g, "")
    .replace(/ksh/g, "ks")
    .replace(/sh/g, "s")
    .replace(/ch/g, "c")
    .replace(/w/g, "v")
    .replace(/ri/g, "r")
    .replace(/ee/g, "i")
    .replace(/oo/g, "u")
    .replace(/([aeiou])\1+/g, "$1")
    .replace(/([bcdgjkptd])h/g, "$1") // aspirates: kh→k, th→t, dh→d …
    .replace(/m(?=[bp])/g, "n")
    .replace(/a$/, "");
}

/** Second key without the short "a", so everyday forms match (tulsi = tulasī, bhringraj = bhṛṅgarāja). */
const noSchwa = (k: string) => k.replace(/a/g, "");

const INDEX = ENTRIES.map((e) => ({ e, k: sanskritKey(e.sa), s: noSchwa(sanskritKey(e.sa)) }));

/** Finds Ayurvedic Pharmacopoeia entries matching a Sanskrit name (spelling- and prefix-tolerant). */
export function searchSanskrit(q: string, limit = 6): SanskritEntry[] {
  const k = sanskritKey(q);
  if (k.length < 3) return [];
  const s = noSchwa(k);
  const close = (a: string, b: string) => Math.min(a.length, b.length) / Math.max(a.length, b.length) >= 0.65;
  const exact = INDEX.filter((x) => x.k === k || x.s === s);
  const prefix = INDEX.filter(
    (x) =>
      !exact.includes(x) &&
      ((x.k.startsWith(k) && close(x.k, k)) || (x.k.length >= 4 && k.startsWith(x.k)) || (x.s.length >= 3 && x.s.startsWith(s) && close(x.s, s))),
  );
  return [...exact, ...prefix].slice(0, limit).map((x) => x.e);
}

/** All Sanskrit names recorded for a plant (by standardised scientific name). */
export function sanskritFor(plant: string): SanskritEntry[] {
  const p = plant.toLowerCase().trim();
  return ENTRIES.filter((e) => e.plants.some((x) => x.toLowerCase() === p));
}

export const API_SOURCE = {
  label: "Ayurvedic Pharmacopoeia of India (Govt of India), via IMPPAT 2.0 – IMSc Chennai",
  url: "https://cb.imsc.res.in/imppat/download",
};
