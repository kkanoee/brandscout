// Routage LLM a deux etages derriere une abstraction (ADR-0002).
// L'id de modele est une CONFIG, jamais code en dur. Le modele gratuit est
// remplacable "en une ligne" (config.llm.mechanicalModel).
//
//  - Etage "mecanique" (fort volume, faible enjeu) -> owl-alpha via OpenRouter.
//  - Etage "jugement"  (faible volume, fort enjeu) -> Claude Opus 4.8 via Anthropic.
//
// Sans cle, l'etage bascule sur un provider mock deterministe (mode fixtures),
// pour que le pipeline tourne hors-ligne. Le principe des deux etages est la
// partie durable ; le choix du modele est facile a inverser.
import { config, effectiveMode } from "../config.ts";

export interface LlmMessage {
  role: "system" | "user";
  content: string;
}

export interface LlmRequest {
  system?: string;
  user: string;
  // Force une reponse JSON (on parse le 1er objet/array JSON trouve).
  json?: boolean;
  maxTokens?: number;
}

export interface LlmProvider {
  readonly stage: "mechanical" | "judgment";
  readonly model: string;
  complete(req: LlmRequest): Promise<string>;
}

export type ProviderKind = "openrouter" | "anthropic" | "mock";

// --- OpenRouter (etage mecanique) --------------------------------------------
class OpenRouterProvider implements LlmProvider {
  readonly stage = "mechanical" as const;
  readonly model: string;
  private readonly apiKey: string;
  constructor(model: string, apiKey: string) {
    this.model = model;
    this.apiKey = apiKey;
  }

  async complete(req: LlmRequest): Promise<string> {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        "X-Title": "BrandScout",
      },
      body: JSON.stringify({
        model: this.model,
        messages: toMessages(req),
        max_tokens: req.maxTokens ?? 2000,
        ...(req.json ? { response_format: { type: "json_object" } } : {}),
      }),
    });
    if (!res.ok) {
      throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);
    }
    const data = (await res.json()) as any;
    return data?.choices?.[0]?.message?.content ?? "";
  }
}

// --- Anthropic (etage jugement) ----------------------------------------------
class AnthropicProvider implements LlmProvider {
  readonly stage = "judgment" as const;
  readonly model: string;
  private readonly apiKey: string;
  constructor(model: string, apiKey: string) {
    this.model = model;
    this.apiKey = apiKey;
  }

  async complete(req: LlmRequest): Promise<string> {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: req.maxTokens ?? 2000,
        ...(req.system ? { system: req.system } : {}),
        messages: [{ role: "user", content: req.user }],
      }),
    });
    if (!res.ok) {
      throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
    }
    const data = (await res.json()) as any;
    const blocks = data?.content ?? [];
    return blocks.map((b: any) => b?.text ?? "").join("");
  }
}

function toMessages(req: LlmRequest): LlmMessage[] {
  const msgs: LlmMessage[] = [];
  if (req.system) msgs.push({ role: "system", content: req.system });
  msgs.push({ role: "user", content: req.user });
  return msgs;
}

// Le provider mock est defini a part (mock.ts) pour garder ce module focalise
// sur le routage reel. On l'importe paresseusement pour eviter tout couplage.
import { MockMechanicalProvider, MockJudgmentProvider } from "./mock.ts";

let mechanical: LlmProvider | null = null;
let judgment: LlmProvider | null = null;

export function getMechanical(): LlmProvider {
  if (mechanical) return mechanical;
  const live = effectiveMode(!!config.llm.openrouterApiKey) === "live";
  mechanical = live
    ? new OpenRouterProvider(config.llm.mechanicalModel, config.llm.openrouterApiKey)
    : new MockMechanicalProvider(config.llm.mechanicalModel);
  return mechanical;
}

export function getJudgment(): LlmProvider {
  if (judgment) return judgment;
  const live = effectiveMode(!!config.llm.anthropicApiKey) === "live";
  judgment = live
    ? new AnthropicProvider(config.llm.judgmentModel, config.llm.anthropicApiKey)
    : new MockJudgmentProvider(config.llm.judgmentModel);
  return judgment;
}

// Pour les tests : reinjecter des providers.
export function __setProviders(m: LlmProvider | null, j: LlmProvider | null): void {
  mechanical = m;
  judgment = j;
}

// Extrait le premier objet/array JSON d'une reponse LLM (tolere le texte autour).
export function parseJson<T>(raw: string): T {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    // cherche le 1er bloc { ... } ou [ ... ]
    const start = trimmed.search(/[[{]/);
    if (start >= 0) {
      const open = trimmed[start];
      const close = open === "[" ? "]" : "}";
      const end = trimmed.lastIndexOf(close);
      if (end > start) {
        return JSON.parse(trimmed.slice(start, end + 1)) as T;
      }
    }
    throw new Error(`Reponse LLM non-JSON: ${trimmed.slice(0, 200)}`);
  }
}
