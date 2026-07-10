# ADR-0005 — Clone GitHub par URL, cache par hash de contenu et sidecar de provenance

**Statut :** accepté
**Date :** 2026-07-10
**Portée :** phase 1, sprint 5 (« Analyseur TypeScript »), second incrément
**Références :** PRD v3.0 §14.1, §16.1, §17.1, §19.3, §20.2, §21.1, §22.2, §27.3, FR-024, FR-026 ; plan §3 (sprint 5), §7 (gouvernance) ; spec `docs/spec/world-schema-v0.md` §3.3, §3.4, §10.1, §10.4 ; ADR-0002 (déterminisme et horodatage), ADR-0004 §9 (report du clone)

## Contexte

Le premier incrément du sprint 5 (ADR-0004) a livré le cœur d'analyse statique (symboles, relations) sur le pipeline **local** et a explicitement **différé** trois capacités à ce second incrément (ADR-0004 §9) : le clone GitHub par URL (`analyze <url>`), le cache filesystem par hash de contenu, et le journal de progression par étape. Ce sont les dernières briques du livrable J5 « une commande → un monde ».

Trois exigences dures encadrent la décision : FR-026 (reproductibilité octet), FR-024 (un échec local n'avorte pas l'analyse), et §22.2 (ne jamais exécuter le code du dépôt, borner les ressources, traiter le contenu comme non fiable). Aucune évolution de schéma n'est requise : le contrat est déjà en v1 (symboles/relations activés) et le sidecar de provenance était déjà **spécifié** au §10.4 sans être encore produit.

## Décision

1. **`analyze <cible>` accepte un chemin local OU une URL GitHub.** La détection est lexicale (`looksLikeRepoUrl`) : schéma `://`, `git@`, ou hôte `github.com`. Un raccourci ambigu `owner/repo` reste un **chemin local** (jamais deviné comme dépôt distant). Une entrée qui ressemble à une URL mais échoue à l'analyse **lève** (`InvalidRepoUrlError`), sans repli silencieux en local. Au MVP, **seul github.com** est cloné (§21.1) ; tout autre hôte est refusé explicitement.

2. **Séparation stricte des sources de métadonnées, adossée à FR-026 §10.1.** Le **commit** (via `git`) fournit les entrées **déterministes** : `commitSha` (HEAD après clone), la committer date brute `%cI` (normalisée par le pipeline en UTC-seconde-`Z`, spec §3.4.1) et l'arbre source. L'**API GitHub** fournit les métadonnées **mutables** injectées (§10.1 entrée 3) : `license` (SPDX), la casse canonique `owner/name`, et `repository.defaultBranch` (une métadonnée de dépôt, pas nécessairement la branche analysée), avec **repli** sur la branche extraite du clone si l'API est indisponible. La branche **analysée** `snapshot.branch` est toujours celle du clone — distincte de `defaultBranch` lorsqu'un `--ref` est passé. Deux analyses du **même commit** produisent le **même artefact** (démontré : octet pour octet sur un dépôt réel).

3. **Ports injectables `GitPort` et `GitHubPort`.** Toute I/O réseau/processus passe par un port, si bien que les tests sont **hermétiques et hors-ligne** : le clone est testé contre un dépôt `file://` local réel (mécanisme `git`) et le flux complet contre des ports factices (orchestration). Un lint/CI ne dépend jamais de github.com.

