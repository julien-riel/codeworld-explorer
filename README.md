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
| `pnpm --filter @codeworld/client dev` | Démarre le client en développement. |

## Conventions

- Identifiants, noms de fichiers et API en anglais ; commentaires et documentation en français.
- Le moteur de layout (`packages/world-schema`) doit rester une fonction pure : ni `Math.random`,
  ni `Date.now` (règle ESLint dédiée, PRD 14.2).
