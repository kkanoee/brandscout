// La preuve PLAFONNE la confiance (ADR-0003). Le tier est une fonction
// DETERMINISTE de la preuve — jamais l'aplomb du modele. Le LLM decrit a
// l'interieur du plafond ; il ne promeut jamais.
//
// Bareme v1 (ADR-0004) :
//   Intuition       : 0-1 Observation, aucune corroboration (inclut l'infere LLM).
//   Signal probable : >= CONF_MIN_AUTHORS auteurs independants, 1 seule source.
//   Fait verifie    : >= CONF_MIN_AUTHORS auteurs ET >= CONF_FACT_MIN_SOURCES sources distinctes.
//
// Independance v1 : 1 auteur = 1 voix ; repost/citation de meme origine = 1 voix.
import type { Observation, Post, ConfidenceTier } from "../domain/types.ts";
import { config } from "../config.ts";

export interface Evidence {
  distinctAuthors: number;
  distinctSources: number;
  tier: ConfidenceTier;
}

// posts : map postId -> Post (pour remonter auteur + sourceKey).
export function computeConfidence(
  observations: Observation[],
  posts: Map<number, Post>,
): Evidence {
  const authors = new Set<string>();
  const sources = new Set<string>();
  for (const o of observations) {
    const p = posts.get(o.postId);
    if (!p) continue;
    authors.add(p.author.toLowerCase()); // 1 auteur = 1 voix
    sources.add(p.sourceKey);
  }
  const distinctAuthors = authors.size;
  const distinctSources = sources.size;

  const { minAuthors, factMinSources } = config.confidence;

  let tier: ConfidenceTier;
  if (distinctAuthors >= minAuthors && distinctSources >= factMinSources) {
    tier = "fait_verifie";
  } else if (distinctAuthors >= minAuthors) {
    tier = "signal_probable";
  } else {
    tier = "intuition";
  }

  return { distinctAuthors, distinctSources, tier };
}

// Plafonne un tier propose a ce que la preuve autorise (le LLM ne surclasse jamais).
const ORDER: Record<ConfidenceTier, number> = {
  intuition: 0,
  signal_probable: 1,
  fait_verifie: 2,
};
export function cap(proposed: ConfidenceTier, allowed: ConfidenceTier): ConfidenceTier {
  return ORDER[proposed] <= ORDER[allowed] ? proposed : allowed;
}

export const TIER_LABEL: Record<ConfidenceTier, string> = {
  fait_verifie: "Fait vérifié",
  signal_probable: "Signal probable",
  intuition: "Intuition",
};
