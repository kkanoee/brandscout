# Interface v1 : web app mince, mono-utilisateur

**Contexte.** Le livrable v1 est un Report dense et dépliable (ADR / D5). Une interface web a été retenue plutôt qu'un CLI, pour le confort de navigation dans les preuves. Le risque est que « web app » dérive en SaaS (auth, comptes, design system) avant qu'un Report soit bon.

**Décision.** L'interface v1 est une web app **mono-utilisateur, sans authentification**, tournant sur `localhost` ou sur le VPS derrière un simple mot de passe d'accès. Deux écrans seulement :
1. Lancer un Run (choisir une Brand + ses Seed Sources / Keyword Queries).
2. Lire un Report : Findings par section, chacun dépliable jusqu'aux Posts, avec son tier de Confidence ; plus la liste des Runs passés.

**Hors périmètre v1 (explicite).** Authentification, multi-utilisateurs, rôles ; filtres/recherche avancés ; annotation ; diff inter-Run en direct ; tout dashboard interactif lourd → v2.

**Conséquence.** Tant que l'app tient ces deux écrans mono-user, elle coûte à peine plus qu'un CLI tout en donnant le confort de navigation. Le CLI scriptable n'étant plus le point d'entrée, le monitoring continu v2 devra exposer son déclencheur autrement (job planifié côté backend plutôt que cron sur un binaire).
