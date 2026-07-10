# ADR-0002 — Déterminisme et horodatage de l'artefact

**Statut :** accepté
**Date :** 2026-07-10
**Portée :** phase 0, sprints 1 à 3
**Références :** PRD v3.0 §18.2, §16.2, FR-026 ; spec `docs/spec/world-schema-v0.md` §6, §10

## Contexte

FR-026 exige un artefact **identique octet pour octet** pour un même `(dépôt, commit, configuration, version d'analyseur)`. Or PRD §18.2 place `generatedAt` dans le `Manifest` et `analyzedAt` dans le `Snapshot` : ce sont des horodatages d'**exécution**, qui rendent l'artefact non reproductible. Il faut trancher d'où vient le temps et rendre la règle FR-026 testable.

## Décision

1. **Aucun horodatage d'exécution dans `world.json`.**
   - `generatedAt` (Manifest) est **supprimé**.
   - `analyzedAt` (Snapshot) est **remplacé** par `snapshot.committedAt` = **committer date** du commit (`git show -s --format=%cI`), propriété déterministe hachée dans le SHA, donc identique pour toute analyse du même commit.
2. **L'heure réelle d'exécution part dans un sidecar `world.build.json`** : `{ buildAt, host, analyzerVersion, durationsMs, artifactSha256 }`. Explicitement **hors FR-026**, jamais lu par le client pour une décision reproductible.
3. **Sérialisation canonique** (spec §6) : clés triées en code-unit UTF-16, tableaux pré-triés par le producteur, **entiers seuls** (garde d'exécution levant sur non-entier / NaN / Infini ; `String(-0) === "0"`), chaînes via `JSON.stringify`, texte multiligne normalisé LF, minifié, UTF-8 sans BOM, **sans saut de ligne final**. Le fichier **EST** exactement `serializeWorld(world)`.
4. **Règle FR-026 (normative, testable) :** `serializeWorld(computeWorld(entrée))` produit le même `Uint8Array` à chaque exécution ; comparaison sur les octets **non compressés de `world.json` seul**. Exclus : `world.build.json`, `files/<hash>`, toute compression de transport.

## Conséquences

- **Testable par :** (a) double exécution → égalité octet à octet + `hashWorld` égal ; (b) snapshot doré = hash hex committé (insensible aux fins de ligne), la CI échoue si un octet change sans bump de `analyzerVersion`/`layoutVersion`/`schemaVersion` ; (c) lint anti-horodatage : aucune clé d'horloge murale dans `world.json` sauf `committedAt`, dont le test vérifie l'égalité avec `git %cI` ; (d) gardes Zod `.int()`/`.strict()`.
- On ne compare **jamais** des octets gzip/brotli (compression non garantie déterministe) : on compresse pour le transport, on hache l'artefact décompressé.
- Le tuple d'identité FR-026 est entièrement porté par l'artefact, sans valeur d'exécution.
- **Compromis assumé :** l'artefact principal perd la trace de « quand l'analyse a tourné » (il faut lire le sidecar) et affiche `committedAt` (date du commit) plutôt que la date d'analyse. Sur un rebase (nouveau SHA), `committedAt` change — acceptable puisque le SHA aussi. C'est une modification de la liste de champs de PRD §18.2, consignée ici.

## Alternatives écartées

- **Conserver `generatedAt`/`analyzedAt` et les exclure de la comparaison** : rend « octet pour octet » faux au sens strict et impose une frontière de comparaison par champ, fragile et facile à contourner par erreur. Rejeté au profit d'un artefact sans aucun horodatage d'exécution.
- **Dériver le temps d'un horodatage d'exécution arrondi** (jour, heure) : reste non reproductible entre deux exécutions à cheval sur la frontière d'arrondi. Rejeté.
- **Hacher les octets compressés** : la compression n'est pas garantie déterministe entre versions d'outil/niveaux ; ferait échouer FR-026 faussement. Rejeté.
- **Author date plutôt que committer date** : l'author date ne bouge pas au rebase alors que le SHA change, créant une incohérence `commitSha`/`committedAt`. On retient la committer date, cohérente avec le SHA.
