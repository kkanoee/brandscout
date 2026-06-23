// Etape 6 — Report : document structure (perception, points forts, critiques,
// themes, opportunites) ou chaque Finding se deplie jusqu'aux Posts. Ici on
// genere la synthese de perception (vue d'ensemble) via l'etage jugement ; les
// Findings sont deja persistes et tracables.
import type { Finding, Report } from "../domain/types.ts";
import { repo } from "../db/db.ts";
import { getJudgment, parseJson } from "../llm/router.ts";

const SYSTEM =
  "Tu rediges la vue d'ensemble (perception) d'un rapport de marque, en 2-4 " +
  "phrases sobres. Pas de superlatifs, pas de niveau de confiance invente. JSON.";

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
      "Redige la perception generale a partir des Findings (sans en inventer).",
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
    overview = `Perception de ${brand} : ${findings.length} conclusion(s) tracable(s) jusqu'aux Posts.`;
  }

  return repo.saveReport(runId, overview);
}
