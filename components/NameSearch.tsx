"use client";

import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";

export type NameHit = { key: number; name: string; author: string; family: string; genus: string; common?: string; via?: string; sanskrit?: string };

/** Search plants by scientific or common name (GBIF Backbone). */
export function NameSearch({ onPick, placeholder }: { onPick: (h: NameHit) => void; placeholder?: string }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<NameHit[]>([]);
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(0);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const t = useRef<any>(null);
  const reqId = useRef(0);

  useEffect(() => {
    clearTimeout(t.current);
    if (q.trim().length < 2) {
      setHits([]);
      return;
    }
    t.current = setTimeout(async () => {
      const my = ++reqId.current;
      setBusy(true);
      try {
        const r = await fetch(`/api/suggest?q=${encodeURIComponent(q.trim())}`);
        const d = await r.json();
        if (my !== reqId.current) return;
        setHits(d.items || []);
        setSel(0);
        setOpen(true);
      } catch {
      } finally {
        if (my === reqId.current) setBusy(false);
      }
    }, 220);
  }, [q]);

  useEffect(() => {
    const close = (e: MouseEvent) => !box.current?.contains(e.target as any) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const pick = (h: NameHit) => {
    setOpen(false);
    setQ("");
    setHits([]);
    onPick(h);
  };

  return (
    <div className="namesearch" ref={box}>
      <Search size={20} />
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => hits.length && setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") setSel((s) => Math.min(s + 1, hits.length - 1));
          else if (e.key === "ArrowUp") setSel((s) => Math.max(s - 1, 0));
          else if (e.key === "Enter" && hits[sel]) pick(hits[sel]);
          else if (e.key === "Escape") setOpen(false);
        }}
        placeholder={placeholder || "Search by scientific, common or Sanskrit name, e.g. Withania somnifera, neem, haridra, तुलसी"}
        aria-label="Search plants by name"
        aria-expanded={open}
        aria-autocomplete="list"
      />
      {open && q.trim().length >= 2 && (
        <div className="nsresults" role="listbox">
          {hits.map((h, i) => (
            <button key={h.key} role="option" aria-selected={i === sel} onMouseEnter={() => setSel(i)} onClick={() => pick(h)}>
              <span style={{ minWidth: 0 }}>
                <i>{h.name}</i> <span style={{ color: "var(--ink-3)", fontSize: ".82rem" }}>{h.author}</span>
                <small>
                  {h.sanskrit
                    ? `Sanskrit: ${h.sanskrit} · Ayurvedic Pharmacopoeia of India ✓`
                    : h.common
                      ? `Common name: ${h.common}`
                      : h.via
                        ? `Accepted name (${h.via})`
                        : "Accepted name · GBIF Backbone"}
                </small>
              </span>
              {h.family && <span className="fam">{h.family}</span>}
            </button>
          ))}
          {!busy && hits.length === 0 && <div style={{ padding: 12, fontSize: ".88rem", color: "var(--ink-3)" }}>No plant found with that name. Check the spelling or try the genus.</div>}
          {busy && hits.length === 0 && <div style={{ padding: 12, fontSize: ".88rem", color: "var(--ink-3)" }}>Searching…</div>}
        </div>
      )}
    </div>
  );
}
