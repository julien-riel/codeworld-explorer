import { describe, it, expect } from "vitest";
import { nodeId, type Category, type SourceNode } from "@codeworld/world-schema";
import { buildSearchIndex } from "./search.js";

const rootId = nodeId("");
const srcId = nodeId("src");
const aId = nodeId("src/a.ts");
const NODES: SourceNode[] = [
  { id: rootId, parentId: null, path: "", name: "repo", nodeType: "directory", depth: 0, childCount: 1 },
  { id: srcId, parentId: rootId, path: "src", name: "src", nodeType: "directory", depth: 1, childCount: 1 },
  { id: aId, parentId: srcId, path: "src/a.ts", name: "a.ts", nodeType: "file", depth: 2, language: "TypeScript" },
];
const CATEGORIES = new Map<string, Category>([[rootId, "root"]]);

describe("buildSearchIndex — symbolNames (sprint 5)", () => {
  it("conserve la bijection nodes ↔ documents", () => {
    const index = buildSearchIndex(NODES, CATEGORIES, new Map([[aId, ["foo", "bar"]]]));
    expect(index.documents).toHaveLength(NODES.length);
    const refs = new Set(index.documents.map((d) => d.ref));
    expect(refs).toEqual(new Set(NODES.map((n) => n.id)));
  });

  it("pose symbolNames (copié) sur le document de fichier", () => {
    const index = buildSearchIndex(NODES, CATEGORIES, new Map([[aId, ["bar", "foo"]]]));
    const doc = index.documents.find((d) => d.ref === aId);
    expect(doc?.symbolNames).toEqual(["bar", "foo"]);
  });

  it("omet symbolNames quand le fichier n'a aucun symbole (jamais [])", () => {
    const index = buildSearchIndex(NODES, CATEGORIES, new Map());
    const doc = index.documents.find((d) => d.ref === aId);
    expect(doc?.symbolNames).toBeUndefined();
  });

  it("ne pose jamais symbolNames sur un dossier", () => {
    // Même si l'index en fournissait par erreur pour un dossier, il est ignoré.
    const index = buildSearchIndex(NODES, CATEGORIES, new Map([[srcId, ["oops"]]]));
    const doc = index.documents.find((d) => d.ref === srcId);
    expect(doc?.symbolNames).toBeUndefined();
  });
});
