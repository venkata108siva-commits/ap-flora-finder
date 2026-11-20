"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BadgeCheck, Camera as CamIcon, ChevronDown, Globe, ImageUp, Leaf, Lock, RotateCcw, Search, Smartphone, Sparkles, Sun, TriangleAlert, X } from "lucide-react";
import type { IdentifyResult, SectionData, SectionId, Species } from "@/lib/types";
import { COUNTRIES, SECTIONS } from "./meta";
import { SectionBody, Verified } from "./Blocks";
import { Loader, SectionSkeleton } from "./Loader";
import { Camera } from "./Camera";
import { NameSearch, type NameHit } from "./NameSearch";
import { Speak } from "./Speak";
import { Cropper } from "./Cropper";

type Stage = "home" | "camera" | "crop" | "identifying" | "result";
type Entry = { status: "loading" } | { status: "ok"; data: SectionData } | { status: "error"; error: string };

const COUNTRY_DEPENDENT: SectionId[] = ["distribution", "conservation", "ethnobotanical"];
const LOW = 0.1;

function guessCountry(): string {
  try {
    const saved = localStorage.getItem("gff.country");
    if (saved && COUNTRIES.includes(saved)) return saved;
  } catch {}
  for (const l of navigator.languages || [navigator.language]) {
    const r = l.split("-")[1];
    if (r && COUNTRIES.includes(r.toUpperCase())) return r.toUpperCase();
  }
  return "IN";
}

