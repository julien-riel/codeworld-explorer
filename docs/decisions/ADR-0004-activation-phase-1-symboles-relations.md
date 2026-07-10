# ADR-0004 — Activation des entités de phase 1 (symboles et relations) et bump du schéma v0 → v1

**Statut :** accepté
**Date :** 2026-07-10
**Portée :** phase 1, sprint 5 (« Analyseur TypeScript »)
**Références :** PRD v3.0 §12, §14.6, §18, §19.3, §20, §27.1, FR-026, FR-027 ; plan §3 (sprint 5), §7 (gouvernance) ; spec `docs/spec/world-schema-v0.md` §2.3, §2.4, §3.8, §3.9, §4.2, §15 (addendum v1) ; ADR-0001, ADR-0002, ADR-0003

## Contexte

Le sprint 5 fait produire à l'analyseur des **symboles** TypeScript et des **relations d'import** (PRD §20, §14.6). Le contrat v0 gèle déjà les formes de `symbols`, `relations`, `summaries`, `tour` mais les **interdit** : `WorldSchema.superRefine` rejette leur présence et `ManifestSchema.schemaVersion` est épinglé à `z.literal(0)`. Émettre des symboles est donc impossible sans faire évoluer le schéma. Le plan §7 impose qu'une évolution de schéma passe par un **bump de version + ADR**, et le plan §8 met en garde contre le *churn* de schéma juste après le gel v0. Deux exigences dures encadrent la décision : FR-026 (reproductibilité octet) et FR-027 (refus propre d'une version inconnue côté client).

## Décision

1. **Bump `SCHEMA_VERSION` 0 → 1 ; `SUPPORTED_SCHEMA_VERSIONS = [0, 1]`.** L'analyseur émet **toujours** v1 (il extrait désormais les symboles). Le client **lit** v0 et v1 : un artefact d'avant le sprint 5 reste explorable (FR-027). Alternative rejetée : ajouter `symbols` en v0 (additif). Motif du rejet : cela effacerait l'invariant « v0 ⇒ pas de symboles », priverait le client de tout signal de capacité, et contredirait le gel v0 documenté.

2. **Garde de présence CONDITIONNELLE à la version** (remplace la garde v0 inconditionnelle). v0 : les quatre entités restent interdites. v1 : `symbols`/`relations` admis ; `summaries`/`tour` **encore interdits** (activation prévue au sprint 7). L'invariant de phase 0 est ainsi préservé exactement, et la surface d'activation reste minimale.

