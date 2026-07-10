import { defineConfig } from "vitest/config";

// Configuration locale : `pnpm --filter @codeworld/assets test` n'exécute que les
// tests de ce paquet. La configuration racine couvre le monorepo entier.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.{test,spec}.ts"],
  },
});
