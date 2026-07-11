import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

// Flat config ESLint 9. Les règles typées (recommended-type-checked) s'appuient
// sur le « project service » de typescript-eslint, qui associe chaque fichier au
// tsconfig le plus proche. Les fichiers de configuration sont exclus du typage.
export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/coverage/**",
      "**/*.tsbuildinfo",
      // Dépôts-échantillons du corpus : arborescences FICTIVES à analyser (dépendances
      // volontairement absentes, hors de tout tsconfig) — jamais compilées ni linté.
      "tools/corpus/samples/**",
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // Les paramètres et variables préfixés d'un souligné sont volontairement inutilisés
  // (placeholders, signatures à honorer).
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },

  // Globals navigateur pour le client.
  {
    files: ["apps/client/**/*.{ts,tsx}"],
    languageOptions: { globals: { ...globals.browser } },
  },

  // Globals Node pour le pipeline et l'outillage d'assets.
  {
    files: ["packages/analyzer/**/*.ts", "tools/assets/**/*.ts"],
    languageOptions: { globals: { ...globals.node } },
  },

  // PRD 14.2 : le moteur de layout doit être une fonction pure. On interdit
  // toute source d'entropie ou d'horloge dans le paquet du schéma/layout.
  {
    files: ["packages/world-schema/src/**/*.ts"],
    rules: {
      "no-restricted-properties": [
        "error",
        {
          object: "Math",
          property: "random",
          message:
            "Le moteur de layout doit être déterministe et pur (PRD 14.2) : pas de Math.random.",
        },
        {
          object: "Date",
          property: "now",
          message:
            "Le moteur de layout doit être déterministe et pur (PRD 14.2) : pas de Date.now.",
        },
        {
          object: "performance",
          property: "now",
          message:
            "Le moteur de layout doit être déterministe et pur (PRD 14.2) : pas de performance.now.",
        },
      ],
    },
  },

  // Les fichiers de configuration ne sont pas typés par le project service.
  {
    files: ["**/*.config.{js,ts}", "eslint.config.js"],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: { projectService: false },
    },
  },

  // Outillage de corpus : scripts Node ESM sans tsconfig associé (hors type-check).
  {
    files: ["tools/corpus/**/*.mjs"],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: { projectService: false },
    },
  },

  // Harnais de vérification (smoke navigateur Playwright) : script Node ESM hors build
  // et hors tsconfig, qui embarque aussi du code exécuté dans la page (globals
  // navigateur via `page.evaluate`). Ni typé, ni bundlé.
  {
    files: ["apps/client/verification/**/*.mjs"],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
      parserOptions: { projectService: false },
    },
  },
);
