"use client";

import { useEffect, useState } from "react";
import { Volume2 } from "lucide-react";

/**
 * Converts a botanical Latin name into an English-style phonetic spelling so the
 * browser's built-in voice pronounces it the way botanists usually say it
 * (traditional English pronunciation of botanical Latin).
 */
export function phonetic(name: string): string {
  return name
    .replace(/×/g, " hybrid ")
    .replace(/\b(subsp|ssp|var|f|cv)\.\s*/gi, (m) => ({ subsp: "subspecies ", ssp: "subspecies ", var: "variety ", f: "form ", cv: "cultivar " } as Record<string, string>)[m.replace(/\W/g, "").toLowerCase()] || m)
    .split(/\s+/)
    .map((w) => {
      if (!/^[A-Za-z-]+$/.test(w) || /^(subspecies|variety|form|cultivar|hybrid)$/.test(w)) return w;
      let s = w.toLowerCase();
      s = s.replace(/^(ps|pt|cn|gn|mn|tm)/, (m) => m.slice(1)); // silent first letter: Psidium, Pteris
      s = s.replace(/^x/, "z");
      s = s.replace(/aceae$/, "ay-see-ee");
      s = s.replace(/oides$/, "oy-deez");
      s = s.replace(/iae$/, "ee-ee");
      s = s.replace(/ii$/, "ee-eye");
      s = s.replace(/ae$/, "ee");
      s = s.replace(/ae/g, "ee").replace(/oe/g, "ee");
      s = s.replace(/ph/g, "f").replace(/rh/g, "r").replace(/ch/g, "k");
      s = s.replace(/([^aeiou])e$/, "$1ee"); // final -e is voiced: vulgare → vulgaree
      s = s.replace(/es$/, "eez");
      s = s.replace(/^y/, "i");
      return s;
    })
    .join(" ");
}

export function Speak({ text, size = 16, label }: { text: string; size?: number; label?: string }) {
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => setOk(typeof window !== "undefined" && "speechSynthesis" in window), []);
  if (!ok) return null;

  function say(rate: number) {
    const synth = window.speechSynthesis;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(phonetic(text));
    const voices = synth.getVoices();
    u.voice = voices.find((v) => /en[-_](GB|IN)/i.test(v.lang)) || voices.find((v) => /^en/i.test(v.lang)) || null;
    u.lang = u.voice?.lang || "en-GB";
    u.rate = rate;
    u.onstart = () => setBusy(true);
    u.onend = u.onerror = () => setBusy(false);
    synth.speak(u);
  }

  return (
    <span className="speak" role="group" aria-label={`Pronounce ${text}`}>
      <button type="button" className={`speak-btn ${busy ? "on" : ""}`} onClick={() => say(0.85)} title={`Pronounce ${text}`} aria-label={label || `Pronounce ${text}`}>
        <Volume2 size={size} />
      </button>
      <button type="button" className="speak-slow" onClick={() => say(0.55)} title="Pronounce slowly" aria-label={`Pronounce ${text} slowly`}>
        slow
      </button>
    </span>
  );
}
