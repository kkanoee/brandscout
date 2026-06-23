// Abstraction Connecteur : module d'integration propre a une plateforme qui
// implemente un ou plusieurs Collection Modes. Le modele de donnees reste
// agnostique du connecteur (CONTEXT.md). v1 : YouTube (seed_source), Reddit (les deux).
import type { CollectionTarget, RawPost, ConnectorName } from "../domain/types.ts";

export interface CollectOptions {
  windowMonths: number;
  volumeCap: number;
}

export interface Connector {
  readonly name: ConnectorName;
  // Modes supportes par ce connecteur en v1.
  supports(mode: CollectionTarget["mode"]): boolean;
  collect(target: CollectionTarget, opts: CollectOptions): Promise<RawPost[]>;
}

// Borne temporelle : timestamp ISO du debut de fenetre.
export function windowStart(windowMonths: number): Date {
  const d = new Date();
  d.setMonth(d.getMonth() - windowMonths);
  return d;
}

export function withinWindow(publishedAt: string | null, start: Date): boolean {
  if (!publishedAt) return true; // garde si date inconnue ; le pre-filtre tranchera
  const t = Date.parse(publishedAt);
  return Number.isNaN(t) ? true : t >= start.getTime();
}

import { config, effectiveMode } from "../config.ts";
import { YouTubeConnector } from "./youtube.ts";
import { RedditConnector } from "./reddit.ts";

export function getConnector(name: ConnectorName): Connector {
  switch (name) {
    case "youtube": {
      const live = effectiveMode(!!config.connectors.youtubeApiKey) === "live";
      return new YouTubeConnector(live);
    }
    case "reddit": {
      const hasKeys =
        !!config.connectors.redditClientId && !!config.connectors.redditClientSecret;
      const live = effectiveMode(hasKeys) === "live";
      return new RedditConnector(live);
    }
    default:
      throw new Error(`Connecteur inconnu: ${name}`);
  }
}
