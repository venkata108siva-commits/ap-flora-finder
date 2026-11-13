// Shared types between API routes and the UI.

export type Species = {
  name: string; // scientific name without author
  author: string;
  family: string;
  genus: string;
  common: string[];
  score: number; // 0..1
  powo?: string | null;
  gbif?: number | null;
};

export type IdentifyResult = {
  best: Species;
  alternatives: Species[];
  remaining?: number | null;
};

export type Source = { label: string; url: string; verified: boolean };

export type Fact = {
  label: string;
  value: string;
  verified?: boolean;
  href?: string;
  italic?: boolean;
};

export type Cell = string | { text: string; href?: string; italic?: boolean; muted?: boolean };

export type Block =
  | { type: "facts"; items: Fact[] }
  | { type: "text"; title?: string; text: string; verified: boolean; image?: string; via?: string }
  | { type: "stats"; items: { label: string; value: string; hint?: string; verified?: boolean }[] }
  | {
      type: "table";
      title?: string;
      verified: boolean;
      columns: string[];
      rows: Cell[][];
      align?: ("left" | "right")[];
      filterColumn?: number; // index of a column users can filter by (chips)
      caption?: string;
    }
  | { type: "lineage"; verified: boolean; items: { rank: string; name: string; clade?: boolean }[] }
  | { type: "bars"; title: string; verified: boolean; items: { label: string; value: number; highlight?: boolean }[]; unit?: string }
  | { type: "map"; title: string; base: string; overlay: string; verified: boolean; caption?: string }
  | { type: "redlist"; code: string; verified: boolean }
  | { type: "chips"; title?: string; verified: boolean; items: { label: string; href?: string; tone?: "native" | "introduced" | "neutral" }[] }
  | {
      type: "papers";
      verified: boolean;
      total: number;
      items: { title: string; authors: string; journal: string; year: string; cited: number; open: boolean; href: string }[];
    }
  | { type: "records"; title: string; verified: boolean; items: { place: string; date: string; kind: string; href: string }[] }
  | { type: "note"; tone: "info" | "warn"; text: string }
  | { type: "deep"; title: string; blocks: Block[] };

export type SectionData = {
  blocks: Block[];
  sources: Source[];
};

export type SectionId =
  | "overview"
  | "taxonomy"
  | "systematics"
  | "distribution"
  | "conservation"
  | "phytochemicals"
  | "medicinal"
  | "ethnobotanical"
  | "economic";
