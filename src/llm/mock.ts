// Providers LLM mock (mode fixtures). Deterministes et hors-ligne : ils traitent
// REELLEMENT le texte (heuristiques de lexique) pour que la logique du pipeline
// — regroupement, plafond de Confidence, assemblage du Report — soit exercee de
// bout en bout sans cle API. Ce ne sont pas des stubs vides.
//
// Couplage assume : les mocks lisent un bloc d'entree delimite par les marqueurs
// "### TASK:" et "### INPUT_JSON" que posent extract.ts / synthesize.ts. C'est le
// seul point de contact avec le format de prompt ; documente ici.
import type { LlmProvider, LlmRequest } from "./router.ts";
import { parseJson } from "./router.ts";
import type { Sentiment, ObservationKind } from "../domain/types.ts";

const POSITIVE = [
  "good", "great", "love", "best", "helpful", "excellent", "amazing", "clear",
  "worth", "recommend", "solid", "legit", "improved", "useful", "quality",
  "bon", "super", "genial", "excellent", "clair", "utile", "recommande", "fiable",
];
const NEGATIVE = [
  "bad", "scam", "overpriced", "expensive", "useless", "waste", "poor", "slow",
  "confusing", "misleading", "refund", "disappointed", "ignored", "spam", "fake",
  "mauvais", "arnaque", "cher", "inutile", "deçu", "decu", "lent", "trompeur",
];

// Mots-cles -> theme normalise (sert au regroupement deterministe).
const THEME_MAP: Array<[RegExp, string]> = [
  [/\b(price|pricing|cost|expensive|overpriced|prix|cher|tarif|refund|rembours)/i, "pricing"],
  [/\b(support|help|service|response|reply|ignored|ticket|aide|reponse)/i, "support"],
  [/\b(course|content|lesson|material|tutorial|video|cours|contenu|formation)/i, "content_quality"],
  [/\b(scam|legit|trust|fake|honest|misleading|arnaque|fiable|confiance|trompeur)/i, "trust"],
  [/\b(discord|community|group|members|communaut|membres)/i, "community"],
  [/\b(signal|signals|call|calls|setup|trade|entry|chart)/i, "trading_signals"],
  [/\b(beginner|newbie, |start|onboarding|debutant|demarrer)/i, "onboarding"],
  [/\b(result|profit|gain|loss|performance|resultat|perte)/i, "results"],
];

function lexScore(text: string, words: string[]): number {
  const lc = text.toLowerCase();
  let n = 0;
  for (const w of words) if (lc.includes(w)) n++;
  return n;
}

function classify(text: string): { sentiment: Sentiment; kind: ObservationKind; theme: string } {
  const pos = lexScore(text, POSITIVE);
  const neg = lexScore(text, NEGATIVE);
  let sentiment: Sentiment;
  if (pos > 0 && neg > 0) sentiment = "mixed";
  else if (pos > neg) sentiment = "positive";
  else if (neg > pos) sentiment = "negative";
  else sentiment = "neutral";

  let theme = "general";
  for (const [re, label] of THEME_MAP) {
    if (re.test(text)) { theme = label; break; }
  }

  let kind: ObservationKind;
  if (sentiment === "negative") kind = "critique";
  else if (sentiment === "positive") kind = "praise";
  else kind = theme === "general" ? "mention" : "theme";

  return { sentiment, kind, theme };
}

function summarize(text: string, max = 160): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : clean.slice(0, max - 1).trimEnd() + "…";
}

// Recupere le bloc JSON pose apres "### INPUT_JSON".
function readInput<T>(prompt: string): T {
  const marker = "### INPUT_JSON";
  const idx = prompt.indexOf(marker);
  const body = idx >= 0 ? prompt.slice(idx + marker.length) : prompt;
  return parseJson<T>(body);
}

function readTask(prompt: string): string {
  const m = prompt.match(/### TASK:\s*(\w+)/);
  return m ? m[1]! : "unknown";
}

interface ExtractInput { posts: Array<{ id: number; content: string }>; }
interface SynthClusterInput {
  theme: string;
  dominantSentiment: Sentiment;
  observations: Array<{ claim: string; sentiment: Sentiment }>;
}
interface OverviewInput {
  brand: string;
  findings: Array<{ statement: string; confidence: string }>;
}
interface OppInput { brand: string; critiques: Array<{ theme: string; claim: string }>; }

export class MockMechanicalProvider implements LlmProvider {
  readonly stage = "mechanical" as const;
  readonly model: string;
  constructor(model: string) {
    this.model = model;
  }

  async complete(req: LlmRequest): Promise<string> {
    const task = readTask(req.user);
    if (task === "extract") {
      const input = readInput<ExtractInput>(req.user);
      const out = input.posts.map((p) => {
        const c = classify(p.content);
        return {
          postId: p.id,
          theme: c.theme,
          sentiment: c.sentiment,
          kind: c.kind,
          claim: summarize(p.content),
        };
      });
      return JSON.stringify({ observations: out });
    }
    return JSON.stringify({ observations: [] });
  }
}

export class MockJudgmentProvider implements LlmProvider {
  readonly stage = "judgment" as const;
  readonly model: string;
  constructor(model: string) {
    this.model = model;
  }

  async complete(req: LlmRequest): Promise<string> {
    const task = readTask(req.user);

    if (task === "synthesize") {
      const c = readInput<SynthClusterInput>(req.user);
      const n = c.observations.length;
      const label = c.theme.replace(/_/g, " ");
      const statement =
        `On the topic of "${label}", the dominant perception is ${c.dominantSentiment} ` +
        `(${n} observation${n > 1 ? "s" : ""}).`;
      const rationale = `Deterministic synthesis of the "${label}" cluster: ${n} observation(s), ${c.dominantSentiment} tone.`;
      return JSON.stringify({ statement, rationale });
    }

    if (task === "overview") {
      const o = readInput<OverviewInput>(req.user);
      const facts = o.findings.filter((f) => f.confidence === "fait_verifie").length;
      const signals = o.findings.filter((f) => f.confidence === "signal_probable").length;
      const overview =
        `Perception of ${o.brand}: ${o.findings.length} finding(s), ` +
        `including ${facts} verified fact(s) and ${signals} probable signal(s). ` +
        `Every finding below is traceable down to its source Posts.`;
      return JSON.stringify({ overview });
    }

    if (task === "opportunities") {
      const o = readInput<OppInput>(req.user);
      const byTheme = new Map<string, number>();
      for (const c of o.critiques) byTheme.set(c.theme, (byTheme.get(c.theme) ?? 0) + 1);
      const opps = [...byTheme.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([theme]) => ({
          statement: `Opportunity: address the recurring critiques about "${theme.replace(/_/g, " ")}" for ${o.brand}.`,
        }));
      return JSON.stringify({ opportunities: opps });
    }

    return JSON.stringify({});
  }
}
