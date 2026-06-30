// Classification GEO d'une reponse d'IA : la marque est-elle mentionnee, avec
// quel sentiment, et quels risk topics. Heuristique deterministe pour le
// prototype (G2 remplacera par une extraction LLM des claims/hallucinations).
import type { AiAnswer, AnswerClass, GeoSentiment } from "./types.ts";

const POSITIVE = [
  "legit", "legitimate", "trustworthy", "credible", "reliable", "reputable",
  "praised", "clear", "helpful", "recommend", "recommended", "well-regarded",
  "good", "positive", "solid", "quality", "valuable", "worth",
];
const RISK = [
  "scam", "misleading", "overpriced", "expensive", "refund", "steep",
  "not worth", "cautious", "caution", "avoid", "negative", "slow",
  "untrustworthy", "fake", "complaint", "complaints", "disappointed",
];

function countHits(text: string, words: string[]): number {
  const lc = text.toLowerCase();
  let n = 0;
  for (const w of words) if (lc.includes(w)) n++;
  return n;
}

export function classify(brand: string, a: AiAnswer): AnswerClass {
  const present = a.answer.toLowerCase().includes(brand.toLowerCase());

  let sentiment: GeoSentiment = "neutral";
  let riskTopics: string[] = [];

  if (present) {
    const pos = countHits(a.answer, POSITIVE);
    const neg = countHits(a.answer, RISK);
    if (neg > pos) sentiment = "risk";
    else if (pos > neg) sentiment = "positive";
    else sentiment = "neutral";

    if (neg > 0) {
      // Phrases negatives mentionnant la marque = risk topics (preuve gardee).
      riskTopics = a.answer
        .split(/(?<=[.!?])\s+/)
        .filter((s) => countHits(s, RISK) > 0)
        .map((s) => s.trim());
    }
  }

  return { model: a.model, prompt: a.prompt, present, sentiment, riskTopics, answer: a.answer };
}
