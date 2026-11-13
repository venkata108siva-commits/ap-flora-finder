"use client";

import { useMemo, useState } from "react";
import { BookOpen, Check, ChevronDown, ExternalLink, Info, Link2, MapPin, Microscope, TriangleAlert } from "lucide-react";
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
              <dd>{f.href ? <a href={f.href} target="_blank" rel="noreferrer">{f.value}</a> : f.italic ? <i>{f.value}</i> : f.value}</dd>
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
            {b.items.map((x, i) => (
              <div className={`bar ${x.highlight ? "hl" : ""}`} key={i}>
                <span className="lab">{x.label}</span>
                <span className="track">
                  <span className="fill" style={{ width: `${Math.max(2, (x.value / max) * 100)}%`, animationDelay: `${i * 40}ms` }} />
                </span>
                <span className="val">{new Intl.NumberFormat("en", { notation: "compact" }).format(x.value)}</span>
              </div>
            ))}
          </div>
        </div>
      );
    }
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
      return (
        <div>
          <h4 className="blk-title">
            Peer-reviewed studies <Mark v={b.verified} />
          </h4>
          <p className="total" style={{ margin: "-4px 0 10px" }}>
            <b>{new Intl.NumberFormat("en").format(b.total)}</b> published studies found · most relevant shown
          </p>
          <div className="papers">
            {b.items.map((p, i) => (
              <a className="paper" key={i} href={p.href} target="_blank" rel="noreferrer">
                <b>{p.title}</b>
                <div className="meta">
                  <span>{p.authors}</span>
                  {p.journal && (
                    <span>
                      <BookOpen size={12} style={{ verticalAlign: -1 }} /> {p.journal}
                    </span>
                  )}
                  <span>{p.year}</span>
                  {p.cited > 0 && <span>Cited {p.cited}×</span>}
                  {p.open && <span className="oa">Open access</span>}
                </div>
              </a>
            ))}
          </div>
        </div>
      );
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
