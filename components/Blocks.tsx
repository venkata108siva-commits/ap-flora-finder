"use client";

import { useEffect, useMemo, useState } from "react";
import { BookOpen, Check, ChevronDown, ChevronLeft, ChevronRight, ExternalLink, Info, Link2, ListOrdered, MapPin, Microscope, TriangleAlert, X } from "lucide-react";
import { Speak } from "./Speak";
import type { Block, Cell, SectionData, Source } from "@/lib/types";

export function Verified({ title = "Verified source" }: { title?: string }) {
  return (
    <span className="check" title={title} aria-label={title}>
      <Check />
    </span>
  );
}

function Web() {
  return (
    <span className="web-tag" title="General web data – not verified">
      web
    </span>
  );
}

function Mark({ v }: { v?: boolean }) {
  return v ? <Verified /> : v === false ? <Web /> : null;
}

export function SectionBody({ data }: { data: SectionData }) {
  return (
    <>
      <Blocks blocks={data.blocks} />
      <Sources sources={data.sources} />
    </>
  );
}

export function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <div className="blocks">
      {blocks.map((b, i) => (
        <BlockView key={i} b={b} />
      ))}
    </div>
  );
}

function BlockView({ b }: { b: Block }) {
  switch (b.type) {
    case "facts":
      if (!b.items.length) return null;
      return (
        <dl className="facts">
          {b.items.map((f, i) => (
            <div className="fact" key={i}>
              <dt>
                {f.label} <Mark v={f.verified} />
              </dt>
              <dd>
                {f.href ? (
                  <a href={f.href} target="_blank" rel="noreferrer">
                    {f.value}
                  </a>
                ) : f.italic ? (
                  <>
                    <i>{f.value}</i> <Speak text={f.value.split(" ").filter((w, i) => i < 2 || /^(subsp|var)\.?$/.test(w)).slice(0, 4).join(" ")} size={14} />
                  </>
                ) : (
                  f.value
                )}
              </dd>
            </div>
          ))}
        </dl>
      );
    case "text":
      return (
        <div>
          {b.title && (
            <h4 className="blk-title">
              {b.title} <Mark v={b.verified} />
            </h4>
          )}
          <div className={`textblk ${b.image ? "has-img" : ""}`}>
            <p>{b.text}</p>
            {b.image && <img src={b.image} alt="" loading="lazy" />}
          </div>
          {!b.verified && b.via && <p className="caption">General web information from {b.via}. Not peer-reviewed.</p>}
        </div>
      );
    case "stats":
      return (
        <div className="stats">
          {b.items.map((s, i) => (
            <div className="stat" key={i}>
              <span>
                {s.label} <Mark v={s.verified} />
              </span>
              <b>{s.value}</b>
              {s.hint && <small>{s.hint}</small>}
            </div>
          ))}
        </div>
      );
    case "table":
      return <TableView b={b} />;
    case "lineage":
      return (
        <div>
          <h4 className="blk-title">
            Phylogenetic lineage <Mark v={b.verified} />
          </h4>
          <ol className="lineage">
            {b.items.map((x, i) => (
              <li key={i} className={x.clade ? "" : "rank"}>
                <span>{x.rank}</span>
                <b>{x.name}</b>
                {i === b.items.length - 1 && <Speak text={x.name} size={14} />}
              </li>
            ))}
          </ol>
        </div>
      );
    case "bars": {
      const max = Math.max(...b.items.map((x) => x.value), 1);
      return (
        <div>
          <h4 className="blk-title">
            {b.title} <Mark v={b.verified} />
          </h4>
          <div className="bars">
            {b.items.map((x, i) => {
              const inner = (
                <>
                  <span className="lab">{x.label}</span>
                  <span className="track">
                    <span className="fill" style={{ width: `${Math.max(2, (x.value / max) * 100)}%`, animationDelay: `${i * 40}ms` }} />
                  </span>
                  <span className="val">{new Intl.NumberFormat("en", { notation: "compact" }).format(x.value)}</span>
                </>
              );
              return x.href ? (
                <a className={`bar link ${x.highlight ? "hl" : ""}`} key={i} href={x.href} target="_blank" rel="noreferrer">
                  {inner}
                </a>
              ) : (
                <div className={`bar ${x.highlight ? "hl" : ""}`} key={i}>
                  {inner}
                </div>
              );
            })}
          </div>
          {b.caption && <p className="caption">{b.caption}</p>}
        </div>
      );
    }
    case "heading":
      return (
        <div className="mhead">
          {b.n != null && <span className="mnum">{b.n}</span>}
          <div>
            <h4>{b.text}</h4>
            {b.sub && <p>{b.sub}</p>}
          </div>
        </div>
      );
    case "gallery":
      return <Gallery b={b} />;
    case "map":
      return (
        <div>
          <h4 className="blk-title">
            {b.title} <Mark v={b.verified} />
          </h4>
          <div className="map">
            <img src={b.base} alt="World map" loading="lazy" />
            <img src={b.overlay} alt="Occurrence density" loading="lazy" />
          </div>
          {b.caption && <p className="caption">{b.caption}</p>}
        </div>
      );
    case "redlist":
      return <RedList code={b.code} verified={b.verified} />;
    case "chips":
      return (
        <div>
          {b.title && (
            <h4 className="blk-title">
              {b.title} <Mark v={b.verified} />
            </h4>
          )}
          <div className="chips">
            {b.items.map((c, i) =>
              c.href ? (
                <a key={i} className={`chip ${c.tone || ""}`} href={c.href} target="_blank" rel="noreferrer">
                  {c.label}
                </a>
              ) : (
                <span key={i} className={`chip ${c.tone || ""}`}>
                  {c.label}
                </span>
              ),
            )}
          </div>
        </div>
      );
    case "papers":
      return <PapersView b={b} />;
    case "records":
      return (
        <div>
          <h4 className="blk-title">
            {b.title} <Mark v={b.verified} />
          </h4>
          <div className="records">
            {b.items.map((r, i) => (
              <a className="rec" key={i} href={r.href} target="_blank" rel="noreferrer">
                <span className="dot">
                  <MapPin size={16} />
                </span>
                <span>
                  <b>{r.place}</b>
                  <span>
                    {r.date} · {r.kind}
                  </span>
                </span>
                <ExternalLink size={14} style={{ marginLeft: "auto", opacity: 0.5, flex: "none" }} />
              </a>
            ))}
          </div>
        </div>
      );
    case "note":
      return (
        <div className={`note ${b.tone === "warn" ? "warn" : ""}`}>
          {b.tone === "warn" ? <TriangleAlert size={16} /> : <Info size={16} />}
          <span>{b.text}</span>
        </div>
      );
    case "deep":
      return (
        <details className="deep">
          <summary>
            <Microscope size={16} /> {b.title}
            <ChevronDown size={16} className="chev" />
          </summary>
          <Blocks blocks={b.blocks} />
        </details>
      );
  }
}

