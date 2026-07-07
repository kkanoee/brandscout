// Backend de collecte via CLI externe (ADR-0008) : shell-out vers un outil tiers
// (twitter-cli pour X, rdt-cli pour Reddit) qui rend du JSON, mappe vers RawPost.
//
// Securite : le query est passe en ARGUMENT (spawn sans shell) -> pas d'injection.
// Ces outils accedent aux plateformes de facon NON-OFFICIELLE via la session
// connectee de l'utilisateur (risque ToS + ban). BrandScout ne fait que les
// invoquer si l'utilisateur les a installes et configures.
import { spawn } from "node:child_process";
import type { RawPost, ConnectorName } from "../domain/types.ts";

const TIMEOUT_MS = 60_000;

function runCli(bin: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let child;
    try {
      // Force UTF-8 cote enfant : sur Windows la console par defaut est cp1252,
      // et ces CLIs Python plantent (UnicodeEncodeError) des qu'un post contient
      // un emoji / caractere non-latin1. On garantit une sortie UTF-8 stable.
      child = spawn(bin, args, {
        shell: false,
        env: { ...process.env, PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8" },
      });
    } catch (e) {
      reject(e);
      return;
    }
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`${bin} timeout (>${TIMEOUT_MS / 1000}s)`));
    }, TIMEOUT_MS);

    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(new Error(`${bin} introuvable/echec : ${e.message} (installe-le et configure le binaire)`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout);
      else reject(new Error(`${bin} exit ${code}: ${stderr.slice(0, 300)}`));
    });
  });
}

