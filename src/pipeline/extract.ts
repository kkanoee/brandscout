// Etape 4 — Extraction : Post -> Observation via l'etage MECANIQUE (owl-alpha).
// Tache a fort volume / faible enjeu -> modele gratuit (ADR-0002). Donnees
// publiques uniquement : aucun secret ne transite par cet etage.
import type { Post, Observation, Sentiment, ObservationKind } from "../domain/types.ts";
import { repo } from "../db/db.ts";
import { getMechanical, parseJson } from "../llm/router.ts";

const BATCH = 20;

const SENTIMENTS: Sentiment[] = ["positive", "negative", "neutral", "mixed"];
const KINDS: ObservationKind[] = ["critique", "praise", "theme", "mention"];

interface RawObs {
  postId: number;
  theme: string;
  sentiment: string;
  kind: string;
  claim: string;
}

function normTheme(t: string): string {
  return (t || "general")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "general";
}

function coerceSentiment(s: string): Sentiment {
  const v = (s || "").toLowerCase() as Sentiment;
  return SENTIMENTS.includes(v) ? v : "neutral";
}
function coerceKind(k: string): ObservationKind {
  const v = (k || "").toLowerCase() as ObservationKind;
  return KINDS.includes(v) ? v : "mention";
}

const SYSTEM =
  "Tu es l'etage mecanique d'un pipeline d'analyse de marque. Tu extrais des " +
  "Observations atomiques a partir de Posts publics. Une Observation = un point " +
  "de donnee atomique d'UN post (une critique, un eloge, la mention d'un theme). " +
  "Reponds STRICTEMENT en JSON.";

function buildPrompt(posts: Post[]): string {
  const input = {
    posts: posts.map((p) => ({ id: p.id, content: p.content })),
  };
  return [
    "### TASK: extract",
    "Pour chaque post, extrais 0..2 Observations. Pour chacune, renvoie : ",
    "postId, theme (label court en snake_case), sentiment (positive|negative|neutral|mixed), ",
    "kind (critique|praise|theme|mention), claim (l'affirmation atomique, <=160 car).",
    'Format de sortie: {"observations":[{"postId":1,"theme":"pricing","sentiment":"negative","kind":"critique","claim":"..."}]}',
    "### INPUT_JSON",
    JSON.stringify(input),
  ].join("\n");
}

export async function extract(runId: number, posts: Post[]): Promise<Observation[]> {
  const provider = getMechanical();
  const all: Observation[] = [];

  for (let i = 0; i < posts.length; i += BATCH) {
    const batch = posts.slice(i, i + BATCH);
    const byId = new Map(batch.map((p) => [p.id, p]));
    const raw = await provider.complete({
      system: SYSTEM,
      user: buildPrompt(batch),
      json: true,
      maxTokens: 8000,
    });
    // Un batch dont la sortie LLM est illisible (tronquee irrecuperable, non-JSON)
    // ne doit PAS tuer le Run : on saute ce batch et on continue.
    let parsed: { observations: RawObs[] };
    try {
      parsed = parseJson<{ observations: RawObs[] }>(raw);
    } catch (e) {
      console.warn(`extract: batch ${i / BATCH} ignore (JSON illisible): ${(e as Error).message}`);
      continue;
    }
    for (const o of parsed.observations ?? []) {
      if (!byId.has(o.postId)) continue; // garde-fou : post hors batch
      if (!o.claim || !o.claim.trim()) continue;
      all.push(
        repo.insertObservation({
          runId,
          postId: o.postId,
          theme: normTheme(o.theme),
          sentiment: coerceSentiment(o.sentiment),
          kind: coerceKind(o.kind),
          claim: o.claim.trim(),
        }),
      );
    }
  }
  return all;
}
