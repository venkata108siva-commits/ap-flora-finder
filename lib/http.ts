// Small fetch helpers used by the server-side data collectors.

export const UA = "GlobalFloraFinder/1.0 (educational plant identification app)";
const DAY = 86400;

export async function getJSON<T = any>(url: string, opts: { timeout?: number; headers?: Record<string, string> } = {}): Promise<T> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json", ...(opts.headers || {}) },
    signal: AbortSignal.timeout(opts.timeout ?? 12000),
    next: { revalidate: DAY },
  } as RequestInit);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json() as Promise<T>;
}

export async function getText(url: string, timeout = 12000): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(timeout),
    next: { revalidate: DAY },
  } as RequestInit);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}

/** Returns null instead of throwing, so one slow database never breaks a whole section. */
export async function safe<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch {
    return null;
  }
}

export function qs(params: Record<string, string | number | undefined>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") u.set(k, String(v));
  return u.toString();
}

export function cleanName(name: string): string {
  return name.replace(/[^A-Za-z×.\- ]/g, "").replace(/\s+/g, " ").trim();
}

export function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&");
}

export function stripTags(s: string): string {
  return decodeEntities(decodeEntities(s)).replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

export function fmt(n: number): string {
  return new Intl.NumberFormat("en").format(n);
}

/** Simple CSV parser that handles quoted fields with commas and double quotes. */
export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else q = false;
      } else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((x) => x !== "")) rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
