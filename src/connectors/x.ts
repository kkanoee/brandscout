// Connecteur X / Twitter (ADR-0008). Acces NON-OFFICIEL via twitter-cli (shell-out),
// qui utilise la session connectee de l'utilisateur. Piste v2 assumee (ADR-0001).
// Sans installation / hors mode live, bascule sur fixtures (offline).
import type { CollectionTarget, RawPost } from "../domain/types.ts";
import type { Connector, CollectOptions } from "./connector.ts";
import { loadFixturePosts } from "./fixtures.ts";
import { cliSearch } from "./cliBackend.ts";
import { config } from "../config.ts";

export class XConnector implements Connector {
  readonly name = "x" as const;

  supports(mode: CollectionTarget["mode"]): boolean {
    // Keyword Query = recherche d'un terme ; Seed Source = un compte/@handle.
    return mode === "keyword_query" || mode === "seed_source";
  }

  async collect(target: CollectionTarget, opts: CollectOptions): Promise<RawPost[]> {
    // Live uniquement en mode "live" explicite (evite de spawn un CLI absent).
    if (config.mode !== "live") return loadFixturePosts("x", target);
    return cliSearch("x", config.connectors.xCliBin, target.value, [
      "--max",
      String(opts.volumeCap),
    ]);
  }
}
