// Orchestrateur GEO : prompts -> sonde des modeles -> classification -> matrice.
// Un "snapshot GEO" (un Run, multi-modeles, a l'instant T) — coherent avec le
// modele on-demand de v1 (ADR-0007). Le suivi continu = v2.
import { config } from "../config.ts";
import { probe, liveModels } from "./probe.ts";
import { classify } from "./analyze.ts";
import { score } from "./score.ts";
import type { GeoSnapshot } from "./types.ts";

// Prompts par defaut : 1 prompt de CATEGORIE (teste la visibilite) + des prompts
// de MARQUE (testent sentiment/risque). L'utilisateur fournira les siens en vrai.
export function defaultPrompts(brand: string): string[] {
  return [
    "What are the best chart pattern trading courses?",
    `Is ${brand} a legit trading education service?`,
    `What do people say about ${brand} pricing?`,
    `Should I trust ${brand} to learn trading?`,
  ];
}

export interface GeoRunOptions {
  prompts?: string[];
  models?: string[];
  live?: boolean;
}

export async function geoSnapshot(brand: string, opts: GeoRunOptions = {}): Promise<GeoSnapshot> {
  const prompts = opts.prompts ?? defaultPrompts(brand);
  // Live seulement si demande ET cle OpenRouter presente (sinon fixtures).
  const live = !!opts.live && !!config.llm.openrouterApiKey;
  const models = opts.models ?? (live ? liveModels() : ["OpenAI", "Perplexity", "Grok"]);

  const answers = await probe(brand, prompts, models, { live });
  const classified = answers.map((a) => classify(brand, a));
  return score(brand, live, classified);
}
