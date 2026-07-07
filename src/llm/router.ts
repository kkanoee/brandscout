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

// --- OpenRouter (etage mecanique, ou jugement en mode gratuit) ----------------
// Peut servir les DEUX etages : owl-alpha est gratuit, et comme le tier de
// Confidence est calcule par du code deterministe (confidence.ts), un modele
// gratuit au jugement ne peut pas surclasser un Finding — il ne fait que rediger
// la prose dans le plafond. Option "gratuit pour la v1" (voir README).
class OpenRouterProvider implements LlmProvider {
  readonly stage: "mechanical" | "judgment";
  readonly model: string;
  private readonly apiKey: string;
  constructor(model: string, apiKey: string, stage: "mechanical" | "judgment" = "mechanical") {
    this.model = model;
    this.apiKey = apiKey;
    this.stage = stage;
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

// Backend de l'etage jugement, selectionnable (LLM_JUDGMENT_PROVIDER) :
//   anthropic  : Claude (qualite max, ~quelques centimes/Run)
//   openrouter : modele gratuit owl-alpha (cout zero ; le plafond de Confidence
//                reste garanti par le code, cf. confidence.ts)
//   mock       : hors-ligne deterministe
//   auto (def) : anthropic si cle Anthropic, sinon openrouter si cle OpenRouter,
//                sinon mock
export function getJudgment(): LlmProvider {
  if (judgment) return judgment;

  // Mode fixtures = entierement hors-ligne : le jugement reste mock.
  if (config.mode === "fixtures") {
    judgment = new MockJudgmentProvider(config.llm.judgmentModel);
    return judgment;
  }

  const hasAnthropic = !!config.llm.anthropicApiKey;
  const hasOpenrouter = !!config.llm.openrouterApiKey;

  let backend = config.llm.judgmentProvider;
  if (backend === "auto") {
    backend = hasAnthropic ? "anthropic" : hasOpenrouter ? "openrouter" : "mock";
  }

  if (backend === "anthropic" && hasAnthropic) {
    judgment = new AnthropicProvider(config.llm.judgmentModel, config.llm.anthropicApiKey);
  } else if (backend === "openrouter" && hasOpenrouter) {
    judgment = new OpenRouterProvider(
      config.llm.judgmentOpenrouterModel,
      config.llm.openrouterApiKey,
      "judgment",
    );
  } else {
    judgment = new MockJudgmentProvider(config.llm.judgmentModel);
  }
  return judgment;
}

// Pour les tests : reinjecter des providers.
export function __setProviders(m: LlmProvider | null, j: LlmProvider | null): void {
  mechanical = m;
  judgment = j;
}

// Repare un JSON tronque (sortie LLM coupee a max_tokens) : coupe apres le
// dernier element complet et referme les conteneurs encore ouverts. Renvoie null
// si rien de recuperable. Ignore le contenu des strings (guillemets echappes).
function repairTruncatedJson(s: string): string | null {
  let inStr = false;
  let esc = false;
  const stack: string[] = [];
  let lastSafe = -1; // index (inclus) d'une fin d'element complet a l'interieur d'un conteneur
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{" || c === "[") stack.push(c === "{" ? "}" : "]");
    else if (c === "}" || c === "]") {
      if (stack.length) stack.pop();
      if (stack.length >= 1) lastSafe = i; // element ferme, encore dans un conteneur
    }
  }
  if (lastSafe < 0) return null;
  const head = s.slice(0, lastSafe + 1);
  // recalcule les conteneurs restes ouverts sur head, puis les referme
  const open: string[] = [];
  let is = false;
  let es = false;
  for (let i = 0; i < head.length; i++) {
    const c = head[i];
    if (is) {
      if (es) es = false;
      else if (c === "\\") es = true;
      else if (c === '"') is = false;
      continue;
    }
    if (c === '"') is = true;
    else if (c === "{") open.push("}");
    else if (c === "[") open.push("]");
    else if (c === "}" || c === "]") open.pop();
  }
  return head + open.reverse().join("");
}

// Extrait le premier objet/array JSON d'une reponse LLM (tolere le texte autour
// et une sortie tronquee a max_tokens).
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
        try {
          return JSON.parse(trimmed.slice(start, end + 1)) as T;
        } catch {
          // sortie probablement tronquee : on tente une reparation
        }
      }
      const repaired = repairTruncatedJson(trimmed.slice(start));
      if (repaired) return JSON.parse(repaired) as T;
    }
    throw new Error(`Reponse LLM non-JSON: ${trimmed.slice(0, 200)}`);
  }
}
