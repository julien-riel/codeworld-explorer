import { defineConfig } from "vitest/config";

// Configuration locale : quand `vitest` tourne depuis ce paquet, sa racine est ce
// dossier et le glob `packages/**` de la config racine ne matche plus rien. On cible
// donc explicitement les tests co-localisés dans `src`.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.{test,spec}.ts"],
  },
});
