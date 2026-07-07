// Seed de demonstration : la Brand "Chart Fanatics" avec ses Seed Sources et
// sa Keyword Query (marques de depart citees dans CONTEXT.md). Idempotent.
import { repo } from "./db/db.ts";
import type { Brand } from "./domain/types.ts";

export function seedDemo(): Brand {
  const brand = repo.upsertBrand("Chart Fanatics");
  if (repo.listTargets(brand.id).length === 0) {
    repo.addTarget(brand.id, "seed_source", "reddit", "Daytrading", "r/Daytrading");
    repo.addTarget(brand.id, "seed_source", "reddit", "Forex", "r/Forex");
    repo.addTarget(brand.id, "keyword_query", "reddit", "Chart Fanatics", "mentions");
    repo.addTarget(brand.id, "seed_source", "youtube", "Chart Fanatics", "YouTube channel");
    // Compte officiel de la marque : ses propres posts seront marques "official"
    // et exclus de la corroboration de Confidence (auto-promo).
    repo.setBrandOfficialHandles(brand.id, ["ChartFanatics"]);
  }
  return repo.getBrand(brand.id)!;
}
