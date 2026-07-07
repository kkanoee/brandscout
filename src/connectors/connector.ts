// Abstraction Connecteur : module d'integration propre a une plateforme qui
// implemente un ou plusieurs Collection Modes. Le modele de donnees reste
// agnostique du connecteur (CONTEXT.md). v1 : YouTube (seed_source), Reddit (les deux).
import type { CollectionTarget, RawPost, ConnectorName, Post } from "../domain/types.ts";

export interface CollectOptions {
  windowMonths: number;
  volumeCap: number;
  // Nom de la Brand analysee. Sert a filtrer une seed source tierce a la
  // pertinence marque (chercher la marque DANS la communaute, pas la ratisser).
  brand: string;
}

export interface Connector {
  readonly name: ConnectorName;
  // Modes supportes par ce connecteur en v1.
  supports(mode: CollectionTarget["mode"]): boolean;
  collect(target: CollectionTarget, opts: CollectOptions): Promise<RawPost[]>;
  // Profondeur (optionnel) : commentaires/reponses d'une publication deja collectee.
  // Les RawPost renvoyes ont parentExternalId = post.externalId.
  fetchReplies?(post: Post, opts: { max: number }): Promise<RawPost[]>;
}

// Recherche par PHRASE exacte quand la requete a plusieurs mots : sans guillemets,
// les moteurs (Reddit, twitter-cli) eclatent "Chart Academy" en OR et matchent
// "chart" / "academy" separement (bruit : Academy Award, Binance Academy...).
export function asPhrase(q: string): string {
  const t = q.trim();
  return /\s/.test(t) ? `"${t}"` : t;
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
import { XConnector } from "./x.ts";

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
    case "x":
      return new XConnector();
    default:
      throw new Error(`Connecteur inconnu: ${name}`);
  }
}
