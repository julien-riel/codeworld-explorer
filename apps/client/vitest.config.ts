import { defineConfig } from "vitest/config";

// Configuration locale : quand `vitest` tourne depuis ce paquet (via
// `pnpm --filter @codeworld/client test`), sa racine est ce dossier. Les tests
// de fondation (sélecteurs, loader, persistance) sont de la LOGIQUE PURE : ils
// tournent en environnement Node, sans DOM (fetch et localStorage sont simulés).
// Les tests d'interface 2D (`src/ui/**`) OPTENT pour jsdom par un docblock en tête
// de fichier (`// @vitest-environment jsdom`), pour ne pas alourdir les tests purs.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
});
