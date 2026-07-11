# ADR-0006 — Classification en couches 1-3, déterminisme, et report de la couche 4 (IA) au sprint 7

**Statut :** accepté
**Date :** 2026-07-10
**Portée :** phase 1, sprint 6 (« Classification et déterminisme »)
**Références :** PRD v3.0 §12 (couches 1-4, §12.1-12.6), §20.3, §10.1, §19.3, FR-013, FR-026, FR-027, FR-028 ; plan §4 (sprints 6 et 7), §6 (définition de terminé), §7 (gouvernance) ; ADR-0002 (déterminisme et horodatage), ADR-0004/0005 (analyseur, cache, corpus local)

## Contexte

Le sprint 6 vise une classification des dossiers « correcte à vue d'œil » sur des dépôts variés, et le durcissement du déterminisme (FR-026). Le PRD §12 décrit quatre couches par priorité décroissante : **1 config**, **2 règles déterministes**, **3 analyse statique**, **4 IA (LLM)**. À l'entrée du sprint, le socle est déjà partiellement en place :

- les couches 1-2 sont pleinement implémentées (`classify.ts`), au niveau **dossier**, avec confiances binaires (0 ou 1000), preuves et repli `unknown` ;
- le schéma autorise **déjà** `decisionSource ∈ {config, rule, static, ai}` et `confidence` 0..1000 : émettre des verdicts de couche 3 ou 4 **ne requiert aucune évolution de schéma** ;
- le hash de configuration réserve **déjà** un emplacement `ai: { modelId, promptVersion }` (vide) ;
- FR-027 (refus client d'une version inconnue) est **déjà** livré et testé côté contrat et client.

Décision de périmètre prise avec le porteur produit : le sprint 6 livre les **couches 1 à 3** et le déterminisme ; la **couche 4 (IA)** est **reportée au sprint 7**, où elle rejoint la couche sémantique (résumés IA), seule autre dépendance au fournisseur de modèle.

## Décision

1. **Réordonnancement du pipeline : analyse de code AVANT classification.** L'étage `analyze-code` (symboles, imports, relations) s'exécute désormais avant l'étape `classify` (auparavant l'inverse). C'est une condition nécessaire : la couche 3 consomme les faits statiques. Le déplacement est sûr — `extractCode` est une fonction pure ne dépendant ni des classifications ni des catégories — et le layout continue de consommer les catégories finales en aval. Nouvel ordre : `inventory → analyze-code → classify(1-3) → layout → search → guards → validate`.

2. **Couche 3 — heuristiques statiques (`classify-static.ts`), au niveau dossier.** N'intervient QUE sur le **repli `unknown`** des couches 1-2 (`isUnknownFallback`), garantissant l'ordre de priorité config > règle > statique par construction : un verdict config (y compris un `unknown` posé explicitement, `overriddenByConfig: true`) ou règle n'est jamais écrasé. On agrège des **signaux pondérés** sur les fichiers de code **directs** du dossier (agrégation directe, plus précise qu'une descente récursive) :
   - **fort (poids 3)** — nom de fichier conventionnel (`*.controller.ts`, `*.service.ts`, `*.spec.ts`…) et import de framework non ambigu (`react`→ui, `express`→route, `typeorm`→repository, `mongoose`→model, `vitest`→test…) ;
   - **modéré (poids 2)** — suffixe de nom de symbole (`*Controller`, `*Service`, `*Repository`…) et composant PascalCase exporté dans un fichier JSX/TSX.
   La catégorie de plus haut score l'emporte ; **précision avant rappel** : en l'absence de signal ou en cas d'**égalité de tête** (ambiguïté), on renvoie `null` et le dossier reste `unknown` (thème neutre) — pas de devinette forcée, c'est le rôle de la couche 4. La **confiance est intermédiaire, bornée à [400, 850]** — jamais 1000, réservé à la certitude config/règle (PRD §20.3 : la couche statique est « Certain » depuis l'AST mais reste une heuristique de dossier ici, distinguée d'une règle explicite). Les preuves (`{kind, detail}` : `file-name`, `framework-import`, `symbol-name`, `component`) sont **triées** (kind, detail) et **plafonnées** à 8. `decisionSource: "static"`.

