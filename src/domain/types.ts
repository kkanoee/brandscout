// Modele de domaine BrandScout. Le vocabulaire suit CONTEXT.md (ubiquitous language).
// Volontairement agnostique du connecteur (ADR : "le modele de donnees reste
// agnostique du connecteur").

export type CollectionMode = "seed_source" | "keyword_query";
export type ConnectorName = "youtube" | "reddit";

export type RunStatus =
  | "pending"
  | "collecting"
  | "extracting"
  | "synthesizing"
  | "reporting"
  | "done"
  | "error";

// Trois tiers EXACTEMENT (CONTEXT.md). Calcules par la preuve, jamais par le LLM.
export type ConfidenceTier = "fait_verifie" | "signal_probable" | "intuition";

export type Sentiment = "positive" | "negative" | "neutral" | "mixed";
export type ObservationKind = "critique" | "praise" | "theme" | "mention";

// Sections du Report (note produit : perception, points forts, critiques, themes, opportunites).
export type ReportSection =
  | "perception"
  | "strengths"
  | "critiques"
  | "themes"
  | "opportunities";

export interface Brand {
  id: number;
  name: string;
  createdAt: string;
}

// Une Seed Source OU une Keyword Query rattachee a une Brand.
export interface CollectionTarget {
  id: number;
  brandId: number;
  mode: CollectionMode;
  connector: ConnectorName;
  value: string; // channel id / subreddit / mot-cle
  label: string | null;
  createdAt: string;
}

export interface Run {
  id: number;
  brandId: number;
  status: RunStatus;
  startedAt: string;
  finishedAt: string | null;
  windowMonths: number;
  volumeCap: number;
  error: string | null;
  stats: RunStats | null;
}

export interface RunStats {
  collected: number;
  kept: number;
  filtered: number;
  observations: number;
  findings: number;
}

// La matiere premiere : un element brut collecte.
export interface Post {
  id: number;
  runId: number;
  targetId: number | null;
  connector: ConnectorName;
  // La "source" au sens corroboration (ADR-0004) : r/<subreddit> ou yt/<channel>.
  // Deux subreddits differents = deux sources distinctes.
  sourceKey: string;
  externalId: string;
  author: string;
  content: string;
  url: string;
  publishedAt: string | null;
  collectedAt: string;
  kept: boolean;
  filteredReason: string | null;
}

// Un point de donnee atomique extrait d'UN Post.
export interface Observation {
  id: number;
  runId: number;
  postId: number;
  theme: string; // label normalise (sert au regroupement)
  sentiment: Sentiment;
  kind: ObservationKind;
  claim: string;
  createdAt: string;
}

// Une affirmation synthetique adossee a des Observations, portant toujours
// source(s) + date + Confidence.
export interface Finding {
  id: number;
  runId: number;
  section: ReportSection;
  theme: string | null;
  statement: string;
  confidence: ConfidenceTier;
  distinctAuthors: number;
  distinctSources: number;
  rationale: string | null;
  createdAt: string;
}

export interface Report {
  runId: number;
  overview: string;
  generatedAt: string;
}

// Ce qu'un connecteur renvoie avant persistance (sans id de run/db).
export interface RawPost {
  connector: ConnectorName;
  sourceKey: string;
  externalId: string;
  author: string;
  content: string;
  url: string;
  publishedAt: string | null;
}
