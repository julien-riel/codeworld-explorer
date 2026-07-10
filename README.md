# CodeWorld Explorer

Transforme un dépôt GitHub en un environnement 3D navigable à la première personne (FPS).
Le pipeline analyse un dépôt et produit un artefact `world.json` ; le client Web le rend en un monde explorable.

## Structure du monorepo

Monorepo pnpm workspaces. La seule frontière d'architecture est le contrat `world.json` :
tout ce qui est en amont est le pipeline, tout ce qui est en aval est le client.

| Paquet | Rôle |
|---|---|
| `packages/world-schema` | Contrat `world.json` (types + Zod) et moteur de layout, fonction pure et déterministe. |
| `packages/analyzer` | CLI `codeworld` : clone, analyse statique, classification, layout, écriture de l'artefact. |
| `apps/client` | Application Vite + React 19 + React Three Fiber qui rend le monde. |
| `tools/assets` | Pipeline `gltf-transform` de normalisation des kits d'assets 3D et manifeste de provenance. |

## Prérequis

- Node >= 22.12
- pnpm 11

## Commandes

| Commande | Effet |
|---|---|
| `pnpm install` | Installe toutes les dépendances de l'espace de travail. |
| `pnpm lint` | ESLint sur l'ensemble du dépôt. |
| `pnpm typecheck` | Vérification des types de chaque paquet. |
| `pnpm test` | Tests Vitest. |
| `pnpm build` | Build de chaque paquet. |
| `pnpm ci` | Enchaîne lint, typecheck, test et build. |
| `pnpm corpus:build` | Régénère le corpus de démonstration servi au client. |
| `pnpm corpus:check` | Vérifie la reproductibilité FR-026 par double régénération. |
| `pnpm --filter @codeworld/client dev` | Démarre le client en développement. |

## Analyser un dépôt (`codeworld analyze`)

Après `pnpm --filter @codeworld/analyzer build`, le CLI `codeworld` produit un `world.json`
à partir d'un **chemin local** ou d'une **URL GitHub publique** — « une commande → un monde » :

```sh
# Dépôt GitHub public : clone superficiel du commit, métadonnées via l'API, analyse.
node packages/analyzer/dist/cli.js analyze https://github.com/owner/repo --out ./monde

# Arborescence locale déjà présente sur disque.
node packages/analyzer/dist/cli.js analyze ./chemin/vers/depot --out ./monde
```

| Option | Effet |
|---|---|
| `-o, --out <dir>` | Répertoire de sortie (`world.json` + `files/` + `world.build.json`). |
| `-c, --config <file>` | Configuration JSON (métadonnées, exclusions, classification). |
| `-s, --seed <seed>` | Graine de layout (surcharge la configuration). |
| `-r, --ref <branche\|tag>` | Référence à cloner (URL GitHub ; défaut : branche par défaut). |
| `--cache <dir>` | Active le cache par hash de contenu (analyse statique incrémentale). |
| `--no-provenance` | N'écrit pas le sidecar `world.build.json`. |
| `-q, --quiet` | N'émet pas le journal de progression par étape. |

- Un `GITHUB_TOKEN` (ou `GH_TOKEN`) dans l'environnement relève la limite de taux de l'API
  et n'est jamais écrit dans l'artefact. Sans jeton, l'analyse fonctionne (licence `null`
  si l'API est indisponible) : seul le clone est bloquant.
- `world.json` est reproductible **octet pour octet** pour un même commit et une même
  configuration (FR-026). Le sidecar `world.build.json` porte l'heure réelle et les durées
  par étape : il est **hors** FR-026, git-ignoré, jamais lu par le client.

## Conventions

- Identifiants, noms de fichiers et API en anglais ; commentaires et documentation en français.
- Le moteur de layout (`packages/world-schema`) doit rester une fonction pure : ni `Math.random`,
  ni `Date.now` (règle ESLint dédiée, PRD 14.2).
