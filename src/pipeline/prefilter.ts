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

export interface PrefilterOptions {
  // Nom de la marque : requis dans le contenu des Posts issus d'une cible "gardee"
  // (seed source tierce, keyword query) — cf. brandGatedTargetIds.
  brand?: string;
  // Ids de targets dont les Posts DOIVENT mentionner la marque pour etre gardes.
  // Les sources propres a la marque (sa chaine YouTube) n'y sont pas, donc leurs
  // commentaires passent meme sans nommer la marque.
  brandGatedTargetIds?: Set<number>;
}

// Marque presente dans le texte ? Tolere espaces/tirets : "Chart Fanatics",
// "chart-fanatics" et "chartfanatics" matchent tous. Regarde le contenu ET le
// titre du thread/video (un commentaire peut ne pas renommer une marque dont le
// thread parle). Exporte pour les tests.
export function mentionsBrand(p: Pick<Post, "content" | "contextTitle">, brand: string): boolean {
  const hay = `${p.content ?? ""} ${p.contextTitle ?? ""}`.toLowerCase();
  const b = brand.toLowerCase();
  if (hay.includes(b)) return true;
  const alnum = (s: string) => s.replace(/[^a-z0-9]/g, "");
  return alnum(hay).includes(alnum(b));
}

export function prefilter(posts: Post[], opts: PrefilterOptions = {}): PrefilterResult {
  const minLen = config.run.prefilterMinLength;
  const seen = new Set<string>();
  const kept: Post[] = [];
  let filtered = 0;

  for (const p of posts) {
    const content = p.content ?? "";
    let reason: string | null = null;

    if (content.trim().length < minLen) {
      reason = "too short";
    } else if (isSpam(content)) {
      reason = "anti-spam";
    } else if (
      opts.brand &&
      p.targetId != null &&
      opts.brandGatedTargetIds?.has(p.targetId) &&
      !mentionsBrand(p, opts.brand)
    ) {
      reason = "off-brand";
    } else {
      const norm = normalize(content);
      if (seen.has(norm)) reason = "duplicate";
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
