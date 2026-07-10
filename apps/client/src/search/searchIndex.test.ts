import { describe, expect, it } from "vitest";
import type { SearchIndex } from "@codeworld/world-schema";
import { buildSearchIndex, runSearch } from "./searchIndex";

/**
 * Index de fixture : deux fichiers `checkout`, un README, un dossier `src`, et un
 * fichier portant des `symbolNames` (forme phase 1, tolérée par le schéma).
 */
const SEARCH: SearchIndex = {
  version: 0,
  documents: [
    { ref: "n_a", path: "src/checkout.ts", name: "checkout.ts", kind: "file", language: "TypeScript", category: "service" },
    { ref: "n_b", path: "src/checkout.test.ts", name: "checkout.test.ts", kind: "file", language: "TypeScript", category: "test" },
    { ref: "n_c", path: "docs/README.md", name: "README.md", kind: "file", language: "Markdown", category: "documentation" },
    { ref: "n_dir", path: "src", name: "src", kind: "directory" },
    { ref: "n_sym", path: "src/payment.ts", name: "payment.ts", kind: "file", language: "TypeScript", category: "service", symbolNames: ["computePremium", "PaymentGateway"] },
  ],
};

function refs(hits: { ref: string }[]): string[] {
  return hits.map((h) => h.ref);
}

describe("buildSearchIndex", () => {
  it("indexe chaque document et collecte langages et catégories pour les filtres", () => {
    const index = buildSearchIndex(SEARCH);
    expect(index.size).toBe(5);
    expect(index.languages).toEqual(["Markdown", "TypeScript"]);
    expect(index.categories).toEqual(["documentation", "service", "test"]);
  });
});

describe("runSearch", () => {
  const index = buildSearchIndex(SEARCH);

  it("retourne [] pour une requête vide", () => {
    expect(runSearch(index, "")).toEqual([]);
    expect(runSearch(index, "   ")).toEqual([]);
  });

  it("trouve un fichier par nom exact", () => {
    const hits = runSearch(index, "README.md");
    expect(refs(hits)).toEqual(["n_c"]);
  });

  it("trouve des fichiers par sous-chaîne (préfixe de mot)", () => {
    const hits = runSearch(index, "check");
    expect(refs(hits).sort()).toEqual(["n_a", "n_b"]);
  });

  it("trouve un symbole indexé par son nom", () => {
    const hits = runSearch(index, "computePremium");
    expect(refs(hits)).toEqual(["n_sym"]);
  });

  it("tolère une faute de frappe simple (recherche floue)", () => {
    const hits = runSearch(index, "chekout");
    expect(refs(hits)).toContain("n_a");
  });

  it("filtre par catégorie", () => {
    const hits = runSearch(index, "checkout", { category: "test" });
    expect(refs(hits)).toEqual(["n_b"]);
  });

  it("filtre par langage", () => {
    const hits = runSearch(index, "checkout", { language: "Markdown" });
    expect(hits).toEqual([]);
  });

  it("filtre par type de nœud", () => {
    const hits = runSearch(index, "src", { kind: "directory" });
    expect(refs(hits)).toEqual(["n_dir"]);
  });
});
