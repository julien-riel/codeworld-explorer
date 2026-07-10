import { describe, it, expect } from "vitest";
import { canonicalStringify, nodeId, sha256Hex, symbolId, type SourceNode } from "@codeworld/world-schema";
import { extractCode } from "./code.js";
import { detectLanguage } from "./language.js";

/** Fabrique un nœud fichier + son contenu haché, comme le ferait l'inventaire. */
function fileNode(path: string, text: string): { node: SourceNode; hash: string; bytes: Uint8Array } {
  const bytes = new TextEncoder().encode(text);
  const hash = sha256Hex(bytes);
  const slash = path.lastIndexOf("/");
  const name = slash < 0 ? path : path.slice(slash + 1);
  const node: SourceNode = {
    id: nodeId(path),
    parentId: nodeId(slash < 0 ? "" : path.slice(0, slash)),
    path,
    name,
    nodeType: "file",
    depth: path.split("/").length,
    contentHash: hash,
    sizeBytes: bytes.length,
  };
  const language = detectLanguage(name);
  if (language !== undefined) node.language = language;
  return { node, hash, bytes };
}

const A = fileNode(
  "src/a.ts",
  [
    'import { helper } from "./b";',
    "export function foo() {",
    "  return helper();",
    "}",
    "export const bar = 1;",
    "function internal() {}",
    "export interface Shape {",
    "  x: number;",
    "}",
    "",
  ].join("\n"),
);

const B = fileNode(
  "src/b.ts",
  [
    "export function helper() {}",
    "export class Widget {}",
    "export type Id = string;",
    "const secret = 3;",
    "export { secret };",
    "",
  ].join("\n"),
);

const C = fileNode(
  "src/c.js",
  [
    'import { foo } from "./a";',
    'export { Widget } from "./b";',
    "export default function main() {",
    "  return foo();",
    "}",
    "",
  ].join("\n"),
);

const NODES: SourceNode[] = [
  { id: nodeId(""), parentId: null, path: "", name: "repo", nodeType: "directory", depth: 0, childCount: 1 },
  { id: nodeId("src"), parentId: nodeId(""), path: "src", name: "src", nodeType: "directory", depth: 1, childCount: 3 },
  A.node,
  B.node,
  C.node,
];
const CONTENTS = new Map<string, Uint8Array>([
  [A.hash, A.bytes],
  [B.hash, B.bytes],
  [C.hash, C.bytes],
]);

const HL = 16; // idHashLength par défaut

describe("extractCode — symboles top-level", () => {
  const { symbols } = extractCode(NODES, CONTENTS, HL);

  const find = (nodeIdStr: string, name: string) =>
    symbols.find((s) => s.sourceNodeId === nodeIdStr && s.name === name);

  it("extrait fonctions, constantes, interfaces, classes, alias de type", () => {
    expect(find(A.node.id, "foo")?.symbolType).toBe("function");
    expect(find(A.node.id, "bar")?.symbolType).toBe("constant");
    expect(find(A.node.id, "Shape")?.symbolType).toBe("interface");
    expect(find(B.node.id, "helper")?.symbolType).toBe("function");
    expect(find(B.node.id, "Widget")?.symbolType).toBe("class");
    expect(find(B.node.id, "Id")?.symbolType).toBe("type-alias");
  });

  it("distingue exporté / interne", () => {
    expect(find(A.node.id, "foo")?.exported).toBe(true);
    expect(find(A.node.id, "internal")?.exported).toBe(false);
    // `const secret` exporté via `export { secret }` (clause sans `from`).
    expect(find(B.node.id, "secret")?.exported).toBe(true);
  });

  it("traite `export default function` comme exporté", () => {
    expect(find(C.node.id, "main")?.exported).toBe(true);
    expect(find(C.node.id, "main")?.symbolType).toBe("function");
  });

  it("n'invente pas de symbole pour un import ou un re-export", () => {
    // `foo` est importé dans c.js (pas déclaré) ; `Widget` y est re-exporté depuis b.
    expect(find(C.node.id, "foo")).toBeUndefined();
    expect(find(C.node.id, "Widget")).toBeUndefined();
  });

  it("dérive chaque id par la formule symbolId", () => {
    const foo = find(A.node.id, "foo");
    expect(foo?.id).toBe(symbolId(A.node.id, "foo", "function", HL));
    expect(foo?.id).toMatch(/^y_[a-z2-7]{16}$/);
  });

  it("intervalle de lignes 1-based cohérent", () => {
    const foo = find(A.node.id, "foo");
    expect(foo?.startLine).toBe(2); // `export function foo() {` est en ligne 2
    expect((foo?.endLine ?? 0) >= (foo?.startLine ?? 0)).toBe(true);
  });

  it("symbols trié par id (ordre canonique §2.4)", () => {
    for (let i = 1; i < symbols.length; i += 1) {
      expect(symbols[i - 1]!.id <= symbols[i]!.id).toBe(true);
    }
  });
});

describe("extractCode — relations d'import (node→node)", () => {
  const { relations } = extractCode(NODES, CONTENTS, HL);

  const edge = (src: string, dst: string) =>
    relations.find((r) => r.sourceRef.id === src && r.targetRef.id === dst);

  it("import relatif résolu → relation `import`, confiance 1000", () => {
    const ab = edge(A.node.id, B.node.id);
    expect(ab?.relationType).toBe("import");
    expect(ab?.confidence).toBe(1000);
    expect(ab?.evidence).toContainEqual({ kind: "resolved-path", detail: "src/b.ts" });
    expect(ab?.evidence).toContainEqual({ kind: "module-specifier", detail: "./b" });
  });

  it("import depuis un .js résout vers la sœur .ts", () => {
    expect(edge(C.node.id, A.node.id)?.relationType).toBe("import");
  });

  it("`export … from` produit une relation `re-export`", () => {
    expect(edge(C.node.id, B.node.id)?.relationType).toBe("re-export");
  });

  it("aucune relation vers un module externe (bare specifier ignoré)", () => {
    // Personne n'importe de npm ici ; le total est exactement les 3 arêtes internes.
    expect(relations).toHaveLength(3);
  });

  it("relations triées (ordre canonique §2.4)", () => {
    const keys = relations.map((r) => `${r.sourceRef.id}|${r.targetRef.id}|${r.relationType}`);
    expect([...keys].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))).toEqual(keys);
  });
});

describe("extractCode — index et déterminisme", () => {
  it("symbolsByNodeId : noms triés et dédupliqués par fichier", () => {
    const { symbolsByNodeId } = extractCode(NODES, CONTENTS, HL);
    expect(symbolsByNodeId.get(A.node.id)).toEqual(["Shape", "bar", "foo", "internal"]);
  });

  it("FR-026 : deux exécutions produisent des symboles/relations identiques", () => {
    const r1 = extractCode(NODES, CONTENTS, HL);
    const r2 = extractCode(NODES, CONTENTS, HL);
    expect(canonicalStringify({ symbols: r1.symbols, relations: r1.relations })).toBe(
      canonicalStringify({ symbols: r2.symbols, relations: r2.relations }),
    );
  });

  it("un fichier de code sans symbole n'apparaît pas dans l'index", () => {
    const empty = fileNode("src/empty.ts", "// juste un commentaire\n");
    const nodes = [...NODES, empty.node];
    const contents = new Map(CONTENTS);
    contents.set(empty.hash, empty.bytes);
    const { symbolsByNodeId } = extractCode(nodes, contents, HL);
    expect(symbolsByNodeId.has(empty.node.id)).toBe(false);
  });
});