3. **Aucune évolution de schéma.** Le contrat v1 suffit ; `world-schema` n'est pas touché. La totalité de `THEME_OF` (18 catégories → thème, repli `unknown → neutral`) était déjà branchée et testée : le mapping catégorie → thème du sprint 6 est donc satisfait tel quel. L'extension à dix thèmes reste au sprint 8.

4. **Configuration de couche 1 en YAML EN PLUS de JSON (PRD §12.1).** `parseConfigYaml`/`parseConfigFile` acceptent `.yaml`/`.yml` ; le format n'est qu'une **syntaxe d'entrée** — même `FileConfig`, même validation stricte, et surtout **même `configurationHash`** (le format ne fuit pas dans l'identité FR-026). Le JSON étant un sous-ensemble de YAML 1.2, un fichier JSON reste accepté par le parseur YAML. Dépendance ajoutée : `yaml` (parsing déterministe).

5. **Couche 4 (IA) reportée au sprint 7, avec elle la vérification de FR-028.** Aucun verdict `decisionSource: "ai"` n'est produit au sprint 6. FR-028 (« les verdicts IA doivent être persistés… température 0, modèle épinglé, cache committé ») porte **exclusivement** sur des verdicts IA : en l'absence de couche 4, il est **sans objet** ce sprint (aucune exigence contournée — rien à persister). L'infrastructure reste prête (emplacement `ai` du hash réservé, `decisionSource: "ai"` autorisé). Motivation : la couche 4 est la **seule dépendance externe** (fournisseur de modèle), conçue pour être **débranchable** ; la reporter garde le sprint 6 entièrement **hors-ligne et déterministe**, et regroupe tout le travail IA (classification ambiguë + résumés) au sprint 7 (parade au risque « dépendance IA » du plan §8).

6. **Corpus : deux dépôts-échantillons committés, pour cinq mondes variés.** `nest-shop` (backend en couches façon NestJS) et `react-dashboard` (front React) sont ajoutés sous `tools/corpus/samples/`, **committés** donc **déterministes** (un clone de branche mouvante violerait FR-026, cf. ADR-0005 §9). Ils sont conçus pour **exercer la classification** : mélange de règles de noms de dossiers (`domain/`, `models/`, `services/`, `lib/`, `test/` — couche 2) et de dossiers au **nom neutre** classés par contenu (`http/`→controller, `billing/`→service, `persistence/`→repository, `panels/`/`hooks/`→ui — couche 3). Ils sont **exclus de `self`** (via `exclude`) pour ne pas dupliquer les fixtures dans le monde du dépôt. `corpus:check` prouve FR-026 par double régénération octet pour octet sur les cinq mondes.

7. **Bump délibéré `ANALYZER_VERSION` 0.2.0 → 0.3.0.** Le sprint 6 **modifie les octets produits** pour une même entrée locale (nouveaux verdicts de couche 3 dans `classifications`). `analyzerVersion` entrant dans l'identité FR-026 (§10.1), le bump est **obligatoire** pour rester honnête : deux analyseurs de bytes différents ne peuvent revendiquer la même version. Le corpus committé (`schema`, `self`, `zod`, plus les deux échantillons) est régénéré en conséquence. `package.json.version` est synchronisé.

## Conséquences

- **`world-schema` intact ; FR-027 inchangé.** Le refus de version côté client reste identique ; aucune migration ni bump de `schemaVersion`.
- **Impact layout quasi nul en v0.** Les nouvelles catégories de couche 3 mappent presque toutes vers `neutral` (seuls `controller`/`route` donnent `control-room`). Le layout d'un dossier ne change que si sa catégorie franchit vers un thème distinct ; sinon seuls les `classifications` de l'artefact évoluent. Les snapshots de layout de `world-schema` (arbres synthétiques) ne sont pas affectés.
- **Nouveaux points d'extension propres.** `classify-static.ts` isole les tables de signaux (frameworks, suffixes, infixes de noms) — enrichissables sans toucher au pipeline. `code.ts` expose désormais `importsByNodeId` (specifiers bruts, y compris `bare`) que la résolution de relations écartait.
- **Dette assumée, tracée pour le sprint 7 :** couche 4 (LLM, cache de verdicts committé, port débranchable) et vérification effective de FR-028 ; c'est là que l'`ai: { modelId, promptVersion }` du hash de config sera renseigné.
