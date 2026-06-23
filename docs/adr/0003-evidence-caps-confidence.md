# La preuve plafonne la confiance : le LLM ne peut jamais surclasser un Finding

**Contexte.** Toute la crédibilité de BrandScout repose sur la distinction « Fait vérifié / Signal probable / Intuition » exigée par la note produit. Les LLM sont régulièrement confiants à tort ; les laisser s'auto-attribuer un niveau de confiance produirait des « faits » hallucinés et ruinerait la confiance dans le Report.

**Décision.** Le niveau de Confidence d'un Finding est une **fonction de la preuve**, pas de l'aplomb du modèle. La preuve (volume d'Observations + diversité des Independent Sources + récence) fixe un **plafond** déterministe. Le LLM peut nuancer ou décrire *à l'intérieur* de ce plafond, mais **ne peut jamais promouvoir** un Finding au-dessus de ce que les sources corroborent.

Invariant central du système : *un Finding ne peut être étiqueté « Fait vérifié » que s'il pointe vers des preuves issues de Independent Sources.*

**Alternatives rejetées.**
- *Confiance auto-déclarée par le LLM* — rejeté : surconfiance, hallucinations présentées comme des faits.
- *Score purement déterministe sans LLM* — rejeté : rigide, rate les nuances qualitatives ; le LLM reste utile pour décrire à l'intérieur du plafond.

**Conséquence.** Le modèle de données doit relier chaque Finding à ses Observations et à leurs Sources, et la couche de synthèse doit recevoir le plafond comme contrainte dure (pas comme suggestion). La définition opérationnelle d'« Independent Sources » et du seuil de chaque tier devient une décision dépendante (voir ADR à venir).
