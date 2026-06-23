# Routage LLM à deux étages : modèle gratuit pour le mécanique, frontier pour le jugement

**Contexte.** Le pipeline enchaîne des tâches LLM de natures très différentes : du mécanique à fort volume (nettoyer/normaliser des posts, déduire la langue, classer un commentaire, extraire une mention) et du jugement à faible volume mais à fort enjeu (synthétiser une perception, attribuer un niveau de confiance, formuler une conclusion actionnable). Tout passer par un modèle frontier serait coûteux ; tout passer par un modèle gratuit dégraderait les conclusions.

**Décision.** Deux étages, derrière une abstraction de routage (l'id de modèle est une config, pas un appel en dur) :
- **Étage « mécanique »** → modèle gratuit via OpenRouter, **owl-alpha** en v1 (1M ctx, tool-use, gratuit).
- **Étage « jugement »** → modèle frontier, **Claude Opus 4.8**.

**Risques assumés / mitigations.**
- owl-alpha est *alpha* : peut être retiré/renommé sans préavis → le routeur le rend remplaçable en une ligne ; ne jamais coder son id en dur.
- owl-alpha logue les prompts/complétions pour s'entraîner → acceptable car les inputs sont des **données publiques** ; ne **pas** lui router de tâche portant des secrets (clés, méthodo propriétaire sensible).

**Conséquence.** Toute nouvelle tâche LLM doit être classée « mécanique » ou « jugement » à la conception. Le choix du modèle gratuit est facile à inverser ; le principe des deux étages est la partie durable.
