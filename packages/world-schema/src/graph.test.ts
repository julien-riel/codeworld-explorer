import { describe, it, expect } from "vitest";
import {
  assertSymbolInvariants,
  assertRelationInvariants,
  compareSymbols,
  compareRelations,
} from "./graph.js";
import { nodeId, symbolId } from "./ids.js";
import type { Relation, SourceNode, Symbol } from "./schema.js";
import { RelationInvariantError, SymbolInvariantError } from "./errors.js";

/** Deux nœuds fichier + racine, pour ancrer symboles et relations. */
const rootId = nodeId("");
const aId = nodeId("src/a.ts");
const bId = nodeId("src/b.ts");
const NODES: SourceNode[] = [
  { id: rootId, parentId: null, path: "", name: "repo", nodeType: "directory", depth: 0, childCount: 1 },
  { id: aId, parentId: nodeId("src"), path: "src/a.ts", name: "a.ts", nodeType: "file", depth: 2 },
  { id: bId, parentId: nodeId("src"), path: "src/b.ts", name: "b.ts", nodeType: "file", depth: 2 },
  { id: nodeId("src"), parentId: rootId, path: "src", name: "src", nodeType: "directory", depth: 1, childCount: 2 },
];

/** Fabrique un symbole bien formé (id dérivé de la formule). */
function sym(sourceNodeId: string, qualifiedName: string, symbolType: Symbol["symbolType"], lines: [number, number], exported = true): Symbol {
  return {
    id: symbolId(sourceNodeId, qualifiedName, symbolType),
    sourceNodeId,
    name: qualifiedName,
    qualifiedName,
    symbolType,
    startLine: lines[0],
    endLine: lines[1],
    exported,
  };
}

function nodeRef(id: string): Relation["sourceRef"] {
  return { kind: "node", id };
}

describe("assertSymbolInvariants (contrat §3.9, §4.3)", () => {
  it("symboles bien formés, triés par id : aucune levée", () => {
    const symbols = [sym(aId, "foo", "function", [1, 3]), sym(aId, "Bar", "class", [5, 9])].sort(compareSymbols);
    expect(() => assertSymbolInvariants(symbols, NODES)).not.toThrow();
  });

  it("id non dérivé de la formule : SymbolInvariantError(id-derived)", () => {
    const bad = { ...sym(aId, "foo", "function", [1, 3]), id: "y_deadbeefdeadbeef" };
    expect(() => assertSymbolInvariants([bad], NODES)).toThrow(SymbolInvariantError);
  });

  it("sourceNodeId absent ou non-fichier : SymbolInvariantError(source-node-resolved)", () => {
    // Ancré sur la racine (dossier) : refusé, un symbole appartient à un fichier.
    const onDir = sym(rootId, "foo", "function", [1, 3]);
    expect(() => assertSymbolInvariants([onDir], NODES)).toThrow(/source-node-resolved/);
    // Ancré sur un id inexistant.
    const ghost = sym(nodeId("src/ghost.ts"), "foo", "function", [1, 3]);
    expect(() => assertSymbolInvariants([ghost], NODES)).toThrow(SymbolInvariantError);
  });

  it("intervalle de lignes incohérent (endLine < startLine) : SymbolInvariantError(line-range)", () => {
    const bad = sym(aId, "foo", "function", [9, 3]);
    expect(() => assertSymbolInvariants([bad], NODES)).toThrow(/line-range/);
  });

  it("symbole en double (même clé) : SymbolInvariantError(duplicate)", () => {
    const dup = sym(aId, "foo", "function", [1, 3]);
    expect(() => assertSymbolInvariants([dup, dup], NODES)).toThrow(/duplicate/);
  });

  it("tableau non trié par id : SymbolInvariantError(sorted-by-id)", () => {
    const symbols = [sym(aId, "foo", "function", [1, 3]), sym(aId, "Bar", "class", [5, 9])].sort(compareSymbols);
    const unsorted = [...symbols].reverse();
    // On ne déclenche le tri que si l'ordre inversé diffère (ids distincts garantis).
    expect(() => assertSymbolInvariants(unsorted, NODES)).toThrow(/sorted-by-id/);
  });

  it("aucun id étranger ne franchit le garde (id figé hors formule)", () => {
    // Un id emprunté à un autre symbole (clé ≠) échoue d'abord sur id-derived : la
    // garde n'admet jamais un id non conforme à la formule, ce qui borne en amont toute
    // possibilité de collision par un id forgé.
    const s1 = sym(aId, "foo", "function", [1, 3]);
    const forged = { ...sym(aId, "bar", "function", [5, 7]), id: s1.id };
    expect(() => assertSymbolInvariants([forged], NODES)).toThrow(/id-derived/);
  });
});

describe("assertRelationInvariants (contrat §3.9)", () => {
  const symbols: Symbol[] = [];

  it("relations node→node résolues et triées : aucune levée", () => {
    const relations: Relation[] = [
      {
        sourceRef: nodeRef(aId),
        targetRef: nodeRef(bId),
        relationType: "import",
        confidence: 1000,
        evidence: [
          { kind: "module-specifier", detail: "./b" },
          { kind: "resolved-path", detail: "src/b.ts" },
        ],
      },
    ];
    relations.sort(compareRelations);
    expect(() => assertRelationInvariants(relations, NODES, symbols)).not.toThrow();
  });

  it("sourceRef non résolue : RelationInvariantError(source-ref-resolved)", () => {
    const rel: Relation = {
      sourceRef: nodeRef(nodeId("src/ghost.ts")),
      targetRef: nodeRef(bId),
      relationType: "import",
      confidence: 1000,
      evidence: [],
    };
    expect(() => assertRelationInvariants([rel], NODES, symbols)).toThrow(/source-ref-resolved/);
  });

  it("targetRef non résolue : RelationInvariantError(target-ref-resolved)", () => {
    const rel: Relation = {
      sourceRef: nodeRef(aId),
      targetRef: nodeRef(nodeId("src/ghost.ts")),
      relationType: "import",
      confidence: 1000,
      evidence: [],
    };
    expect(() => assertRelationInvariants([rel], NODES, symbols)).toThrow(RelationInvariantError);
  });

  it("evidence non triée : RelationInvariantError(evidence-sorted)", () => {
    const rel: Relation = {
      sourceRef: nodeRef(aId),
      targetRef: nodeRef(bId),
      relationType: "import",
      confidence: 1000,
      evidence: [
        { kind: "resolved-path", detail: "src/b.ts" },
        { kind: "module-specifier", detail: "./b" },
      ],
    };
    expect(() => assertRelationInvariants([rel], NODES, symbols)).toThrow(/evidence-sorted/);
  });

  it("relations non triées : RelationInvariantError(sorted)", () => {
    const mk = (src: string, dst: string): Relation => ({
      sourceRef: nodeRef(src),
      targetRef: nodeRef(dst),
      relationType: "import",
      confidence: 1000,
      evidence: [],
    });
    const sorted = [mk(aId, bId), mk(bId, aId)].sort(compareRelations);
    const unsorted = [...sorted].reverse();
    expect(() => assertRelationInvariants(unsorted, NODES, symbols)).toThrow(/sorted/);
  });
});
