# BrandScout

Outil de **scouting de branding multi-sources** : analyser comment une marque est perçue à partir de signaux publics, et transformer ces signaux en décisions. On-demand en v1 (un run → un rapport-instantané).

> Vocabulaire du domaine : voir [CONTEXT.md](./CONTEXT.md). Décisions structurantes : voir [docs/adr/](./docs/adr/).

## Périmètre v1

Un **Run** prend une **Brand** (+ ses sources fournies par l'utilisateur), collecte des **Posts** sur YouTube et Reddit, en extrait des **Observations**, les synthétise en **Findings** dont chacun porte source(s) + date + un niveau de **Confidence** plafonné par la preuve, et rend un **Report** structuré et dense dans une web app mono-utilisateur.

### Ce qui est DANS la v1
- **On-demand** : un Run = une analyse d'une Brand à un instant T. ([ADR-0001 contexte], D1)
- **Sources fournies par l'utilisateur**, deux modes :
  - *Seed Source* — un endroit connu (chaîne YouTube, subreddit) → on collecte tout.
  - *Keyword Query* — un terme dont on collecte les posts publics qui le mentionnent.
- **Connecteurs : YouTube + Reddit.**
- **Analyse** : Post → Observation → Finding, avec Confidence sur 3 tiers (**Fait vérifié / Signal probable / Intuition**). La preuve plafonne la confiance ; le LLM ne surclasse jamais. ([ADR-0003](./docs/adr/0003-evidence-caps-confidence.md), [ADR-0004](./docs/adr/0004-confidence-tier-thresholds.md))
- **Routage LLM 2 étages** : owl-alpha (gratuit, OpenRouter) pour le mécanique, Claude Opus 4.8 pour le jugement, derrière une abstraction swappable. ([ADR-0002](./docs/adr/0002-two-tier-llm-routing.md))
- **Persistance** : chaque Run stocké intégralement en **SQLite local-first**. ([ADR-0005](./docs/adr/0005-sqlite-local-first-persistence.md))
- **Interface** : web app **mono-utilisateur, sans auth, 2 écrans**. ([ADR-0006](./docs/adr/0006-v1-thin-mono-user-web-app.md))
- **Stack** : TypeScript full-stack (Node + frontend natif, `better-sqlite3`).

### Ce qui est explicitement REPOUSSÉ en v2+
- Monitoring **continu** (diff entre Runs, alertes).
- **X (Twitter)** via auto-hébergé (agent hermes + VPS + nitter). API officielle rejetée sur le coût. ([ADR-0001](./docs/adr/0001-x-access-deferred-to-v2-self-hosted.md))
- **Discord, Instagram, TikTok.**
- **Découverte autonome** de marques/sources (l'outil propose lui-même quoi chercher).
- **Dashboard interactif lourd** : filtres/recherche avancés, annotation, diff live, multi-utilisateurs.
- **Scouting d'invités** (le dérivé de la note produit) + sa mémoire d'exclusion des anciens invités.
- **GEO en continu** : suivi dans le temps de la réputation IA + alerting hebdo (le snapshot reste possible plus tôt, voir ci-dessous). ([ADR-0007](./docs/adr/0007-geo-ai-source-track.md))

## Piste GEO / source IA (cadré — [ADR-0007](./docs/adr/0007-geo-ai-source-track.md))

De plus en plus de gens se renseignent en **demandant à une IA** (ChatGPT, Perplexity, Grok, Gemini…). Comment ces modèles décrivent une marque devient un enjeu réputationnel (le **GEO**, Generative Engine Optimization). BrandScout l'ajoute comme une **piste d'analyse parallèle** au listening humain — pas comme un connecteur de plus branché sur le même scoring.

- **Nouveau Collection Mode : *Prompt Probe*** — l'utilisateur fournit des prompts (ce qu'un humain demanderait à une IA sur la marque/catégorie), exécutés contre plusieurs modèles.
- **Nouveau Connector : LLM** — réutilise l'intégration **OpenRouter** (une clé → plusieurs modèles cibles). Le modèle *sondé* (la donnée) est distinct du modèle *analyste* du routage 2 étages ([ADR-0002](./docs/adr/0002-two-tier-llm-routing.md)).
- **Modèle de données réutilisé** : une réponse d'IA = un Post (`author` = modèle, `sourceKey` = `ai/<modèle>`), d'où on extrait des Observations. La **réponse brute est conservée comme preuve** (provenance).
- **Le barème de Confidence humain NE s'applique PAS** (une IA n'est pas un auteur humain indépendant). Le GEO a ses **propres métriques** :

