# Seuils opérationnels des tiers de Confidence (v1)

**Contexte.** L'ADR-0003 pose que la preuve plafonne la confiance, mais reste à rendre les trois tiers calculables. v1 ne dispose que de deux plateformes (YouTube + Reddit), donc une corroboration cross-plateforme stricte rendrait « Fait vérifié » presque inatteignable.

**Décision.** Barème v1 :

| Tier | Règle |
|---|---|
| **Intuition** | Inféré par le LLM ; 0–1 Observation ; aucune corroboration. Marqué « à creuser ». |
| **Signal probable** | ≥ 3 auteurs indépendants, mais sur une seule source. |
| **Fait vérifié** | Auteurs indépendants corroborant sur ≥ 2 **sources distinctes** (version souple : 2 subreddits différents comptent ; 2 plateformes différentes ne sont pas exigées). |

**Règle d'indépendance (v1, simple).** Un même auteur ne compte qu'une fois. Un repost / une citation de la même origine ne compte qu'une fois. Pas de détection de sock-puppets.

**Choix notables.** Seuil « plusieurs auteurs » fixé à **3** (2 transformerait une dispute entre deux personnes en tendance). « Fait vérifié » en version **souple** plutôt que cross-plateforme strict, pour rester atteignable tant que X est absent (ADR-0001).

**Conséquence.** Ces seuils sont des paramètres ajustables ; la structure (indépendance par auteur, corroboration par sources distinctes) est la partie durable. À réviser quand X arrive en v2 (la corroboration cross-plateforme deviendra réaliste et pourra durcir « Fait vérifié »).
