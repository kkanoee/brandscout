// Scoring GEO : agrege les reponses classees en une matrice par modele + un
// snapshot global. NB : c'est un scoring PROPRE au GEO, distinct du barème de
// Confidence humain (ADR-0007).
import type { AnswerClass, ModelScore, GeoSnapshot } from "./types.ts";

function pct(n: number, d: number): number {
  return d === 0 ? 0 : Math.round((n / d) * 1000) / 10;
}

function scoreModel(model: string, rows: AnswerClass[]): ModelScore {
  const runs = rows.length;
  const mentions = rows.filter((r) => r.present).length;
  const positive = rows.filter((r) => r.present && r.sentiment === "positive").length;
  const neutral = rows.filter((r) => r.present && r.sentiment === "neutral").length;
  const risk = rows.filter((r) => r.present && r.sentiment === "risk").length;
  return {
    model,
    runs,
    mentions,
    presencePct: pct(mentions, runs),
    positive,
    neutral,
    risk,
    net: positive - risk,
  };
}

export function score(brand: string, live: boolean, classified: AnswerClass[]): GeoSnapshot {
  const byModel = new Map<string, AnswerClass[]>();
  for (const c of classified) {
    const arr = byModel.get(c.model) ?? [];
    arr.push(c);
    byModel.set(c.model, arr);
  }
  const models = [...byModel.entries()].map(([m, rows]) => scoreModel(m, rows));

  const runs = classified.length;
  const mentions = classified.filter((c) => c.present).length;
  const positive = classified.filter((c) => c.present && c.sentiment === "positive").length;
  const neutral = classified.filter((c) => c.present && c.sentiment === "neutral").length;
  const risk = classified.filter((c) => c.present && c.sentiment === "risk").length;
  const net = positive - risk;

  // Composite 0-100 (proxy prototype) : moitie visibilite, moitie sentiment net.
  const presScore = pct(mentions, runs);
  const sentScore = mentions === 0 ? 50 : ((net / mentions + 1) / 2) * 100;
  const aiReputation = Math.round(0.5 * presScore + 0.5 * sentScore);

  return {
    brand,
    generatedAt: new Date().toISOString(),
    live,
    models: models.sort((a, b) => b.net - a.net),
    overall: { runs, mentions, presencePct: presScore, positive, neutral, risk, net, aiReputation },
    classified,
  };
}
