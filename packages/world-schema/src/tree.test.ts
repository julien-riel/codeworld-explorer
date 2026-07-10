import { describe, it, expect } from "vitest";
import type { SourceNode } from "./schema.js";
import { nodeId } from "./ids.js";
import { assertTreeInvariants } from "./tree.js";
import { TreeInvariantError } from "./errors.js";

function dir(path: string, parentId: string | null, id?: string): SourceNode {
  const segs = path === "" ? [] : path.split("/");
  const name = segs.length === 0 ? "root" : (segs[segs.length - 1] ?? "root");
  return {
    id: id ?? nodeId(path),
    parentId,
    path,
    name,
    nodeType: "directory",
    depth: segs.length,
  };
}

/** Récupère la règle violée sans dépendre du message (français, UI). */
function ruleOf(fn: () => void): string {
  try {
    fn();
  } catch (error) {
    if (error instanceof TreeInvariantError) return error.rule;
    throw error;
  }
  throw new Error("aucune TreeInvariantError levée");
}

describe("assertTreeInvariants (contrat §3.5.3)", () => {
  it("fixture saine : passe", () => {
    const nodes = [dir("", null), dir("a", nodeId("")), dir("a/b", nodeId("a"))];
    expect(() => assertTreeInvariants(nodes)).not.toThrow();
  });

  it("1. racine unique : deux nœuds à parentId null", () => {
    const nodes = [dir("", null), dir("orphan", null)];
    expect(ruleOf(() => assertTreeInvariants(nodes))).toBe("root-unique");
  });

  it("1bis. racine unique : la racine doit avoir path === \"\"", () => {
    // Un seul parentId null, mais son path n'est pas vide.
    const nodes = [dir("solo", null)];
    expect(ruleOf(() => assertTreeInvariants(nodes))).toBe("root-path");
  });

  it("4. unicité des chemins : path en double", () => {
    const nodes = [dir("", null), dir("a", nodeId("")), dir("a", nodeId(""))];
    expect(ruleOf(() => assertTreeInvariants(nodes))).toBe("path-unique");
  });

  it("5. identité dérivée : id forgé hors formule", () => {
    const forged = "n_" + "a".repeat(16);
    const nodes = [dir("", null), dir("a", nodeId(""), forged)];
    expect(ruleOf(() => assertTreeInvariants(nodes))).toBe("id-derived");
  });

  it("2. références résolues : parentId absent de l'ensemble", () => {
    const dangling = "n_" + "b".repeat(16);
    const nodes = [dir("", null), dir("a/b", dangling)];
    expect(ruleOf(() => assertTreeInvariants(nodes))).toBe("parent-resolved");
  });

  it("6. absence de cycle : deux nœuds se pointant mutuellement", () => {
    const nodes = [dir("", null), dir("x", nodeId("y")), dir("y", nodeId("x"))];
    expect(ruleOf(() => assertTreeInvariants(nodes))).toBe("no-cycle");
  });

  it("3. cohérence parent↔chemin : parentId ≠ nodeId(parentPath)", () => {
    // « b » désigne « a » comme parent alors que son chemin parent est la racine.
    const nodes = [dir("", null), dir("a", nodeId("")), dir("b", nodeId("a"))];
    expect(ruleOf(() => assertTreeInvariants(nodes))).toBe("parent-path-coherent");
  });

  it("7. tri : nodes non trié par path", () => {
    const nodes = [dir("", null), dir("b", nodeId("")), dir("a", nodeId(""))];
    expect(ruleOf(() => assertTreeInvariants(nodes))).toBe("sorted-by-path");
  });

  it("porte les chemins/ids fautifs (exploitable, pas seulement un texte)", () => {
    const nodes = [dir("", null), dir("a", nodeId("")), dir("a", nodeId(""))];
    try {
      assertTreeInvariants(nodes);
      throw new Error("attendu : levée");
    } catch (error) {
      expect(error).toBeInstanceOf(TreeInvariantError);
      if (error instanceof TreeInvariantError) {
        expect(error.paths).toContain("a");
        expect(error.kind).toBe("tree-invariant");
      }
    }
  });
});
