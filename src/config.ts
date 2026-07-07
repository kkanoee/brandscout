// Configuration centrale. Charge .env si present (Node >= 20.12 : process.loadEnvFile).
// Aucune valeur sensible n'est codee en dur : tout vient de l'environnement.
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const envPath = resolve(process.cwd(), ".env");
if (existsSync(envPath)) {
  try {
    process.loadEnvFile(envPath);
  } catch {
    // Non bloquant : on continue avec l'environnement courant.
  }
}

function str(name: string, fallback = ""): string {
  const v = process.env[name];
  return v === undefined || v === "" ? fallback : v;
}

function int(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

export type Mode = "live" | "fixtures" | "auto";

const mode = str("BRANDSCOUT_MODE", "auto") as Mode;

export const config = {
  mode,

  llm: {
    mechanicalModel: str("LLM_MECHANICAL_MODEL", "deepseek/deepseek-v4-flash"),
    judgmentModel: str("LLM_JUDGMENT_MODEL", "claude-opus-4-8"),
    // Backend du jugement : auto | anthropic | openrouter | mock (cf. router.ts).
    judgmentProvider: str("LLM_JUDGMENT_PROVIDER", "auto"),
    // Modele OpenRouter utilise si le jugement passe en mode gratuit.
    judgmentOpenrouterModel: str("LLM_JUDGMENT_OPENROUTER_MODEL", "deepseek/deepseek-v4-flash"),
    openrouterApiKey: str("OPENROUTER_API_KEY"),
    anthropicApiKey: str("ANTHROPIC_API_KEY"),
  },

  connectors: {
    youtubeApiKey: str("YOUTUBE_API_KEY"),
    redditClientId: str("REDDIT_CLIENT_ID"),
    redditClientSecret: str("REDDIT_CLIENT_SECRET"),
    redditUserAgent: str("REDDIT_USER_AGENT", "brandscout/1.0"),
    // Backend Reddit : "official" (OAuth Data API) ou "cli" (rdt-cli, non-officiel).
    redditBackend: str("REDDIT_BACKEND", "official"),
    // Binaires CLI-backend (ADR-0008) : X via twitter-cli, Reddit via rdt-cli.
    // A installer + session connectee. Le query est passe en argument (pas de shell).
    xCliBin: str("X_CLI_BIN", "twitter"),
    redditCliBin: str("REDDIT_CLI_BIN", "rdt"),
  },

  run: {
    windowMonths: int("RUN_WINDOW_MONTHS", 6),
    volumeCap: int("RUN_VOLUME_CAP", 500),
    prefilterMinLength: int("PREFILTER_MIN_LENGTH", 15),
  },

  // Seuils de Confidence (ADR-0004). Parametres ajustables ; la STRUCTURE
  // (independance par auteur, corroboration par sources distinctes) est durable.
  confidence: {
    minAuthors: int("CONF_MIN_AUTHORS", 3),
    factMinSources: int("CONF_FACT_MIN_SOURCES", 2),
  },

  server: {
    port: int("PORT", 4317),
    dbPath: str("DB_PATH", "data/brandscout.sqlite"),
  },

  // Piste GEO (ADR-0007) : modeles d'IA a sonder en live (ids OpenRouter).
  // A adapter selon les modeles que tu veux mesurer.
  geo: {
    models: str("GEO_MODELS", "openai/gpt-4o-mini,google/gemini-flash-1.5,x-ai/grok-2-1212"),
    // Sonder les modeles en LIVE pendant un Run ? Defaut non (evite un coût
    // surprise) : le Run inclut un snapshot GEO en fixtures sauf opt-in.
    liveInRun: str("GEO_LIVE_IN_RUN", "") === "1",
  },
} as const;

// Resout le mode effectif d'un sous-systeme selon la presence de ses cles.
export function effectiveMode(hasKeys: boolean): "live" | "fixtures" {
  if (config.mode === "live") return "live";
  if (config.mode === "fixtures") return "fixtures";
  return hasKeys ? "live" : "fixtures";
}