| Métrique GEO | Sens |
|---|---|
| **Presence / Visibility** | % de prompts où la marque apparaît (par modèle + global) |
| **Sentiment** | positif / neutre / négatif-risque |
| **Net** | positif − risque |
| **Accord inter-modèles** | corroboration entre **modèles** distincts (≥ 2 IA = plus solide) |
| **Risk topics** | affirmations négatives ou **fausses** (hallucinations) sur la marque |
| **Share of voice** | vs concurrents (prompts de catégorie) |

**Report** : une section **AI Reputation** (score global + sous-scores) + une **matrice par modèle** (Risk / Neutral / Positive, Net, Runs, Presence).

**Périmètre.** Un **snapshot GEO** (un Run, multi-modèles, à l'instant T) colle au modèle on-demand et peut arriver tôt. Le **suivi continu + alerting** relève du monitoring v2 ([ADR-0006](./docs/adr/0006-v1-thin-mono-user-web-app.md)). Limite assumée : via API on a le **modèle de base**, pas les surfaces grand public (ChatGPT browsing, AI Overviews) — bon proxy, pas identique.

### Étapes de build GEO — **G0→G4 faites**
- [x] **G0 — Cadrage.** ADR-0007 + glossaire (CONTEXT.md).
- [x] **G1 — Connecteur LLM (*Prompt Probe*).** Sonde N modèles via OpenRouter (live) ou fixtures (offline). [src/geo/probe.ts](./src/geo/probe.ts) + CLI [src/geo.ts](./src/geo.ts) (`npm run geo`).
- [x] **G2 — Classification GEO.** Réponse → présence / sentiment / risk topics ; par LLM (étage mécanique) en live, heuristique déterministe en fixtures. [src/geo/analyze.ts](./src/geo/analyze.ts)
- [x] **G3 — Scoring GEO.** Module distinct de `confidence.ts` : Presence, Sentiment, Net, **accord inter-modèles** (risk theme corroboré par ≥ 2 modèles). [src/geo/score.ts](./src/geo/score.ts)
- [x] **G4 — Report GEO.** Snapshot GEO persisté par Run (table `geo`, JSON), section **AI Reputation** dans le Report web (matrice par modèle + thèmes corroborés + chaque risk topic tracé jusqu'à la réponse brute).

> Persistance : le snapshot GEO est stocké **à part** (table `geo`, JSON) — pas dans les tables `post/observation/finding` du listening humain. Les deux pistes restent cleanement séparées (ADR-0007). Live dans un Run : opt-in via `GEO_LIVE_IN_RUN=1` (sinon snapshot fixtures, pour éviter un coût surprise).

## Enveloppe d'un Run (défauts, configurables)
- **Fenêtre temporelle** : 6 derniers mois.
- **Plafond de volume** : ~500 Posts par Seed Source / Keyword Query.
- **Pré-filtre déterministe AVANT le LLM** : longueur min, déduplication, anti-spam — le mécanique dégrossit avant que le jugement (LLM) paie des tokens.
- Coût : collecte ≈ gratuite (quotas YouTube Data API 10k u/jour + Reddit gratuit) ; le coût réel = les tokens LLM, bornés par les garde-fous ci-dessus.

## Barème de Confidence (v1)
| Tier | Règle |
|---|---|
| **Intuition** | Inféré par le LLM ; 0–1 Observation ; aucune corroboration. Marqué « à creuser ». |
| **Signal probable** | ≥ 3 auteurs indépendants, sur une seule source. |
| **Fait vérifié** | Auteurs indépendants corroborant sur ≥ 2 sources distinctes (version souple : 2 subreddits comptent ; 2 plateformes non exigées). |

Indépendance (v1) : 1 auteur = 1 voix ; repost/citation de la même origine = 1 voix.

## Démarrage rapide

```bash
npm install                 # better-sqlite3 (natif) + types
cp .env.example .env        # optionnel : sans clé, tout tourne en mode fixtures

npm start                   # web app -> http://localhost:4317
```

Puis dans l'app : **Seed demo** crée la Brand *Chart Fanatics* (+ ses sources), **Lancer le Run**, puis l'onglet **Reports** affiche le rapport (chaque Finding se déplie jusqu'aux Posts).

En ligne de commande (debug / étape 8) :

```bash
node src/cli.ts run "Chart Fanatics"   # collecte -> Report en console
npm test                               # invariants de Confidence + e2e
npm run typecheck                      # tsc --noEmit (strict)
```

### Modes d'exécution (`BRANDSCOUT_MODE`)
- **`auto`** (défaut) : appels réels si les clés existent, sinon bascule par sous-système sur des **fixtures**/mocks déterministes. Permet de tout faire tourner hors-ligne.
- **`live`** : exige les clés (OpenRouter, Anthropic, YouTube, Reddit).
- **`fixtures`** : force le hors-ligne (données locales dans `fixtures/`).

Le mode fixtures exerce **toute la logique du pipeline** (pré-filtre, regroupement, plafond de Confidence, assemblage du Report, persistance, UI) ; seuls les appels réseau externes sont stubés. Passer en `live` = renseigner les clés, aucune autre modif (l'abstraction du routeur LLM et des connecteurs est swappable — ADR-0002).

## Architecture (TypeScript, exécuté nativement par Node ≥ 22.6, type-stripping)

```
src/
  config.ts            config centrale (.env, ids de modèles, seuils — jamais en dur)
  domain/types.ts      modèle de domaine (vocabulaire de CONTEXT.md)
  db/                  schema.sql + repository SQLite (better-sqlite3)
  llm/                 routeur 2 étages (router.ts) + providers mock (mock.ts)
  connectors/          interface + youtube.ts, reddit.ts + fixtures.ts
  pipeline/            prefilter -> extract -> synthesize -> confidence -> report -> run (orchestrateur)
  server/              api.ts (logique) + server.ts (HTTP node:http)
  web/                 frontend natif (index.html, app.js, style.css) — 2 écrans
fixtures/              jeux de données Chart Fanatics (reddit/, youtube/)
tests/                 confidence (invariants ADR-0003/0004) + e2e
```

## Plan d'implémentation (étapes) — **v1 terminée**

L'ordre suit la chaîne de valeur : prouver d'abord qu'**un** Report est bon, brancher l'UI ensuite.

- [x] **Étape 0 — Socle.** Projet TS (Node + frontend), SQLite via `better-sqlite3`, schéma complet (Brand, Collection Target, Run, Post, Observation, Finding, table de liaison, Report), secrets via `.env`.
- [x] **Étape 1 — Routeur LLM.** Abstraction à 2 étages (owl-alpha via OpenRouter / Opus via Anthropic), id de modèle en config, jamais en dur ; provider mock pour le hors-ligne. ([ADR-0002](./docs/adr/0002-two-tier-llm-routing.md))
- [x] **Étape 2 — Connecteur YouTube (Seed Source).** Commentaires d'une chaîne sur la fenêtre, plafond + pré-filtre déterministe, persistance.
- [x] **Étape 3 — Connecteur Reddit (Keyword Query + Seed Source).** Recherche mot-clé + subreddit, mêmes garde-fous, persistance.
- [x] **Étape 4 — Extraction.** Posts → Observations via l'étage mécanique.
- [x] **Étape 5 — Synthèse + Confidence.** Observations → Findings via l'étage jugement, le barème calcule le tier comme **contrainte dure** ; le LLM décrit à l'intérieur. ([ADR-0003](./docs/adr/0003-evidence-caps-confidence.md))
- [x] **Étape 6 — Report.** Document structuré (perception, points forts, critiques, thèmes, opportunités), chaque Finding dépliable jusqu'aux Posts.
- [x] **Étape 7 — Web app.** Écran 1 (lancer un Run) + écran 2 (lire un Report + liste des Runs). Mono-user, sans auth. ([ADR-0006](./docs/adr/0006-v1-thin-mono-user-web-app.md))
- [x] **Étape 8 — Bout-en-bout.** Run validé sur Chart Fanatics (mode fixtures) : traçabilité Finding→Observation→Post et justesse des trois tiers vérifiées par les tests. Le run *réel* ne demande que les clés API.

## Décisions de conception (tranchées à l'implémentation)
- **Schéma SQLite** : voir [src/db/schema.sql](./src/db/schema.sql). La « source » de corroboration est `post.source_key` (`r/<subreddit>` ou `yt/<chaîne>`) ; deux subreddits = deux sources distinctes (ADR-0004). Liaison `finding_observation` pour la traçabilité.
- **Regroupement Observations → Findings** : par **thème normalisé** issu de l'étage mécanique (déterministe, traçable). Le clustering sémantique fin est repoussé en v2.
- **Confidence** : calculée par [src/pipeline/confidence.ts](./src/pipeline/confidence.ts) à partir d'auteurs distincts + sources distinctes ; le LLM ne fixe jamais le tier.
- **Définition d'une Brand** : tables `brand` + `collection_target`, éditées via l'écran 1.
- **Sections du Report** : perception (vue d'ensemble), points forts, critiques, thèmes, opportunités (ces dernières inférées → tier *Intuition*).
