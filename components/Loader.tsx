export function Sprout({ className = "sprout" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 84 84" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#10b981" />
          <stop offset="1" stopColor="#a3e635" />
        </linearGradient>
      </defs>
      <circle cx="42" cy="42" r="38" stroke="url(#lg)" strokeOpacity="0.25" strokeWidth="3" />
      <path className="stem" d="M42 70 C42 58 42 50 42 36" stroke="#0d7a4f" strokeWidth="4" strokeLinecap="round" />
      <path className="leafL" d="M41 48 C30 50 22 42 22 32 C32 31 40 37 41 48Z" fill="url(#lg)" />
      <path className="leafR" d="M43 40 C45 28 55 22 64 24 C64 35 55 41 43 40Z" fill="#10b981" />
      <rect className="scan" x="16" y="41" width="52" height="2" rx="1" fill="#a3e635" />
    </svg>
  );
}

export function Loader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="loader" role="status" aria-live="polite">
      <Sprout />
      <div>
        <b>{title}</b>
        {sub && <span style={{ display: "block" }}>{sub}</span>}
      </div>
    </div>
  );
}

export function SectionSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-live="polite">
      <div className="mini-sprout">
        <Sprout className="sprout mini" />
        Fetching {label.toLowerCase()} from verified sources…
      </div>
      <div className="skel">
        <i />
        <i />
        <i />
        <i />
      </div>
    </div>
  );
}
