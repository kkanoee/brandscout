# Piste GEO (source IA) : une analyse parallèle avec ses propres métriques, pas un tier de Confidence

**Contexte.** La perception d'une marque ne se joue plus seulement entre humains : de plus en plus de gens se renseignent en **demandant à une IA** (ChatGPT, Perplexity, Grok, Gemini…). Comment ces modèles décrivent une marque — la mentionnent-ils ? avec quel sentiment ? quels risques ou hallucinations ? — devient un enjeu réputationnel à part entière (le « GEO », Generative Engine Optimization). BrandScout doit pouvoir scouter cette surface, en plus du listening humain YouTube/Reddit.

La tentation est de traiter une réponse d'IA comme un Post de plus et de la faire passer dans le barème de Confidence existant (ADR-0003/0004). **C'est une erreur de catégorie** : ce barème repose sur des **auteurs humains indépendants qui se corroborent** ; une réponse d'IA n'est pas une voix humaine indépendante, c'est la synthèse d'un modèle (souvent entraîné sur des sources qui se recoupent). Lui attribuer « Fait vérifié » n'aurait aucun sens.

**Décision.** Le GEO est une **piste d'analyse parallèle** dans le même produit, pas un connecteur de plus branché sur le même scoring.

- **Collection Mode nouveau : *Prompt Probe*.** L'utilisateur fournit des **prompts** (ce qu'un humain demanderait à une IA sur la marque ou sa catégorie). On les exécute contre plusieurs modèles.
- **Connector nouveau : LLM**, réutilisant l'intégration **OpenRouter déjà en place** (une clé → plusieurs modèles cibles), complétée au besoin par les API propres (Perplexity, Gemini…). ⚠️ Le modèle *sondé* (la donnée) est distinct du modèle *analyste* du routage à deux étages (ADR-0002) — ne pas confondre les deux.
- **Le modèle de données est réutilisé** : une réponse d'IA est un Post (`author` = le modèle, `sourceKey` = `ai/<modèle>`, `content` = la réponse, horodatée), d'où on extrait des Observations comme pour le listening humain. La **réponse brute du modèle est conservée comme preuve** (provenance — notre différenciateur face à Profound/Peec/Otterly qui ne livrent qu'un score).
- **Le scoring est spécifique au GEO** (et NON le barème de Confidence humain) :
  - **Presence / Visibility** — % de prompts où la marque apparaît, par modèle et global.
  - **Sentiment** — positif / neutre / négatif-risque sur les réponses.
  - **Net** = positif − risque.
  - **Accord inter-modèles** — l'analogue de la corroboration, mais entre **modèles indépendants** : un claim répété par ≥ 2 IA distinctes est plus solide qu'un claim isolé.
  - **Risk topics** — affirmations négatives ou **fausses** (hallucinations) qu'un modèle énonce sur la marque.
  - **Share of voice** — vs concurrents, si on sonde des prompts de catégorie.

**Alternatives rejetées.**
- *Faire passer les réponses d'IA dans le barème de Confidence (Fait vérifié / Signal probable / Intuition)* — rejeté : erreur de catégorie, l'IA n'est pas un auteur humain indépendant ; gonflerait et fausserait la confiance.
- *Un produit/app GEO séparé* — rejeté : même domaine (perception → décision), même modèle de données, même Report. On **unifie** listening humain + GEO dans un seul livrable (« comment les humains ET les IA parlent de la marque »), ce que peu d'outils font.
- *Sonder un seul modèle* — rejeté : la **comparaison inter-modèles** est le cœur de l'intérêt (un modèle peut halluciner, un autre non).

**Conséquence.**
- Un **module de scoring GEO** distinct de `confidence.ts` ; le Report gagne une section **AI Reputation** (score global + sous-scores) et une **matrice par modèle** (Risk / Neutral / Positive, Net, Runs, Presence).
- Le vocabulaire du domaine s'étend (CONTEXT.md) : *Prompt Probe*, *AI Answer*, *Presence*, *Risk topic*.
- **Périmètre temporel.** Un **snapshot GEO** (un Run, multi-modèles, à l'instant T) est faisable et cohérent avec le modèle on-demand de v1. Le **suivi dans le temps + alerting** (le « weekly runs » des produits du marché) relève du **monitoring continu déjà repoussé en v2** (ADR-0006) — même problème, même report.
- **Limite assumée.** Via API on obtient la réponse du **modèle de base** ; les surfaces grand public (ChatGPT avec browsing, Perplexity, Google AI Overviews) ont un accès web et diffèrent. Bon proxy, pas identique — à durcir en v2 si besoin (sondage des vraies surfaces).
