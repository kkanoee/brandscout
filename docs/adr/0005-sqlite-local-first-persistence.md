# Persistance : chaque Run est stocké, SQLite local-first

**Contexte.** L'ADR-0003 impose de relier chaque Finding à ses Observations et Sources. La promesse produit « chaque conclusion → source + date » n'a de valeur que si les preuves restent ré-ouvrables. Par ailleurs le monitoring continu (v2) et la mémoire d'exclusion des invités (dérivé) ont besoin d'un store persistant.

**Décision.** Chaque Run est persisté intégralement (Posts, Observations, Findings, horodatés) dans une base **SQLite** unique, local-first. Pas de serveur de base de données en v1.

**Alternatives rejetées.**
- *Éphémère (jeter la donnée brute après génération du Report)* — casse l'auditabilité, le diff inter-Run de la v2, et la mémoire d'exclusion.
- *Postgres / DB serveur* — complexité prématurée pour un outil on-demand mono-utilisateur. Un seul fichier SQLite tourne aussi bien en local que sur le VPS.

**Conséquence.** v1 reste sans infra à administrer. Si la v2 (continu, H24 sur VPS, gros volume) l'exige, la migration SQLite → Postgres est un chemin connu — problème de v2, pas de v1. Le schéma doit modéliser la chaîne Post → Observation → Finding → Confidence avec les Sources, pas seulement stocker le Report final.
