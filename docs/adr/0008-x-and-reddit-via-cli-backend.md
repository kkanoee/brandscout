# X et Reddit via CLI-backend non-officiel (avance la piste v2 de l'ADR-0001)

**Contexte.** L'ADR-0001 réservait X à la v2 (API officielle trop chère) et la v1 passait par les **API officielles**. Or (a) l'API X reste hors budget, et (b) l'approbation Reddit *Responsible Builder* est trop lente. Décision produit de l'utilisateur : collecter **X et Reddit maintenant**, par accès non-officiel, en assumant le risque.

Il existe un écosystème mûr de CLIs pour ça : **twitter-cli** (Apache-2.0, ~2,7k⭐, sortie JSON documentée) pour X, **rdt-cli** (sans licence, ~444⭐, « reverse-engineered API ») pour Reddit, orchestrés par **Agent-Reach** (MIT, ~47k⭐ — audité : code sain, pas d'exfiltration, cookies scopés au domaine). Ces CLIs accèdent aux plateformes via la **session connectée** de l'utilisateur.

**Décision.** Ajouter un **CLI-backend** derrière l'abstraction Connector (le modèle de données reste agnostique) :
- Nouveau connecteur **`x`** (twitter-cli). Connecteur **`reddit`** : backend commutable `official` | `cli` (`REDDIT_BACKEND`).
- Invocation **sans shell** (`spawn`, le query en argument) → pas d'injection. Binaire configurable (`X_CLI_BIN`, `REDDIT_CLI_BIN`).
- Sortie JSON mappée tolérammment vers `RawPost` (champs hétérogènes : author/user, text/title/selftext, url/permalink, created_at/created_utc…). `sourceKey` = `x` pour X, `r/<subreddit>` pour Reddit → X devient une **source distincte** qui corrobore en cross-plateforme.
- **Défaut sûr** : Reddit reste `official`, et le CLI ne tourne qu'en mode `live` explicite ; sinon fixtures (offline). Aucun spawn surprise.

**Risques assumés.**
- **ToS / légal** : accès non-officiel (rdt-cli est « reverse-engineered » et **sans licence**). Violation des CGU X/Reddit.
- **Ban du compte** : les CLIs agissent comme la **session connectée** → **utiliser un compte burner**, pas le compte principal.
- **Dépendances tierces non auditées** (twitter-cli, rdt-cli, OpenCLI) + accès à tes cookies de session. Agent-Reach lui-même est audité sain, mais pas toute la chaîne.
- **Fragilité** : scrapers cassent quand les sites changent.

**Conséquence.** Le `CHECK (connector IN ('youtube','reddit'))` de `collection_target` est retiré (validation en code) + migration de rebuild pour les bases existantes. Le live exige d'installer les CLIs (`pipx install twitter-cli` / `rdt-cli`) + une session connectée. La v1 « API-officielle-seule » de l'ADR-0001 est **consciemment dépassée** pour X et Reddit, à la demande de l'utilisateur ; l'approche officielle Reddit reste disponible (`REDDIT_BACKEND=official`).