3. **`symbols`/`relations` toujours présents en v1** (vides si le dépôt n'a aucun code analysable), à l'image des collections de premier niveau v0 (§2.3). Un mode « v1 seulement si non vide » est rejeté : il multiplierait les versions dans un même corpus sans bénéfice.

4. **Resserrement des formes gelées à l'activation** (elles étaient `z.string()`/`z.number().int()` lâches) : `Symbol.id` en `/^y_[a-z2-7]{8,32}$/`, `Symbol.sourceNodeId` en `nodeId`, `startLine`/`endLine` en `.min(1)` + `refine(endLine ≥ startLine)`, et **vocabulaires fermés** `SymbolTypeSchema` et `RelationTypeSchema` (remplaçant `z.string()`). On fige un enum légèrement plus large que ce que v1 produit (membres de classe, `module`, `call`/`extends`/…) pour éviter un bump à chaque granularité ajoutée.

5. **`symbolId(sourceNodeId, qualifiedName, symbolType)` = `"y_" + idHash(sourceNodeId + "|" + qualifiedName + "|" + symbolType)`** — même `idHash` que le §4.2. La clé **exclut `startLine`** : un symbole déplacé par une édition sans rapport garde son identité (stabilité inter-commit, esprit d'ADR-0003), au prix d'une désambiguïsation par `symbolType` (pour les fusions de déclarations `interface Foo` / `const Foo`). Au sein d'un fichier, `(qualifiedName, symbolType)` est unique en TypeScript valide ; toute collision résiduelle est signalée (`IdCollisionError`, levier `idHashLength`), jamais silencieuse. Alternative rejetée : inclure `startLine` (identité unique mais **instable** entre commits, contraire à l'intention d'ADR-0003).

6. **Extraction ts-morph purement SYNTAXIQUE, hermétique.** Projet ts-morph **en mémoire** construit à partir des contenus déjà inventoriés ; aucun accès à `node_modules` ni à un `tsconfig` sur disque ; le **vérificateur de types n'est jamais invoqué**. Motifs : (a) déterminisme FR-026 — l'AST d'un fichier ne dépend que de ses octets, jamais d'un environnement ; (b) rapidité (§16.1) ; (c) sécurité §22.2 — on ne suit pas `tsconfig extends`, on n'exécute rien du dépôt. Portée MVP : TS/TSX/JS/JSX (§27.1). Un échec de parsing d'un fichier n'avorte pas l'analyse (FR-024) et **n'exclut jamais** le nœud a posteriori (préserve l'arbre et le layout déjà calculés).

7. **Relations node→node, résolution LEXICALE dans l'analyseur.** Une arête par `(fichier source, fichier cible, type)`, profondeur 1 (§14.6). La résolution de module est faite **par l'analyseur** (pas par ts-morph) contre l'ensemble figé des chemins du dépôt : seuls les spécificateurs **relatifs** résolus vers un fichier du dépôt produisent une relation ; les « bare » (npm, alias) sont **ignorés** (« lorsque possible », §14.6). Conventions reproduites : extensions omises, `./x.js` → `./x.ts` (nodenext), `index.*`. `RefTarget` reste gelé à `node | symbol` : aucun `kind: "external"` (éviterait de modifier une forme gelée). Conséquence assumée : les dépendances tierces sont invisibles au MVP.

8. **`SearchDoc.symbolNames` peuplé au niveau NODE.** Les noms des symboles top-level d'un fichier enrichissent son document de recherche (PRD §17.5), **sans** créer de document par symbole : la bijection `nodes ↔ documents` (§3.8.1) est préservée. La granularité `ref = symbolId` est reportée au sprint 7.

9. **Corpus : les mondes restent analysés en LOCAL.** `self`/`schema` suivent ce dépôt ; `zod` vient de `node_modules/zod` épinglé par le lockfile. Le clone GitHub par URL (`analyze <url>`) est une capacité **séparée** (PR suivante) : le corpus committé reste hors-ligne et déterministe (un clone de branche mouvante ne serait pas reproductible). `corpus:check` prouve FR-026 par double régénération, symboles/relations compris.

## Conséquences

- **Acceptation cohérente à quatre endroits couplés** : `SUPPORTED_SCHEMA_VERSIONS`, `ManifestSchema.schemaVersion`, `WorldSchema.superRefine`, messages de `parse.ts`. Les tests dé-versionnés (`schema.test`, `parse.test`, `schema-version.test`, `loader.test`) verrouillent la cohérence.
- **`ANALYZER_VERSION` 0.1.0 → 0.2.0** : changement délibéré (entités nouvelles) qui entre dans l'identité FR-026 et **autorise** la régénération du corpus. Synchronisé avec `package.json.version`.
- Le client n'a **aucune modification fonctionnelle** : la scène 3D ne lit pas `symbols`/`relations` ; l'index de recherche sait déjà consommer `symbolNames`. Le livrable « monde explorable sans modification du client » tient.
- **Reporté au sprint 7** (non régressif) : granularité par symbole (`ref = symbolId`), membres de classe, `summaries`/`tour`, relations symbol→symbol.

## Alternatives rejetées (résumé)

- **Additif sur v0** (pas de bump) : perte de l'invariant v0 et du signal de version. Rejeté (point 1).
- **`symbolId` avec `startLine`** : identité instable entre commits. Rejeté (point 5).
- **Résolution de modules par ts-morph** (tsconfig/node_modules) : non déterministe et surface de confiance §22.2. Rejeté (point 6-7).
- **`RefTarget.kind: "external"`** pour les imports npm : modifie une forme gelée pour un bénéfice MVP nul. Rejeté (point 7).
