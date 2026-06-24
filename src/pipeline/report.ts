// Etape 6 — Report : document structure (perception, points forts, critiques,
// themes, opportunites) ou chaque Finding se deplie jusqu'aux Posts. Ici on
// genere la synthese de perception (vue d'ensemble) via l'etage jugement ; les
// Findings sont deja persistes et tracables.
import type { Finding, Report } from "../domain/types.ts";
import { repo } from "../db/db.ts";
import { getJudgment, parseJson } from "../llm/router.ts";

const SYSTEM =
  "You write the overview (perception) of a brand report, in 2-4 sober sentences. " +
  "No superlatives, no invented confidence level. ALWAYS write in English, no " +
  "matter what language the input is in. Respond in JSON.";

export async function generateReport(
  runId: number,
  brand: string,
  findings: Finding[],
): Promise<Report> {
  const provider = getJudgment();
  const raw = await provider.complete({
    system: SYSTEM,
    user: [
      "### TASK: overview",
      "Write the overall perception from the Findings (do not invent any). Write in English.",
      'Format: {"overview":"..."}',
      "### INPUT_JSON",
      JSON.stringify({
        brand,
        findings: findings.map((f) => ({ statement: f.statement, confidence: f.confidence })),
      }),
    ].join("\n"),
    json: true,
    maxTokens: 600,
  });

  let overview: string;
  try {
    overview = parseJson<{ overview: string }>(raw).overview?.trim() || "";
  } catch {
    overview = "";
  }
  if (!overview) {
    overview = `Perception of ${brand}: ${findings.length} finding(s), each traceable down to the Posts.`;
  }

  return repo.saveReport(runId, overview);
}