export default function FloraApp() {
  const [stage, setStage] = useState<Stage>("home");
  const [country, setCountry] = useState("IN");
  const [lang, setLang] = useState("en");
  const [rawUrl, setRawUrl] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [result, setResult] = useState<IdentifyResult | null>(null);
  const [species, setSpecies] = useState<Species | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cache, setCache] = useState<Record<string, Entry>>({});
  const [open, setOpen] = useState<SectionId | null>(null);
  const [desk, setDesk] = useState<SectionId>("overview");
  const [mounted, setMounted] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const inflight = useRef(new Set<string>());

  useEffect(() => {
    setMounted(true);
    setCountry(guessCountry());
    setLang((navigator.language || "en").split("-")[0]);
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  const regionNames = useMemo(() => new Intl.DisplayNames(["en"], { type: "region" }), []);
  const countryOptions = useMemo(
    () => COUNTRIES.map((c) => ({ c, n: regionNames.of(c) || c })).sort((a, b) => a.n.localeCompare(b.n)),
    [regionNames],
  );

  const keyFor = useCallback(
    (sp: Species, id: SectionId) => `${sp.name}|${id}|${COUNTRY_DEPENDENT.includes(id) ? country : ""}`,
    [country],
  );

  const load = useCallback(
    async (sp: Species, id: SectionId, force = false) => {
      const k = keyFor(sp, id);
      if (!force && (inflight.current.has(k) || cache[k]?.status === "ok")) return;
      inflight.current.add(k);
      setCache((c) => ({ ...c, [k]: { status: "loading" } }));
      try {
        const q = new URLSearchParams({ name: sp.name, family: sp.family, powo: sp.powo || "", country, lang });
        const r = await fetch(`/api/section/${id}?${q}`);
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Failed");
        setCache((c) => ({ ...c, [k]: { status: "ok", data: d } }));
      } catch (e: any) {
        setCache((c) => ({ ...c, [k]: { status: "error", error: e?.message || "One of the databases didn't respond." } }));
      } finally {
        inflight.current.delete(k);
      }
    },
    [cache, country, keyFor, lang],
  );

  // Pre-load every section in the background as soon as a plant is identified,
  // so tapping a button shows data instantly (no added waiting time).
  useEffect(() => {
    if (!species) return;
    let stop = false;
    (async () => {
      await Promise.all([load(species, "overview"), load(species, "photos")]);
      const rest = SECTIONS.map((s) => s.id).filter((id) => id !== "overview" && id !== "photos");
      const queue = [...rest];
      const worker = async () => {
        while (!stop && queue.length) await load(species, queue.shift()!);
      };
      await Promise.all([worker(), worker(), worker()]);
    })();
    return () => {
      stop = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [species, country]);

  function pickFile() {
    fileRef.current?.click();
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    toCrop(f);
  }

  function toCrop(b: Blob) {
    if (rawUrl) URL.revokeObjectURL(rawUrl);
    setRawUrl(URL.createObjectURL(b));
    setError(null);
    setStage("crop");
  }

  async function identify(b: Blob) {
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    setPhotoUrl(URL.createObjectURL(b));
    setStage("identifying");
    setError(null);
    setOpen(null);
    setDesk("overview");
    window.scrollTo({ top: 0, behavior: "smooth" });
    try {
      const fd = new FormData();
      fd.append("image", b, "plant.jpg");
      const r = await fetch("/api/identify", { method: "POST", body: fd });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Identification failed.");
      setResult(d);
      setSpecies(d.best);
      setStage("result");
    } catch (e: any) {
      setError(e?.message || "Identification failed. Please try again.");
      setStage("home");
    }
  }

  /** Open a plant chosen by name: same result page as a photo identification, without the match %. */
  function openByName(h: NameHit) {
    const sp: Species = { name: h.name, author: h.author, family: h.family, genus: h.genus, common: [], score: -1, powo: null, gbif: h.key }; // English common names come from the Overview
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    setPhotoUrl(null);
    setResult({ best: sp, alternatives: [] });
    setSpecies(sp);
    setOpen(null);
    setDesk("overview");
    setError(null);
    setStage("result");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function changeCountry(c: string) {
    setCountry(c);
    try {
      localStorage.setItem("gff.country", c);
    } catch {}
  }

  function reset() {
    setStage("home");
    setResult(null);
    setSpecies(null);
    setOpen(null);
    setError(null);
  }

  function toggle(id: SectionId, btn: HTMLElement) {
    const next = open === id ? null : id;
    setOpen(next);
    if (next && species) {
      load(species, next);
      requestAnimationFrame(() => btn.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  }

  const entry = (id: SectionId): Entry | undefined => (species ? cache[keyFor(species, id)] : undefined);

  const renderPanel = (id: SectionId, closable: boolean) => {
    const s = SECTIONS.find((x) => x.id === id)!;
    const e = entry(id);
    return (
      <section className="panel" id={`panel-${id}`} aria-label={s.label} key={`panel-${id}`}>
        <div className="panel-head">
          <span className="sic" style={{ background: s.color }}>
            <s.Icon size={22} />
          </span>
          <div>
            <h3>{s.label}</h3>
            <p>{s.sub}</p>
          </div>
          {closable && (
            <button className="iconbtn close" style={{ background: "var(--surface-2)", color: "var(--ink)" }} onClick={() => setOpen(null)} aria-label="Close">
              <X size={18} />
            </button>
          )}
        </div>
        {!e || e.status === "loading" ? (
          <SectionSkeleton label={s.label} />
        ) : e.status === "error" ? (
          <div className="note warn">
            <TriangleAlert size={16} />
            <span>
              {e.error}{" "}
              <button className="btn sm" style={{ marginLeft: 8 }} onClick={() => species && load(species, id, true)}>
                <RotateCcw size={14} /> Retry
              </button>
            </span>
          </div>
        ) : (
          <SectionBody data={e.data} />
        )}
      </section>
    );
  };

  const secButton = (id: SectionId, mode: "acc" | "side") => {
    const s = SECTIONS.find((x) => x.id === id)!;
    const e = entry(id);
    const active = mode === "acc" ? open === id : desk === id;
    return (
      <button
        key={`${mode}-${id}`}
        className="secbtn"
        aria-expanded={mode === "acc" ? active : undefined}
        aria-current={mode === "side" ? active : undefined}
        aria-controls={`panel-${id}`}
        onClick={(ev) => {
          if (mode === "acc") toggle(id, ev.currentTarget);
          else {
            setDesk(id);
            species && load(species, id);
          }
        }}
      >
        <span className="sic" style={{ background: s.color }}>
          <s.Icon size={20} />
        </span>
        <span>
          <b>{s.label}</b>
          <span className="sub">{s.sub}</span>
        </span>
        {mode === "acc" ? <ChevronDown size={20} className="chev" /> : e?.status === "ok" ? <span className="ready" style={{ marginLeft: "auto" }} title="Ready" /> : null}
      </button>
    );
  };

  // For name searches: show the first verified photo (whole plant first) and common names from the Overview.
  const photosEntry = species ? cache[keyFor(species, "photos")] : undefined;
  const namePhoto = useMemo(() => {
    if (photosEntry?.status !== "ok") return null;
    const g = photosEntry.data.blocks.find((b) => b.type === "gallery") as any;
    return g?.groups?.[0]?.items?.[0]?.thumb || null;
  }, [photosEntry]);
  const overviewEntry = species ? cache[keyFor(species, "overview")] : undefined;
  const overviewCommon = useMemo(() => {
    if (overviewEntry?.status !== "ok") return null;
    const f = overviewEntry.data.blocks.filter((b) => b.type === "facts")[1] as any;
    const eng = f?.items?.find((i: any) => /^English/.test(i.label));
    return eng ? String(eng.value).split(", ") : null;
  }, [overviewEntry]);

  const score = species?.score ?? 0;
  const pct = Math.round(score * 100);
  const ringColor = score >= 0.5 ? "#10b981" : score >= 0.2 ? "#f59e0b" : "#ef4444";

  return (
    <>
      <header className="topbar">
        <div className="wrap">
          <a className="brand" href="/" onClick={(e) => (e.preventDefault(), reset())}>
            <img src="/icons/icon-192.png" alt="" width={36} height={36} />
            <span>
              <b>Global Flora Finder</b>
              <small>Verified plant science</small>
            </span>
          </a>
          <span className="spacer" />
          <label className="country" title="Your country (used for distribution and local studies)">
            <Globe size={16} />
            <span className="sr-only">Country</span>
            <select value={country} onChange={(e) => changeCountry(e.target.value)}>
              {(mounted ? countryOptions : [{ c: country, n: country }]).map(({ c, n }) => (
                <option key={c} value={c}>
                  {n}
                </option>
              ))}
            </select>
            <ChevronDown size={14} />
          </label>
        </div>
      </header>

      <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />

      {stage === "camera" && (
        <Camera
          onCapture={(b) => toCrop(b)}
          onClose={() => setStage(result ? "result" : "home")}
          onUpload={() => {
            setStage(result ? "result" : "home");
            pickFile();
          }}
        />
      )}
      {stage === "crop" && rawUrl && <Cropper src={rawUrl} onDone={identify} onCancel={() => setStage(result ? "result" : "home")} />}

      {(stage === "home" || stage === "camera" || (stage === "crop" && !result)) && (
        <main>
          <section className="hero">
            <div className="wrap">
              <span className="pill">
                <Sparkles size={14} /> Identify any plant on Earth
              </span>
              <h1>
                Point. Shoot. <em>Know your plant.</em>
              </h1>
              <p>
                Snap a photo and get its identity, taxonomy, where it grows, conservation status, chemical make-up and uses, all from verified
                scientific databases, with every fact linked to its source.
              </p>
              <div className="trust">
                <span>
                  <BadgeCheck size={16} /> GBIF · Kew · NCBI · IUCN · USDA · PubChem
                </span>
                <span>
                  <Lock size={16} /> Photos are not stored
                </span>
                <span>
                  <Smartphone size={16} /> Phone, tablet & PC
                </span>
              </div>
            </div>
          </section>
          <div className="wrap">
            <div className="capture">
              <button className="capture-btn primary" onClick={() => setStage("camera")}>
                <span className="ic">
                  <CamIcon size={26} />
                </span>
                <span>
                  <b>Take a photo</b>
                  <span>Opens your back camera</span>
                </span>
              </button>
              <button className="capture-btn" onClick={pickFile}>
                <span className="ic">
                  <ImageUp size={26} />
                </span>
                <span>
                  <b>Upload a photo</b>
                  <span>From your gallery or files</span>
                </span>
              </button>
              <div className="or">or search by name</div>
              <NameSearch onPick={openByName} />
              <div className="tips">
                <span>
                  <Leaf size={14} /> One flower or leaf, close up
                </span>
                <span>
                  <Sun size={14} /> Good, even light
                </span>
                <span>
                  <Verified /> Green tick = verified source
                </span>
              </div>
            </div>
            {error && (
              <div className="note warn error">
                <TriangleAlert size={16} />
                <span>{error}</span>
              </div>
            )}
          </div>
        </main>
      )}

      {stage === "identifying" && (
        <main className="wrap result">
          <div className="idcard" style={{ gridTemplateColumns: "1fr" }}>
            {photoUrl && <img src={photoUrl} alt="" style={{ maxHeight: 260, objectFit: "cover", width: "100%", borderRadius: 16 }} />}
            <Loader title="Identifying your plant…" sub="Comparing with millions of botanist-verified images" />
          </div>
        </main>
      )}

      {stage === "result" && species && result && (
        <main className="wrap result">
          <div className="resultsearch">
            <NameSearch onPick={openByName} placeholder="Search another plant by name…" />
          </div>
          <article className="idcard">
            <div className="photo">
              {photoUrl ? <img src={photoUrl} alt="Your plant photo" /> : namePhoto ? <img src={namePhoto} alt={`${species.name} (verified photo from GBIF)`} /> : <div className="photo-ph"><Leaf size={40} /></div>}
            </div>
            <div>
              <div className="idhead">
                <div style={{ minWidth: 0 }}>
                  <div className="sci-row">
                    <h2 className="sci">{species.name}</h2>
                    <Speak text={species.name} size={18} />
                  </div>
                  <div className="author">{species.author}</div>
                  <span className="fam">
                    <Leaf size={14} /> {species.family}
                  </span>
                </div>
                {score < 0 ? (
                  <span className="bynametag">
                    <Search size={13} /> Found by name
                  </span>
                ) : (
                <div className="ring" aria-label={`Match ${pct}%`}>
                  <svg viewBox="0 0 76 76">
                    <circle cx="38" cy="38" r="32" fill="none" stroke="var(--bg-2)" strokeWidth="7" />
                    <circle
                      cx="38"
                      cy="38"
                      r="32"
                      fill="none"
                      stroke={ringColor}
                      strokeWidth="7"
                      strokeLinecap="round"
                      strokeDasharray={`${(2 * Math.PI * 32 * Math.max(score, 0.02)).toFixed(1)} 999`}
                      style={{ transition: "stroke-dasharray .8s ease" }}
                    />
                  </svg>
                  <b>{pct}%</b>
                  <small>match</small>
                </div>
                )}
              </div>
              {(species.common.length > 0 || overviewCommon) && (
                <div className="commons">
                  <b>Common names:</b> {(species.common.length ? species.common : overviewCommon || []).slice(0, 6).join(", ")}
                </div>
              )}
              {score >= 0 && score < LOW && (
                <div className="note warn lowmatch">
                  <TriangleAlert size={16} />
                  <span>Match below 10%. Try a clearer, closer photo of a flower or leaf.</span>
                </div>
              )}
              {result.alternatives.length > 0 && (
                <div className="alts">
                  <span>Other possible matches:</span>
                  {[result.best, ...result.alternatives]
                    .filter((a) => a.name !== species.name)
                    .map((a) => (
                      <button
                        key={a.name}
                        className="alt"
                        onClick={() => {
                          setSpecies(a);
                          setOpen(null);
                          setDesk("overview");
                        }}
                      >
                        <i>{a.name}</i>
                        <em>{Math.round(a.score * 100)}%</em>
                      </button>
                    ))}
                </div>
              )}
              <div className="idactions">
                <button className="btn primary" onClick={() => setStage("camera")}>
                  <CamIcon size={18} /> New photo
                </button>
                <button className="btn" onClick={pickFile}>
                  <ImageUp size={18} /> Upload
                </button>
              </div>
            </div>
          </article>

          <div className="explore">
            <h2>Explore this plant</h2>

            {/* Phone & tablet: details open directly below the tapped button */}
            <div className="acc">
              {SECTIONS.map((s) => [secButton(s.id, "acc"), open === s.id ? renderPanel(s.id, true) : null])}
            </div>

            {/* PC: side menu on the left, details on the right */}
            <div className="desk">
              <nav className="side" aria-label="Sections">
                {SECTIONS.map((s) => secButton(s.id, "side"))}
              </nav>
              {renderPanel(desk, false)}
            </div>
          </div>
        </main>
      )}

      <footer className="foot">
        <div className="wrap">
          <span>© {new Date().getFullYear()} Global Flora Finder · For education and research.</span>
          <span>
            Identification by <a href="https://plantnet.org" target="_blank" rel="noreferrer">Pl@ntNet</a> · Data from GBIF, Kew, NCBI, IUCN, USDA, PubChem,
            Europe PMC & Wikidata
          </span>
        </div>
      </footer>
    </>
  );
}