4. **Clone durci (§22.2), jamais d'exécution.** `git clone --depth 1 --single-branch --no-tags --no-recurse-submodules` ; `-c core.hooksPath=/dev/null`, `-c credential.helper=`, `GIT_TERMINAL_PROMPT=0`, `GIT_CONFIG_NOSYSTEM=1` neutralisent hooks, invites d'identifiants et config héritée ; `--` sépare options et arguments (anti-injection d'options). `git clone` copie l'arbre mais n'exécute rien (pas de `npm install`, pas de script). Les liens sortants et les limites §27.3 restent gérés par l'inventaire en aval. `--ref <branche|tag>` pinne une référence ; le pin d'un SHA arbitraire (fetch dédié) est hors périmètre MVP.

5. **Dégradation propre si l'API échoue (FR-024).** Hors-ligne, 404 ou quota dépassé : l'analyse **continue** avec `license = null`, la branche déduite du clone, et un **avertissement** — un artefact conforme est tout de même produit (§17.1). Seul le clone lui-même est bloquant (sans arbre, pas de monde) : son échec est une `GitCloneError` typée, avec l'étape fautive.

6. **Cache filesystem par HASH DE CONTENU (analyse incrémentale, §20.2).** On mémoïse les **faits bruts** de l'étage ts-morph — symboles top-level *sans `id`*, spécificateurs d'import — car ils ne dépendent QUE des octets du fichier ET de son **extension** (qui pilote le mode du parseur : JSX en `.tsx`/`.jsx`). La clé est donc `(contentHash, ext)`. Restent **recalculés** à chaque exécution, car dépendants de l'état global du dépôt : l'`id` du symbole (dérivé du chemin, spec §15.4) et la résolution lexicale des relations (contre l'ensemble des chemins). Ces recalculs sont bon marché. Le cache mémoïse une **fonction pure** : un cache **chaud** produit un artefact **identique octet pour octet** à un cache froid (test dédié + démonstration réelle). `PARSE_CACHE_VERSION` invalide les entrées si la logique d'extraction change ; une entrée illisible ou périmée est un **défaut** (auto-réparation), jamais une erreur. Le cache est **opt-in** (`--cache <dir>`) : le pipeline par défaut, et donc le corpus committé, reste sans cache (déterminisme non perturbé, tests de reproductibilité inchangés).

7. **Sidecar de provenance `world.build.json` réalisé (spec §10.4).** SEUL endroit où vit l'heure réelle : `{ buildAt, host, analyzerVersion, durationsMs, artifactSha256 }`. Fichier **séparé**, **hors FR-026**, jamais lu par le client, **git-ignoré** et **jamais committé** (le corpus le désactive par `--no-provenance`). L'`artifactSha256` (empreinte des octets de `world.json`) est, lui, couvert par FR-026. Écrit par défaut ; `--no-provenance` le supprime.

8. **Journal de progression par étape, OBSERVATEUR pur.** `ProgressReporter` reçoit début/fin d'étape (§19.3) ; le pipeline ne **relit jamais** ses mesures pour construire l'artefact. Cette asymétrie garantit que le chronométrage (horloge réelle) n'entre pas dans `world.json` (FR-026) — il ne nourrit que la provenance. Le reporter par défaut est **muet** (`NOOP_REPORTER`) : sans reporter injecté, `analyze` reste pur et silencieux, sans appel à `Date`. En cas d'échec, l'étape courante est rapportée (`échec [code] [étape : X]`).

9. **Le corpus reste analysé en LOCAL** (inchangé, ADR-0004 §9) : `self`/`schema` suivent ce dépôt, `zod` vient du lockfile. Le clone par URL est une capacité **parallèle** ; un clone de branche mouvante ne serait pas reproductible dans un artefact committé.

## Conséquences

- **Aucune évolution de schéma** ni de `world-schema` : le contrat v1 suffit. `ANALYZER_VERSION` reste **0.2.0** — le sprint n'a pas modifié les octets produits pour une entrée locale donnée (le refactor de `code.ts` est purement structurel ; `schema` et `zod` du corpus restent identiques au bit près). Le corpus n'est donc pas régénéré, sauf `self` (ce dépôt a grossi, ce qui est attendu).
- **`code.ts` scindé en deux couches** : `symbols.ts` expose `extractRawSymbols`/`assembleSymbol` (fait brut vs dérivation d'`id`) ; `relations.ts` expose `ImportSpec`. Le cache s'insère à la couture, sans changer la sortie.
- **Le client n'a aucune modification** : le livrable « monde explorable sans modification du client » tient (un monde issu d'une URL est un `world.json` v1 comme un autre).
- **Frontière propre déterministe/observé** : `world.json` (pur, FR-026) vs `world.build.json` (heure réelle, hors FR-026). `world-schema` reste sans `Date`/`node:*` ; provenance et horloge vivent dans l'analyseur.

## Alternatives rejetées (résumé)

- **Lire `commitSha`/`committedAt` depuis l'API** plutôt que du clone : l'API renvoie l'auteur/committer date mais introduit une source réseau là où `git` donne la valeur déterministe exacte de `%cI` (spec §3.4.1). Rejeté (point 2).
- **Cache clé = contentHash seul** (sans extension) : deux fichiers d'octets identiques mais d'extensions différentes (`.ts` vs `.tsx`) parsent différemment (JSX). Rejeté (point 6).
- **Cache activé par défaut** : perturberait le déterminisme du corpus committé et les tests de reproductibilité, sans bénéfice pour un corpus curé de petite taille. Rejeté au profit de l'opt-in (point 6).
- **Provenance dans `world.json`** : ferait fuir l'heure réelle dans l'artefact (violation FR-026). Rejeté au profit du sidecar §10.4 (point 7).
- **Clone récursif des sous-modules** : élargirait la surface (§22.2) et casserait le déterminisme (sous-module mouvant). Rejeté (point 4).
