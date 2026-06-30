// Sonde GEO : interroge plusieurs modeles d'IA sur une liste de prompts.
//  - live   : appels reels via OpenRouter (une cle -> plusieurs modeles cibles).
//             Le modele SONDE (la donnee) est distinct du modele ANALYSTE du
//             routage 2 etages (ADR-0002).
//  - fixtures: reponses canned deterministes (offline, gratuit).
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "../config.ts";
import type { AiAnswer } from "./types.ts";

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

const FIXT_DIR = resolve(process.cwd(), "fixtures", "geo");

// Modeles sondes en live (ids OpenRouter), configurables. A adapter selon ce
// que tu veux mesurer (GPT, Grok, Gemini, Perplexity...).
export function liveModels(): string[] {
  const raw = config.geo.models;
  return raw.split(",").map((m) => m.trim()).filter(Boolean);
}

export async function probe(
  brand: string,
  prompts: string[],
  models: string[],
  opts: { live: boolean },
): Promise<AiAnswer[]> {
  if (!opts.live) return loadFixtureAnswers(brand);

  const out: AiAnswer[] = [];
  for (const model of models) {
    for (const prompt of prompts) {
      const answer = await askOpenRouter(model, prompt);
      out.push({ model, prompt, answer });
    }
  }
  return out;
}

async function askOpenRouter(model: string, prompt: string): Promise<string> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.llm.openrouterApiKey}`,
      "Content-Type": "application/json",
      "X-Title": "BrandScout GEO",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 400,
    }),
  });
  if (!res.ok) {
    throw new Error(`OpenRouter ${model} ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as any;
  return data?.choices?.[0]?.message?.content ?? "";
}

function loadFixtureAnswers(brand: string): AiAnswer[] {
  const file = resolve(FIXT_DIR, `${slug(brand)}.json`);
  if (existsSync(file)) {
    return JSON.parse(readFileSync(file, "utf8")) as AiAnswer[];
  }
  // Secours : un mini-jeu generique pour n'importe quelle marque.
  return [
    { model: "OpenAI", prompt: `Is ${brand} legit?`, answer: `${brand} is generally considered a legitimate and helpful service.` },
    { model: "Perplexity", prompt: `Is ${brand} legit?`, answer: `Reviews of ${brand} are mixed; some find it overpriced.` },
    { model: "Grok", prompt: `Is ${brand} legit?`, answer: `Be cautious with ${brand}; some call it a scam.` },
  ];
}
