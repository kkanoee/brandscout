// CLI utilitaire (debug / etape 8). L'interface v1 reste la web app (ADR-0006) ;
// ce CLI sert a lancer un Run et inspecter le Report en console.
//   node src/cli.ts seed
//   node src/cli.ts run "Chart Fanatics"
//   node src/cli.ts report <runId>
import { repo } from "./db/db.ts";
import { seedDemo } from "./seed.ts";
import { executeRun } from "./pipeline/run.ts";
import { config } from "./config.ts";
import { TIER_LABEL } from "./pipeline/confidence.ts";
import type { ReportSection } from "./domain/types.ts";

const SECTION_LABEL: Record<ReportSection, string> = {
  perception: "Perception",
  strengths: "Points forts",
  critiques: "Critiques",
  themes: "Themes",
  opportunities: "Opportunites",
};

async function main(): Promise<void> {
  const [cmd, ...args] = process.argv.slice(2);

  if (cmd === "seed") {
    const b = seedDemo();
    console.log(`Brand seedee : #${b.id} ${b.name} (${repo.listTargets(b.id).length} cibles).`);
    return;
  }

  if (cmd === "run") {
    const name = args[0] ?? "Chart Fanatics";
    const brand = repo.findBrandByName(name) ?? (name === "Chart Fanatics" ? seedDemo() : null);
    if (!brand) {
      console.error(`Brand introuvable: ${name}`);
      process.exit(1);
    }
    const run = repo.createRun(brand.id, config.run.windowMonths, config.run.volumeCap);
    console.log(`Run #${run.id} sur « ${brand.name} » (mode ${config.mode})…\n`);
    await executeRun(run.id, { log: (m) => console.log("  " + m) });
    printReport(run.id);
    return;
  }

  if (cmd === "report") {
    const id = Number.parseInt(args[0] ?? "", 10);
    if (!Number.isFinite(id)) { console.error("runId invalide"); process.exit(1); }
    printReport(id);
    return;
  }

  console.log("Usage: node src/cli.ts [seed | run <brand> | report <runId>]");
}

function printReport(runId: number): void {
  const run = repo.getRun(runId);
  if (!run) { console.error("Run introuvable"); return; }
  const brand = repo.getBrand(run.brandId)!;
  const report = repo.getReport(runId);
  const findings = repo.listFindings(runId);

  console.log("\n" + "=".repeat(70));
  console.log(`REPORT — ${brand.name} — Run #${runId} [${run.status}]`);
  console.log("=".repeat(70));
  if (run.stats) {
    const s = run.stats;
    console.log(`Posts: ${s.collected} collectes / ${s.kept} gardes / ${s.filtered} ecartes`);
    console.log(`Observations: ${s.observations} | Findings: ${s.findings}\n`);
  }
  if (report) console.log("PERCEPTION\n  " + report.overview + "\n");

  const order: ReportSection[] = ["strengths", "critiques", "themes", "opportunities"];
  for (const section of order) {
    const items = findings.filter((f) => f.section === section);
    if (items.length === 0) continue;
    console.log(`\n## ${SECTION_LABEL[section]}`);
    for (const f of items) {
      console.log(`  [${TIER_LABEL[f.confidence]}] ${f.statement}`);
      console.log(`     preuve: ${f.distinctAuthors} auteur(s) / ${f.distinctSources} source(s)`);
    }
  }
  console.log("");
}

main().catch((e) => { console.error(e); process.exit(1); });