// Deballe une sortie CLI heterogene vers une liste d'items "post-like".
// Gere, en plus du tableau nu : l'enveloppe reelle {ok, schema_version, data}
// des CLIs, le Listing Reddit (data.data.children, chaque post sous child.data)
// et le tableau twitter sous data.
function extractItems(raw: string): any[] {
  const trimmed = raw.trim();
  let data: any;
  try {
    data = JSON.parse(trimmed);
  } catch {
    // tente le 1er bloc JSON (les CLIs loggent parfois sur stdout)
    const start = trimmed.search(/[[{]/);
    const end = Math.max(trimmed.lastIndexOf("]"), trimmed.lastIndexOf("}"));
    if (start < 0 || end <= start) return [];
    try {
      data = JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      return [];
    }
  }
  return normalizeItems(data);
}

// Un child Reddit est enveloppe { kind, data:{...} } -> on rend le .data reel.
function unwrapChild(item: any): any {
  return item && item.kind && item.data && typeof item.data === "object" ? item.data : item;
}

function normalizeItems(data: any, depth = 0): any[] {
  if (data == null || depth > 4) return [];
  if (Array.isArray(data)) return data.map(unwrapChild);
  // Listing Reddit : children a la racine ou sous .data
  const children = Array.isArray(data.children)
    ? data.children
    : Array.isArray(data?.data?.children)
      ? data.data.children
      : null;
  if (children) return children.map(unwrapChild);
  // Tableau direct sous une cle courante
  for (const k of ["items", "data", "results", "posts", "tweets"]) {
    if (Array.isArray(data[k])) return data[k].map(unwrapChild);
  }
  // Enveloppe {ok, data:{...}} -> on descend d'un cran
  if (data.data && typeof data.data === "object") return normalizeItems(data.data, depth + 1);
  return [];
}

function pick(o: any, keys: string[]): string | null {
  for (const k of keys) {
    const v = o?.[k];
    if (typeof v === "string" && v.trim()) return v;
    if (typeof v === "number") return String(v);
  }
  return null;
}

function toIso(v: string | null): string | null {
  if (!v) return null;
  if (/^\d+$/.test(v)) {
    const n = Number(v);
    return new Date(n > 1e12 ? n : n * 1000).toISOString(); // s ou ms epoch
  }
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

// author peut etre une string (fixtures, rdt) OU un objet (twitter: {screenName,name}).
function pickAuthor(item: any): string {
  const a = item?.author ?? item?.user;
  if (a && typeof a === "object") {
    return pick(a, ["screenName", "screen_name", "username", "name", "handle"]) ?? "unknown";
  }
  return pick(item, ["author", "user", "username", "author_name", "screen_name", "by"]) ?? "unknown";
}

// Reddit : le signal est titre + corps (le corps est vide sur un post-lien).
function contentFor(connector: ConnectorName, item: any): string | null {
  if (connector === "reddit") {
    const title = pick(item, ["title"]);
    const body = pick(item, ["selftext", "body", "text"]);
    if (title && body) return `${title}\n\n${body}`;
    return title ?? body ?? pick(item, ["content", "full_text"]);
  }
  return pick(item, ["text", "full_text", "content", "body", "selftext", "title"]);
}

// URL vers la DISCUSSION : permalink Reddit (relatif -> absolu), permalink tweet
// reconstruit depuis author+id si absent (le champ `urls` = liens cites, pas le tweet).
function buildUrl(connector: ConnectorName, item: any, author: string, externalId: string): string {
  if (connector === "reddit") {
    const p = pick(item, ["permalink"]);
    if (p) return p.startsWith("http") ? p : `https://www.reddit.com${p}`;
    return pick(item, ["url", "link"]) ?? "";
  }
  const direct = pick(item, ["url", "tweet_url", "permalink", "link"]);
  if (direct) return direct;
  if (author !== "unknown" && externalId) return `https://x.com/${author}/status/${externalId}`;
  return "";
}

// Mappe un item brut (champs heterogenes selon l'outil) vers un RawPost.
function mapItem(connector: ConnectorName, item: any): RawPost | null {
  const content = contentFor(connector, item);
  if (!content) return null;
  const author = pickAuthor(item);
  const externalId = pick(item, ["id", "id_str", "name"]) ?? String(Math.random()).slice(2);
  const publishedAt = toIso(
    pick(item, ["created_at", "created_utc", "createdAtISO", "createdAt", "createdAtLocal", "date", "timestamp", "time", "created"]),
  );
  const sub = pick(item, ["subreddit", "subreddit_name_prefixed"]);
  const sourceKey =
    connector === "reddit"
      ? sub
        ? sub.startsWith("r/")
          ? sub
          : `r/${sub}`
        : "reddit"
      : "x";
  const url = buildUrl(connector, item, author, externalId);
  return { connector, sourceKey, externalId, author, content, url, publishedAt };
}

// Recherche par mot-cle via le CLI. extraArgs permet d'ajuster (--max, --sort...).
export async function cliSearch(
  connector: ConnectorName,
  bin: string,
  query: string,
  extraArgs: string[] = [],
): Promise<RawPost[]> {
  const raw = await runCli(bin, ["search", query, "--json", ...extraArgs]);
  return extractItems(raw)
    .map((it) => mapItem(connector, it))
    .filter((p): p is RawPost => p !== null);
}

// Extrait les commentaires t1 d'une sortie `rdt read` : {data:[postListing, commentsListing]}.
function extractRedditComments(raw: string): any[] {
  let data: any;
  try {
    data = JSON.parse(raw.trim());
  } catch {
    return [];
  }
  const listings = Array.isArray(data?.data) ? data.data : [data?.data].filter(Boolean);
  const out: any[] = [];
  for (const listing of listings) {
    for (const ch of listing?.data?.children ?? []) {
      if (ch?.kind === "t1" && ch?.data?.body) out.push(ch.data);
    }
  }
  return out;
}

// Commentaires (Reddit `read`) / reponses (X `tweet`) d'une publication -> RawPost[].
export async function cliReplies(
  connector: ConnectorName,
  bin: string,
  parentId: string,
  extraArgs: string[] = [],
): Promise<RawPost[]> {
  if (connector === "x") {
    const raw = await runCli(bin, ["tweet", parentId, "--json", ...extraArgs]);
    // data[] = [tweet original, ...reponses] : on retire l'original par son id.
    return extractItems(raw)
      .filter((it) => String(it?.id ?? it?.id_str ?? "") !== String(parentId))
      .map((it) => mapItem(connector, it))
      .filter((p): p is RawPost => p !== null);
  }
  const raw = await runCli(bin, ["read", parentId, "--json", ...extraArgs]);
  return extractRedditComments(raw)
    .map((it) => mapItem(connector, it))
    .filter((p): p is RawPost => p !== null);
}

// Exporte le mapping pur pour les tests (sans spawn).
export function __mapItems(connector: ConnectorName, raw: string): RawPost[] {
  return extractItems(raw)
    .map((it) => mapItem(connector, it))
    .filter((p): p is RawPost => p !== null);
}
