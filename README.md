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

## Plan d'implémentation (étapes)

L'ordre suit la chaîne de valeur : prouver d'abord qu'**un** Report est bon, brancher l'UI ensuite.

- [ ] **Étape 0 — Socle.** Init projet TS (Node + frontend), SQLite via `better-sqlite3`, schéma initial (Brand, Seed Source, Keyword Query, Run, Post, Observation, Finding, Source-link), gestion des clés API/secrets (`.env`).
- [ ] **Étape 1 — Routeur LLM.** Abstraction à 2 étages (owl-alpha via OpenRouter / Opus via Anthropic), id de modèle en config, jamais en dur. ([ADR-0002](./docs/adr/0002-two-tier-llm-routing.md))
- [ ] **Étape 2 — Connecteur YouTube (Seed Source).** Lire les commentaires d'une chaîne sur 6 mois, plafond + pré-filtre déterministe, persister les Posts.
- [ ] **Étape 3 — Connecteur Reddit (Keyword Query + Seed Source).** Recherche mot-clé + subreddit, mêmes garde-fous, persister.
- [ ] **Étape 4 — Extraction.** Posts → Observations via l'étage mécanique (owl-alpha).
- [ ] **Étape 5 — Synthèse + Confidence.** Observations → Findings via l'étage jugement (Opus), avec le plafond de preuve appliqué comme **contrainte dure** (le barème calcule le tier ; le LLM décrit à l'intérieur). ([ADR-0003](./docs/adr/0003-evidence-caps-confidence.md))
- [ ] **Étape 6 — Report.** Génération du document structuré (sections : perception, points forts, critiques, thèmes, opportunités), chaque Finding dépliable jusqu'aux Posts.
- [ ] **Étape 7 — Web app.** Écran 1 (lancer un Run) + écran 2 (lire un Report + liste des Runs). Mono-user, sans auth. ([ADR-0006](./docs/adr/0006-v1-thin-mono-user-web-app.md))
- [ ] **Étape 8 — Bout-en-bout.** Premier Run réel sur Chart Fanatics, vérifier la traçabilité et la justesse des tiers de confiance.

## Décisions de conception restant à trancher (au moment de coder)
- Schéma SQLite précis (clés, index, relation Finding ↔ Observations ↔ Sources).
- Mécanisme de regroupement des Observations en Findings (par thème ? clustering ? prompt de synthèse ?).
- Format exact de définition d'une Brand + ses seeds/queries (table en base, éditée via l'écran 1).
- Sections exactes et gabarit du Report.
