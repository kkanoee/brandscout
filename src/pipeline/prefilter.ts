// Pre-filtre DETERMINISTE, applique AVANT le LLM (README "Enveloppe d'un Run") :
// longueur min, deduplication, anti-spam. Le mecanique degrossit pour que le
// jugement (LLM) ne paie pas de tokens sur du bruit. Les posts ecartes restent
// persistes (kept=0 + raison) pour l'auditabilite.
import type { Post } from "../domain/types.ts";
import { repo } from "../db/db.ts";
import { config } from "../config.ts";

const URL_RE = /https?:\/\/\S+/gi;

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function isSpam(content: string): boolean {
  const links = content.match(URL_RE)?.length ?? 0;
  if (links >= 3) return true; // bombardement de liens
  if (/(.)\1{9,}/.test(content)) return true; // caracteres repetes (aaaaaa...)
  const letters = content.replace(/[^a-z]/gi, "").length;
  if (letters > 0 && letters / content.length < 0.3 && content.length > 20) return true;
  return false;
}

export interface PrefilterResult {
  kept: Post[];
  filtered: number;
}

export function prefilter(posts: Post[]): PrefilterResult {
  const minLen = config.run.prefilterMinLength;
  const seen = new Set<string>();
  const kept: Post[] = [];
  let filtered = 0;

  for (const p of posts) {
    const content = p.content ?? "";
    let reason: string | null = null;

    if (content.trim().length < minLen) {
      reason = "trop court";
    } else if (isSpam(content)) {
      reason = "anti-spam";
    } else {
      const norm = normalize(content);
      if (seen.has(norm)) reason = "doublon";
      else seen.add(norm);
    }

    if (reason) {
      repo.markPostFiltered(p.id, reason);
      filtered++;
    } else {
      kept.push(p);
    }
  }
  return { kept, filtered };
}
