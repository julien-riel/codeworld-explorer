# ADR-0001 — L'artefact `world.json` v0 comme frontière unique

**Statut :** accepté
**Date :** 2026-07-10
**Portée :** phase 0, sprints 1 à 3
**Références :** PRD v3.0 §18, §19.1, §33 ; FR-004/005/026/027 ; spec `docs/spec/world-schema-v0.md`

## Contexte

`world.json` est la seule frontière architecturale du MVP (PRD §19.1) : le pipeline est en amont, le jeu en aval. Trois conceptions concurrentes ont été proposées (biais déterminisme, perf-client, fidélité au PRD). Il faut trancher la forme du contrat v0 pour les sprints 1 à 3, sans fermer la porte aux sprints 5 à 7.

## Décision

1. **Un seul artefact FR-026**, `world.json`. Les contenus de fichiers vivent hors artefact dans `files/<contentHash>` (chargés à la demande) ; l'heure d'exécution dans un sidecar `world.build.json` (voir ADR-0002).
2. **Géométrie entière uniquement** : mm, quarts de tour `0|1|2|3`, confiances en pour-mille. Aucun flottant n'atteint l'artefact ; « octet pour octet » en devient trivialement testable.
3. **Système de référence unique** : `id` chaîne dérivé du chemin (`n_`/`s_`/`p_` + base32(sha256)[0..16]). Pas d'index entier parallèle.
4. **Layout sur treillis entier, sans trigonométrie** (pavage de plots carrés + grille intérieure). Détail et justification dans ADR-0003.
5. **Sérialisation canonique** : clés triées (code-unit UTF-16), tableaux pré-triés par le producteur, minifié, UTF-8 sans BOM, sans saut de ligne final, entiers seuls.
6. **Index de recherche** : `SearchDoc[]` canoniques que nous contrôlons, inline dans `world.json` ; le client reconstruit MiniSearch en mémoire.
7. **Entités des sprints 5 à 7 nommées, optionnelles et absentes** : `symbols`, `relations`, `summaries`, `tour` ont une forme figée dès v0 mais ne sont jamais émises en phase 0.
8. **Collections v0 toujours présentes** (`nodes`, `classifications`, `search.documents`), vides si vides.

## Conséquences

- FR-026 est vérifiable par un test de double exécution + snapshot doré (hash hex committé). Voir ADR-0002 pour la règle exacte.
- Le contrat est auto-descriptif et lisible dans les fixtures/snapshots des sprints 1–2 (grâce aux `id` chaîne).
- L'artefact reste « ≪ 15 Mo compressé » (PRD §27.3) avec marge ; une garde de pipeline échoue le build au-delà, avec des leviers de repli ordonnés (spec §11).
- La phase 1 (sprints 5–7) s'ajoute par champs optionnels **sans bump majeur**, conformément au plan §5/§8.
- Le client refuse une version inconnue via une erreur typée discriminée `LoadResult` (FR-027, spec §9).

## Alternatives écartées

- **Double système de référence `id` + `nodeIndex`** (biais perf-client) : gain de taille largement neutralisé par la compression, au prix d'un second modèle de référence, d'une validation de bornes d'index et de fixtures illisibles. Rejeté pour v0 ; index entier possible plus tard derrière un bump de `schemaVersion`.
- **Layout radial (circle-packing polaire)** (biais perf-client) : nécessite `Math.sin/cos`, dont ECMA-262 n'impose pas la précision → non identique bit à bit entre Node et navigateur → **casse FR-026**. Rejeté au profit d'un pavage entier sans trigonométrie (ADR-0003).
- **Embarquer le dump sérialisé de MiniSearch** : couplerait FR-026 à la forme interne (non canonique, dépendante de version) de la bibliothèque. Rejeté ; on embarque nos propres `SearchDoc`.
- **Externaliser l'index en shards content-hashés** (biais perf-client) : n'échappe pas au danger de déterminisme (si la sérialisation MiniSearch n'est pas déterministe, le content-hash change et la référence dans `world.json` change → FR-026 cassé), et ajoute des allers-retours réseau pour aucun bénéfice v0. Reporté comme levier de budget uniquement.
- **Entités sprints 5–7 requises à `[]`** (biais déterminisme) : contredit la consigne « place nommée et optionnelle » et fait semblant que la fonctionnalité existe. Rejeté au profit de champs optionnels réellement absents.
- **Flottants pour la géométrie** : imposeraient une politique d'arrondi fragile et testable difficilement. Rejeté ; treillis entier assumé (perte de la fluidité organique, gain de reproductibilité).
