# BrandScout

Outil de scouting de branding multi-sources : analyser comment une marque est perçue à partir de signaux publics, et transformer ces signaux en décisions. On-demand en v1 (un run → un rapport-instantané).

## Language

**Brand** (Marque) :
L'entité analysée lors d'un run. Marques de départ : Chart Fanatics, Words of Rizdom, Chart Academy, Propfirm Trader.
_Avoid_: compte, client, channel (une marque peut avoir plusieurs canaux).

**Collection Mode** (Mode de collecte) :
La façon dont l'outil récupère des signaux pour une marque. Deux modes, tous deux pilotés par l'utilisateur (l'outil ne devine jamais quoi chercher) : Seed Source et Keyword Query.
_Avoid_: ingestion (= l'étape technique, pas le mode).

**Seed Source** (Source-graine) :
Un endroit public **connu**, fourni par l'utilisateur, où l'outil collecte **tout** (ex. : une chaîne YouTube, un subreddit). On part de l'endroit, pas du contenu.
_Avoid_: source (trop vague), lien, compte.

**Keyword Query** (Requête mot-clé) :
Un terme fourni par l'utilisateur (nom de marque, produit, surnom) dont l'outil collecte les **posts publics qui le mentionnent**, où qu'ils soient sur la plateforme. Borné et intentionnel (l'utilisateur choisit les mots-clés) — à distinguer de la découverte autonome de v2 (l'outil propose lui-même des marques/sources).
_Avoid_: recherche, scan, mention (= le résultat, pas la requête).

**Connector** (Connecteur) :
Le module d'intégration propre à une plateforme (YouTube, Reddit, X…) qui implémente un ou plusieurs Collection Modes. Le modèle de données reste agnostique du connecteur. v1 : YouTube, Reddit. v2 : X, puis Discord, Instagram, TikTok.
_Avoid_: source, API, intégration.

## Analyse

**Run** :
Une analyse d'**une** Brand à un instant T : collecte → extraction → synthèse → un Report. On-demand en v1.
_Avoid_: scan, session, job.

**Post** :
Un élément brut collecté (un commentaire YouTube, un post/commentaire Reddit…), avec son auteur, sa date et son URL d'origine. La matière première.
_Avoid_: message, donnée, entrée.

**Observation** :
Un point de donnée atomique extrait d'**un** Post (une critique, un éloge, la mention d'un thème). Brique de base de l'analyse.
_Avoid_: **signal** (réservé au tier « Signal probable » — ne jamais employer « signal » comme nom générique), insight.

**Finding** (Conclusion) :
Une affirmation synthétique sur la Brand, adossée à des Observations, portant toujours : source(s) + date + un niveau de Confidence. C'est ce qui peuple le Report.
_Avoid_: conclusion (en anglais ok ; éviter « insight », « résultat »).

**Confidence** (Niveau de confiance) :
Le degré de fiabilité d'un Finding, sur trois tiers exactement : **Fait vérifié**, **Signal probable**, **Intuition**. Plafonné par la preuve (voir ADR-0003) : le LLM ne peut jamais surclasser ce que les sources autorisent.
_Avoid_: score, certitude, probabilité.

**Independent Sources** (Sources indépendantes) :
Des preuves qui se corroborent sans partager d'origine : auteurs distincts, et idéalement plateformes/contextes distincts — un repost ou une citation de la même origine ne compte qu'une fois. Condition pour qu'un Finding atteigne « Fait vérifié ».
_Avoid_: sources multiples (ambigu), corroboration (= le mécanisme, pas les sources).

**Report** (Rapport) :
Le livrable d'un Run : document structuré et dense (perception, points forts, critiques, thèmes, opportunités) où chaque Finding se déplie jusqu'à ses Posts. Espace de travail orienté décision, pas vitrine.
_Avoid_: dashboard (= la couche v2 interactive), résumé.

## Source IA / GEO

Piste d'analyse parallèle : comment les modèles d'IA décrivent la marque (le GEO). Distincte du listening humain ; le barème de Confidence ne s'y applique pas (voir [ADR-0007](./docs/adr/0007-geo-ai-source-track.md)).

**Prompt Probe** (Sonde de prompt) :
Collection Mode où l'utilisateur fournit des **prompts** exécutés contre plusieurs modèles d'IA, pour observer comment la marque apparaît dans leurs réponses.
_Avoid_: question, requête (= le contenu), Keyword Query (= le mode pour les posts humains).

**AI Answer** (Réponse IA) :
La réponse d'un modèle à un Prompt Probe — un Post de la piste GEO, dont l'`author` est le modèle. Conservée brute comme preuve.
_Avoid_: complétion, output, mention.

**Presence** (Présence) :
La fréquence à laquelle les réponses d'IA mentionnent la marque (par modèle et global). Métrique GEO de visibilité — **pas** un niveau de Confidence.
_Avoid_: confidence (réservé au listening humain), visibilité (ok en anglais : *Visibility*).

**Risk topic** (Sujet à risque) :
Une affirmation **négative ou fausse** (hallucination) qu'un modèle énonce sur la marque. C'est ce qui peuple le suivi de risque réputationnel IA.
_Avoid_: critique (= une Observation humaine), bug.
