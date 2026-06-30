// Classification GEO d'une reponse d'IA : la marque est-elle mentionnee, avec
// quel sentiment, et quels risk topics (claims negatifs ou hallucinations).
//  - live   : extraction par l'etage mecanique (owl-alpha) — comprend les claims.
//  - fixtures/offline : heuristique de lexique, deterministe (tests).
import { getMechanical, parseJson } from "../llm/router.ts";
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

// Selection live (LLM) vs offline (heuristique), alignee sur le mode de la sonde.
export async function classifyAnswers(
  brand: string,
  answers: AiAnswer[],
  opts: { live: boolean },
): Promise<AnswerClass[]> {
  if (!opts.live) return answers.map((a) => classifyHeuristic(brand, a));
  return Promise.all(answers.map((a) => classifyLLM(brand, a)));
}

const LLM_SYSTEM =
  "You analyze how an AI assistant's answer portrays a specific brand. " +
  "Be sober and factual. Output STRICT JSON.";

async function classifyLLM(brand: string, a: AiAnswer): Promise<AnswerClass> {
  const raw = await getMechanical().complete({
    system: LLM_SYSTEM,
    user: [
      "### TASK: geo_classify",
      `Brand: ${brand}`,
      "Decide: is the brand mentioned in the answer? what is the overall sentiment toward the brand",
      "(positive | neutral | risk, where 'risk' = negative OR factually doubtful/hallucinated)?",
      "List short risk topics = negative or false claims the answer makes about the brand.",
      'Format: {"present":true,"sentiment":"risk","riskTopics":["..."]}',
      "### ANSWER",
      a.answer,
    ].join("\n"),
    json: true,
    maxTokens: 400,
  });
  let p: { present?: boolean; sentiment?: string; riskTopics?: unknown };
  try {
    p = parseJson(raw);
  } catch {
    return classifyHeuristic(brand, a); // garde-fou : si le LLM derape, heuristique
  }
  const sentiment: GeoSentiment = (["positive", "neutral", "risk"] as const).includes(
    p.sentiment as GeoSentiment,
  )
    ? (p.sentiment as GeoSentiment)
    : "neutral";
  const riskTopics = Array.isArray(p.riskTopics)
    ? p.riskTopics.map((t) => String(t).trim()).filter(Boolean)
    : [];
  return {
    model: a.model,
    prompt: a.prompt,
    present: p.present ?? a.answer.toLowerCase().includes(brand.toLowerCase()),
    sentiment,
    riskTopics,
    answer: a.answer,
  };
}

export function classifyHeuristic(brand: string, a: AiAnswer): AnswerClass {
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
