// Etape 5 — Synthese + Confidence : Observation -> Finding via l'etage JUGEMENT
// (Opus). Tache faible volume / fort enjeu (ADR-0002). Le bareme calcule le tier
// (confidence.ts) ; le LLM redige le Finding A L'INTERIEUR du plafond — il ne
// promeut jamais (ADR-0003).
//
// Regroupement (decision tranchee ici) : par THEME normalise issu de l'extraction.
// Deterministe et tracable ; le clustering semantique fin est repousse en v2.
import type {
  Observation,
  Post,
  Finding,
  Sentiment,
  ReportSection,
} from "../domain/types.ts";
import { repo } from "../db/db.ts";
import { getJudgment, parseJson } from "../llm/router.ts";
import { computeConfidence } from "./confidence.ts";

// Le Report est TOUJOURS en anglais (preference produit) : on l'impose au modele.
const SYSTEM =
  "You are the judgment stage of a brand-analysis pipeline. You write Findings " +
  "(synthetic statements) from clusters of Observations. IMPORTANT: you do NOT " +
  "decide the confidence level; it is fixed by the evidence. You only describe, " +
  "soberly and without overstatement. ALWAYS write your output in English, no " +
  "matter what language the input is in. Respond in JSON.";

function dominantSentiment(obs: Observation[]): Sentiment {
  const counts: Record<Sentiment, number> = {
    positive: 0,
    negative: 0,
    neutral: 0,
    mixed: 0,
  };
  for (const o of obs) counts[o.sentiment]++;
  let best: Sentiment = "neutral";
  let max = -1;
  for (const s of ["positive", "negative", "neutral", "mixed"] as Sentiment[]) {
    if (counts[s] > max) { max = counts[s]; best = s; }
  }
  // tonalite reellement partagee si positif et negatif sont proches
  if (Math.abs(counts.positive - counts.negative) <= 1 && counts.positive > 0 && counts.negative > 0) {
    return "mixed";
  }
  return best;
}

function sectionFor(sent: Sentiment): ReportSection {
  if (sent === "positive") return "strengths";
  if (sent === "negative") return "critiques";
  return "themes";
}

interface SynthOut { statement: string; rationale: string; }

function buildPrompt(theme: string, sent: Sentiment, obs: Observation[]): string {
  const input = {
    theme,
    dominantSentiment: sent,
    observations: obs.slice(0, 30).map((o) => ({ claim: o.claim, sentiment: o.sentiment })),
  };
  return [
    "### TASK: synthesize",
    "Write ONE synthetic Finding for this cluster (1-2 factual sentences).",
    "Do not mention any confidence level. Stay within what the observations say.",
    "Write in English. Format: {\"statement\":\"...\",\"rationale\":\"...\"}",
    "### INPUT_JSON",
    JSON.stringify(input),
  ].join("\n");
}

export async function synthesize(
  runId: number,
  observations: Observation[],
  postsMap: Map<number, Post>,
): Promise<Finding[]> {
  const provider = getJudgment();

  // Regroupement deterministe par theme.
  const byTheme = new Map<string, Observation[]>();
  for (const o of observations) {
    const arr = byTheme.get(o.theme) ?? [];
    arr.push(o);
    byTheme.set(o.theme, arr);
  }

  const findings: Finding[] = [];
  for (const [theme, obs] of byTheme) {
    const sent = dominantSentiment(obs);
    const evidence = computeConfidence(obs, postsMap); // LE PLAFOND, deterministe

    const raw = await provider.complete({
      system: SYSTEM,
      user: buildPrompt(theme, sent, obs),
      json: true,
      maxTokens: 700,
    });
    let out: SynthOut;
    try {
      out = parseJson<SynthOut>(raw);
    } catch {
      out = { statement: `Topic "${theme}" raised in ${obs.length} observation(s).`, rationale: "" };
    }

    const finding = repo.insertFinding(
      {
        runId,
        section: sectionFor(sent),
        theme,
        statement: out.statement?.trim() || `Topic "${theme}".`,
        // Le tier vient de la preuve, pas du LLM (ADR-0003).
        confidence: evidence.tier,
        distinctAuthors: evidence.distinctAuthors,
        distinctSources: evidence.distinctSources,
        rationale: out.rationale?.trim() || null,
      },
      obs.map((o) => o.id),
    );
    findings.push(finding);
  }

  return findings;
}

// Opportunites : conclusions INFEREES par le LLM a partir des critiques.
// Par nature non corroborees -> tier "intuition" (ADR-0004 : "infere par le LLM").
export async function synthesizeOpportunities(
  runId: number,
  brand: string,
  observations: Observation[],
  findings: Finding[],
): Promise<Finding[]> {
  const critiques = findings.filter((f) => f.section === "critiques");
  if (critiques.length === 0) return [];

  const provider = getJudgment();
  const critiqueThemes = critiques.map((f) => ({
    theme: f.theme ?? "general",
    claim: f.statement,
  }));

  const raw = await provider.complete({
    system: SYSTEM,
    user: [
      "### TASK: opportunities",
      "From the recurring critiques, propose 1 to 3 actionable improvement opportunities.",
      "These are inferences (to investigate), not facts. Write in English.",
      'Format: {"opportunities":[{"statement":"..."}]}',
      "### INPUT_JSON",
      JSON.stringify({ brand, critiques: critiqueThemes }),
    ].join("\n"),
    json: true,
    maxTokens: 800,
  });

  let opps: Array<{ statement: string }> = [];
  try {
    opps = parseJson<{ opportunities: Array<{ statement: string }> }>(raw).opportunities ?? [];
  } catch {
    opps = [];
  }

  // Tracabilite : on relie chaque opportunite aux observations des critiques.
  const critiqueObsIds = critiques.flatMap((f) =>
    repo.listFindingObservations(f.id).map((o) => o.id),
  );

  const out: Finding[] = [];
  for (const opp of opps.slice(0, 3)) {
    if (!opp.statement?.trim()) continue;
    out.push(
      repo.insertFinding(
        {
          runId,
          section: "opportunities",
          theme: null,
          statement: opp.statement.trim(),
          confidence: "intuition", // infere -> jamais au-dessus
          distinctAuthors: 0,
          distinctSources: 0,
          rationale: "Inferred from the critiques; to investigate.",
        },
        critiqueObsIds,
      ),
    );
  }
  return out;
}