function cellText(c: Cell) {
  return typeof c === "string" ? c : c.text;
}

function TableView({ b }: { b: Extract<Block, { type: "table" }> }) {
  const [filter, setFilter] = useState<string | null>(null);
  const options = useMemo(() => {
    if (b.filterColumn == null) return [];
    const s = new Map<string, number>();
    for (const r of b.rows) {
      const k = cellText(r[b.filterColumn]);
      s.set(k, (s.get(k) || 0) + 1);
    }
    return [...s.entries()].sort((a, b) => b[1] - a[1]);
  }, [b]);
  const rows = filter == null ? b.rows : b.rows.filter((r) => cellText(r[b.filterColumn!]) === filter);
  return (
    <div>
      {b.title && (
        <h4 className="blk-title">
          {b.title} <Mark v={b.verified} />
        </h4>
      )}
      {options.length > 1 && (
        <div className="filters" role="group" aria-label="Filter">
          <button className="fchip" aria-pressed={filter == null} onClick={() => setFilter(null)}>
            All · {b.rows.length}
          </button>
          {options.map(([k, n]) => (
            <button key={k} className="fchip" aria-pressed={filter === k} onClick={() => setFilter(k)}>
              {k} · {n}
            </button>
          ))}
        </div>
      )}
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              {b.columns.map((c, i) => (
                <th key={i} className={b.align?.[i] === "right" ? "r" : ""}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                {r.map((c, j) => (
                  <td key={j} className={b.align?.[j] === "right" ? "r" : ""}>
                    <CellView c={c} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {b.caption && <p className="caption">{b.caption}</p>}
    </div>
  );
}

function CellView({ c }: { c: Cell }) {
  if (typeof c === "string") return <>{c}</>;
  const inner = c.italic ? <i>{c.text}</i> : c.text;
  if (c.href)
    return (
      <a href={c.href} target="_blank" rel="noreferrer">
        {inner}
      </a>
    );
  return <span className={c.muted ? "muted" : ""}>{inner}</span>;
}

const RL = [
  { code: "LC", name: "Least Concern", color: "#16a34a" },
  { code: "NT", name: "Near Threatened", color: "#65a30d" },
  { code: "VU", name: "Vulnerable", color: "#eab308" },
  { code: "EN", name: "Endangered", color: "#f97316" },
  { code: "CR", name: "Critically Endangered", color: "#dc2626" },
  { code: "EW", name: "Extinct in the Wild", color: "#6b21a8" },
  { code: "EX", name: "Extinct", color: "#111827" },
];

function RedList({ code, verified }: { code: string; verified: boolean }) {
  const cur = RL.find((r) => r.code === code);
  return (
    <div>
      <h4 className="blk-title">
        IUCN Red List status <Mark v={verified} />
      </h4>
      <div className="redlist" role="img" aria-label={cur ? cur.name : "Not evaluated"}>
        {RL.map((r) => (
          <div key={r.code} className={`rl ${r.code === code ? "on" : ""}`} style={{ background: r.color }}>
            {r.code}
            <small>{r.name}</small>
          </div>
        ))}
      </div>
      <div className="rl-label">
        {cur ? (
          <>
            <span className="rl on" style={{ background: cur.color, opacity: 1, padding: "2px 8px", transform: "none", boxShadow: "none" }}>
              {cur.code}
            </span>
            {cur.name}
          </>
        ) : code === "DD" ? (
          "Data Deficient – not enough information to assess"
        ) : (
          "Not evaluated by the IUCN Red List"
        )}
      </div>
    </div>
  );
}

export function Sources({ sources }: { sources: Source[] }) {
  if (!sources.length) return null;
  const verified = sources.filter((s) => s.verified).length;
  return (
    <>
      <details className="sources">
        <summary>
          <Link2 size={16} /> Sources ({sources.length}) · tap to verify
          <ChevronDown size={16} className="chev" />
        </summary>
        <ol>
          {sources.map((s, i) => (
            <li key={i}>
              <a href={s.url} target="_blank" rel="noreferrer">
                {s.label}
              </a>
              {s.verified ? <Verified /> : null}
            </li>
          ))}
        </ol>
      </details>
      <div className="legend">
        <span>
          <Verified /> Verified scientific source ({verified})
        </span>
        <span>
          <Web /> General web data
        </span>
      </div>
    </>
  );
}

const TIER_LABELS = [
  "Systematic reviews & meta-analyses",
  "Randomised & clinical trials",
  "Review articles & guidelines",
  "Original research articles",
  "Case reports, letters & editorials",
  "Preprints (not yet peer-reviewed)",
];

function PapersView({ b }: { b: Extract<Block, { type: "papers" }> }) {
  const [showRank, setShowRank] = useState(false);
  const nf = new Intl.NumberFormat("en");
  const compact = new Intl.NumberFormat("en", { notation: "compact" });
  const tc = b.tierCounts || {};
  const max = Math.max(1, ...Object.values(tc).filter((n) => n > 0));
  return (
    <div>
      <div className="phead">
        <h4 className="blk-title" style={{ margin: 0 }}>
          {b.title || "Peer-reviewed studies"} <Mark v={b.verified} />
        </h4>
        {b.ranked && (
          <button type="button" className={`btn sm ${showRank ? "primary" : ""}`} onClick={() => setShowRank((v) => !v)} aria-expanded={showRank}>
            <ListOrdered size={14} /> Rank order
          </button>
        )}
      </div>
      <p className="total" style={{ margin: "6px 0 10px" }}>
        <b>{nf.format(b.total)}</b> published studies found · {b.ranked ? "standard studies first" : "top results shown"}
      </p>
      {showRank && (
        <div className="rankpanel">
          <div className="rankhead">
            <b>
              <ListOrdered size={15} /> How these papers are ranked
            </b>
            <button type="button" className="iconbtn sm" onClick={() => setShowRank(false)} aria-label="Close rank order">
              <X size={14} />
            </button>
          </div>
          <ol className="tiers">
            {TIER_LABELS.map((label, i) => {
              const n = tc[String(i + 1)];
              return (
                <li key={i}>
                  <span className={`tn t${i + 1}`}>{i + 1}</span>
                  <span className="tl">{label}</span>
                  <span className="track">
                    <span className="fill" style={{ width: n > 0 ? `${Math.max(2, (n / max) * 100)}%` : "0%" }} />
                  </span>
                  <span className="tc">{n == null ? "–" : n < 0 ? "?" : compact.format(n)}</span>
                </li>
              );
            })}
          </ol>
          <p className="caption" style={{ marginTop: 8 }}>
            Evidence tier first; within a tier, more-cited, MEDLINE-indexed, open-access and recent papers rank higher. Counts cover all matching studies.
          </p>
        </div>
      )}
      <div className="papers">
        {b.items.map((p, i) => (
          <a className="paper" key={i} href={p.href} target="_blank" rel="noreferrer">
            {p.tier && (
              <span className="rankbadge">
                {b.ranked && <span className="pos">#{i + 1}</span>}
                <span className={`tn t${p.tier}`}>{p.tier}</span>
                <span>{p.tierLabel}</span>
              </span>
            )}
            <b>{p.title}</b>
            <div className="meta">
              <Verified />
              <span>{p.authors}</span>
              {p.journal && (
                <span>
                  <BookOpen size={12} style={{ verticalAlign: -1 }} /> {p.journal}
                </span>
              )}
              <span>{p.year}</span>
              {p.cited > 0 && <span>Cited {nf.format(p.cited)}×</span>}
              {p.open && <span className="oa">Open access</span>}
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

function Gallery({ b }: { b: Extract<Block, { type: "gallery" }> }) {
  const [tab, setTab] = useState(b.groups[0]?.id);
  const [open, setOpen] = useState<number | null>(null);
  const g = b.groups.find((x) => x.id === tab) || b.groups[0];
  const items = g?.items || [];
  useEffect(() => {
    if (open == null) return;
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
      if (e.key === "ArrowRight") setOpen((i) => (i == null ? i : (i + 1) % items.length));
      if (e.key === "ArrowLeft") setOpen((i) => (i == null ? i : (i - 1 + items.length) % items.length));
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, items.length]);
  if (!g) return null;
  const cur = open != null ? items[open] : null;
  return (
    <div>
      <div className="ptabs" role="tablist" aria-label="Plant parts">
        {b.groups.map((x) => (
          <button key={x.id} role="tab" aria-selected={x.id === g.id} className="fchip" aria-pressed={x.id === g.id} onClick={() => (setTab(x.id), setOpen(null))}>
            {x.label} · {x.items.length}
          </button>
        ))}
      </div>
      <div className="pgrid">
        {items.map((p, i) => (
          <button key={p.thumb} className="pcell" onClick={() => setOpen(i)} aria-label={`Open photo ${i + 1} of ${g.label}`}>
            <img src={p.thumb} alt={`${g.label} photo by ${p.credit}`} loading="lazy" />
            <span className="pcap">© {p.credit}</span>
          </button>
        ))}
      </div>
      {b.note && <p className="caption">{b.note}</p>}
      {cur && (
        <div className="lightbox" role="dialog" aria-modal="true" aria-label="Photo" onClick={() => setOpen(null)}>
          <div className="lb-inner" onClick={(e) => e.stopPropagation()}>
            <img src={cur.full} alt={`${g.label} photo by ${cur.credit}`} />
            <div className="lb-meta">
              <span>
                <b>{g.label}</b> · © {cur.credit} · {cur.license}
                {cur.place ? ` · ${cur.place}` : ""}
                {cur.date ? ` · ${cur.date}` : ""}
              </span>
              <a href={cur.href} target="_blank" rel="noreferrer">
                <ExternalLink size={13} /> Original record <Verified />
              </a>
            </div>
            <button className="lb-btn lb-close" onClick={() => setOpen(null)} aria-label="Close">
              <X size={20} />
            </button>
            {items.length > 1 && (
              <>
                <button className="lb-btn lb-prev" onClick={() => setOpen((open! - 1 + items.length) % items.length)} aria-label="Previous photo">
                  <ChevronLeft size={24} />
                </button>
                <button className="lb-btn lb-next" onClick={() => setOpen((open! + 1) % items.length)} aria-label="Next photo">
                  <ChevronRight size={24} />
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
