import { configDefaults, defineConfig } from "vitest/config";

// Configuration racine partagée. Environnement Node par défaut ; les paquets
// qui nécessitent le DOM (apps/client) le surchargeront localement.
export default defineConfig({
  test: {
    environment: "node",
    passWithNoTests: true,
    include: [
      "packages/**/*.{test,spec}.ts",
      "tools/**/*.{test,spec}.ts",
      "apps/**/src/**/*.{test,spec}.{ts,tsx}",
    ],
    // Les dépôts-échantillons du corpus contiennent des fichiers *.spec/*.test FICTIFS
    // (arborescences à analyser, non exécutables) : jamais collectés comme tests réels.
    exclude: [...configDefaults.exclude, "tools/corpus/samples/**"],
  },
});
