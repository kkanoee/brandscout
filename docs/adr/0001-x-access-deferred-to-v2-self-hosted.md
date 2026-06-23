# Accès X (Twitter) : reporté en v2 via auto-hébergement, API officielle rejetée

**Contexte.** Une grande partie de la valeur de X pour BrandScout est la Keyword Query sur tout le corpus public (les mentions d'une marque sont sur les comptes de n'importe qui, pas sur son handle). Depuis février 2026, X a supprimé le free-tier : le pay-per-use officiel coûte 0,005 $/post lu (≈ 5 $ / 1 000 posts), et les tiers legacy sont à 200 $/mo (15k lectures) ou 5 000 $/mo. Pour du monitoring récurrent, c'est jugé trop cher.

**Décision.** X est exclu de la v1. v1 = YouTube + Reddit uniquement. X est reporté en v2, où il sera accédé via une approche **auto-hébergée** (agent « hermes » + VPS + nitter avec session tokens fournis par l'utilisateur), qui rend la Keyword Query à grande échelle économiquement viable.

**Alternatives rejetées.**
- *X API pay-per-use / legacy* — rejeté sur le coût pour un usage récurrent.
- *Grok API live search* (25 $/1 000 sources) — envisageable comme « lecture d'ambiance » complémentaire plus tard, mais inadapté comme système d'enregistrement : Grok synthétise, on perd la provenance par post exigée par le modèle (source + date + confiance).
- *birdclaw* — archiveur du propre compte de l'utilisateur, ne fait pas de recherche publique par mot-clé : hors-sujet pour ce besoin.

**Conséquence.** v1 ne porte aucune dépendance ni coût X. Les deux Collection Modes (Seed Source via YouTube, Keyword Query via Reddit) sont validés sur les plateformes gratuites avant d'attaquer X. L'auto-hébergement nitter en v2 comporte un risque ToS/fiabilité assumé et hors v1.
