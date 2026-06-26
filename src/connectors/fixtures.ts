// Chargeur de fixtures pour le mode hors-ligne. Cherche un fichier
// fixtures/<connector>/<slug(value)>.json ; sinon synthetise des Posts
// deterministes pour que n'importe quelle cible rende quand meme de la matiere.
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { CollectionTarget, RawPost, ConnectorName } from "../domain/types.ts";

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

const FIXT_DIR = resolve(process.cwd(), "fixtures");

export function loadFixturePosts(
  connector: ConnectorName,
  target: CollectionTarget,
): RawPost[] {
  const file = resolve(FIXT_DIR, connector, `${slug(target.value)}.json`);
  if (existsSync(file)) {
    const raw = JSON.parse(readFileSync(file, "utf8")) as RawPost[];
    return raw.map((p) => ({ ...p, connector }));
  }
  return synthesize(connector, target);
}

// Generation deterministe de secours (pas de fichier dedie).
function synthesize(connector: ConnectorName, target: CollectionTarget): RawPost[] {
  const base = connector === "reddit" ? `r/${target.value}` : `yt/${target.value}`;
  // URL de secours pointant vers une page REELLE (le lien de demo ne doit pas tomber en 404).
  const fallbackUrl =
    connector === "reddit"
      ? `https://www.reddit.com/r/${encodeURIComponent(target.value)}/`
      : `https://www.youtube.com/results?search_query=${encodeURIComponent(target.value)}`;
  const samples = [
    "Great content, the lessons are really clear and helpful for beginners.",
    "Honestly a bit overpriced for what you get, the course felt thin.",
    "Support ignored my refund request for a week, disappointing.",
    "Solid community on the discord, members actually help each other.",
    "The trading signals were confusing and I lost on a few setups.",
    "Best value I found, recommend it to anyone starting out.",
  ];
  return samples.map((content, i) => ({
    connector,
    sourceKey: base,
    externalId: `${slug(target.value)}-syn-${i}`,
    author: `user_${(i % 4) + 1}`,
    content,
    url: fallbackUrl,
    publishedAt: new Date(Date.now() - i * 86400000).toISOString(),
  }));
}
