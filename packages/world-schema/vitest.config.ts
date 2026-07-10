import { defineConfig } from "vitest/config";

// Configuration locale : quand `vitest` tourne depuis ce paquet (via
// `pnpm --filter @codeworld/world-schema test`), sa racine est ce dossier, et
// le glob `packages/**` de la config racine ne matche plus rien. On cible donc
// explicitement les tests unitaires co-localisés dans `src` ET la suite de bout
// en bout dans `test/` (snapshots, déterminisme, invariants, anti-friction…).
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.{test,spec}.ts", "test/**/*.{test,spec}.ts"],
  },
});
