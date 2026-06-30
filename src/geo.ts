// CLI prototype GEO (ADR-0007). Sonde des modeles d'IA sur une marque et imprime
// la matrice de reputation (presence / sentiment par modele).
//   node src/geo.ts "Chart Fanatics"           # fixtures (offline, gratuit)
//   node src/geo.ts "Chart Fanatics" --live     # appels reels via OpenRouter
import { geoSnapshot } from "./geo/run.ts";
import type { GeoSnapshot } from "./geo/types.ts";

function pad(s: string | number, n: number): string {
  return String(s).padEnd(n);
}
function padL(s: string | number, n: number): string {
  return String(s).padStart(n);
}

function printMatrix(snap: GeoSnapshot): void {
  const o = snap.overall;
  console.log("\n" + "=".repeat(72));
  console.log(`AI REPUTATION — ${snap.brand}  [${snap.live ? "live" : "fixtures"}]`);
  console.log("=".repeat(72));
  console.log(`Overall AI Reputation : ${o.aiReputation}/100`);
  console.log(`Presence (visibility) : ${o.presencePct}%   (${o.mentions}/${o.runs} answers mention the brand)`);
  console.log(`Sentiment             : +${o.positive} positive / ${o.neutral} neutral / -${o.risk} risk   (net ${o.net >= 0 ? "+" : ""}${o.net})`);

  console.log("\nAll models comparison");
  console.log(
    "  " + pad("Model", 26) + padL("Risk", 6) + padL("Neutral", 9) + padL("Positive", 10) +
    padL("Net", 6) + padL("Runs", 6) + padL("Presence", 10),
  );
  for (const m of snap.models) {
    console.log(
      "  " + pad(m.model, 26) + padL(m.risk, 6) + padL(m.neutral, 9) + padL(m.positive, 10) +
      padL((m.net >= 0 ? "+" : "") + m.net, 6) + padL(m.runs, 6) + padL(m.presencePct + "%", 10),
    );
  }

  // Risk topics tracables jusqu'a la reponse exacte du modele (provenance).
  const risky = snap.classified.filter((c) => c.riskTopics.length > 0);
  if (risky.length) {
    console.log("\nRisk topics (traced to the model's answer)");
    for (const c of risky) {
      for (const t of c.riskTopics) console.log(`  [${c.model}] ${t}`);
    }
  }
  console.log("");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const live = args.includes("--live");
  const brand = args.find((a) => !a.startsWith("--")) ?? "Chart Fanatics";
  const snap = await geoSnapshot(brand, { live });
  printMatrix(snap);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
