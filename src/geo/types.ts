// Types de la piste GEO (source IA). Distincts du listening humain : le barème
// de Confidence (auteurs humains) ne s'y applique PAS (ADR-0007). Le GEO a ses
// propres metriques (presence, sentiment, accord inter-modeles, risk topics).

// Une reponse brute d'un modele a un prompt = un "Post" de la piste GEO.
export interface AiAnswer {
  model: string; // ex. "OpenAI", "openai/gpt-4o-mini"
  prompt: string;
  answer: string;
}

// Sentiment GEO : "risk" remplace "negative" (enjeu reputationnel).
export type GeoSentiment = "positive" | "neutral" | "risk";

export interface AnswerClass {
  model: string;
  prompt: string;
  present: boolean; // la marque est-elle mentionnee dans la reponse ?
  sentiment: GeoSentiment;
  riskTopics: string[]; // phrases negatives/fausses sur la marque
  answer: string; // conservee comme preuve (provenance)
}

// Une ligne de la matrice par modele (cf. dashboard "All models comparison").
export interface ModelScore {
  model: string;
  runs: number; // nombre de prompts sondes
  mentions: number; // reponses ou la marque apparait
  presencePct: number; // mentions / runs (0-100)
  positive: number;
  neutral: number;
  risk: number;
  net: number; // positive - risk
}

// Accord inter-modeles : un theme a risque releve par plusieurs modeles est plus
// solide (l'analogue, entre IA, de la corroboration humaine — ADR-0007).
export interface RiskTheme {
  theme: string;
  models: string[]; // modeles distincts qui l'ont releve
  mentions: number;
  corroborated: boolean; // >= 2 modeles distincts
}

export interface GeoSnapshot {
  brand: string;
  generatedAt: string;
  live: boolean;
  models: ModelScore[];
  riskThemes: RiskTheme[];
  overall: {
    runs: number;
    mentions: number;
    presencePct: number;
    positive: number;
    neutral: number;
    risk: number;
    net: number;
    aiReputation: number; // composite 0-100 (proxy prototype)
  };
  classified: AnswerClass[];
}
