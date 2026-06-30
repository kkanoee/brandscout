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
      child = spawn(bin, args, { shell: false });
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

// Extrait le tableau d'items d'une sortie JSON (tolere les enveloppes courantes).
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
    data = JSON.parse(trimmed.slice(start, end + 1));
  }
  if (Array.isArray(data)) return data;
  for (const k of ["items", "data", "results", "posts", "tweets", "children"]) {
    if (Array.isArray(data?.[k])) return data[k];
  }
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

// Mappe un item brut (champs heterogenes selon l'outil) vers un RawPost.
function mapItem(connector: ConnectorName, item: any): RawPost | null {
  const content = pick(item, ["text", "content", "body", "selftext", "title", "full_text"]);
  if (!content) return null;
  const author = pick(item, ["author", "user", "username", "author_name", "screen_name", "by"]) ?? "unknown";
  const url = pick(item, ["url", "permalink", "link", "tweet_url"]) ?? "";
  const externalId = pick(item, ["id", "id_str", "name"]) ?? String(Math.random()).slice(2);
  const publishedAt = toIso(pick(item, ["created_at", "created_utc", "date", "timestamp", "time"]));
  const sub = pick(item, ["subreddit", "subreddit_name_prefixed"]);
  const sourceKey =
    connector === "reddit"
      ? sub
        ? sub.startsWith("r/")
          ? sub
          : `r/${sub}`
        : "reddit"
      : "x";
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

// Exporte le mapping pur pour les tests (sans spawn).
export function __mapItems(connector: ConnectorName, raw: string): RawPost[] {
  return extractItems(raw)
    .map((it) => mapItem(connector, it))
    .filter((p): p is RawPost => p !== null);
}
