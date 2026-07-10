import { describe, it, expect } from "vitest";
import { mulberry32, nodeStreamSeed, prngOf } from "./random.js";

function take(next: () => number, n: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(next());
  return out;
}

describe("mulberry32", () => {
  it("même graine → même suite", () => {
    const a = take(mulberry32(12345), 8);
    const b = take(mulberry32(12345), 8);
    expect(a).toEqual(b);
  });

  it("graines distinctes → suites divergentes", () => {
    const a = take(mulberry32(1), 8);
    const b = take(mulberry32(2), 8);
    expect(a).not.toEqual(b);
  });

  it("rend des entiers uint32", () => {
    const next = mulberry32(0xdeadbeef);
    for (const v of take(next, 100)) {
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(0xffffffff);
      expect(v >>> 0).toBe(v);
    }
  });

  it("première sortie stable (référence de l'algorithme du contrat §5.2)", () => {
    // Valeur figée : détecte toute dérive de l'implémentation.
    expect(mulberry32(0)()).toBe(1144304738);
  });
});

describe("dérivation de graine par nœud (contrat §5.3)", () => {
  it("nodeStreamSeed est un entier uint32 déterministe", () => {
    const s = nodeStreamSeed("cwe-v0", "src/index.ts");
    expect(Number.isInteger(s)).toBe(true);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(0xffffffff);
    expect(nodeStreamSeed("cwe-v0", "src/index.ts")).toBe(s);
  });

  it("normalise le path (mêmes octets pour des formes équivalentes)", () => {
    expect(nodeStreamSeed("cwe-v0", "./src/index.ts/")).toBe(
      nodeStreamSeed("cwe-v0", "src/index.ts"),
    );
    expect(nodeStreamSeed("cwe-v0", "src\\index.ts")).toBe(nodeStreamSeed("cwe-v0", "src/index.ts"));
  });

  it("dépend de la graine et du chemin", () => {
    expect(nodeStreamSeed("cwe-v0", "a")).not.toBe(nodeStreamSeed("other", "a"));
    expect(nodeStreamSeed("cwe-v0", "a")).not.toBe(nodeStreamSeed("cwe-v0", "b"));
  });

  it("prngOf sème un flux reproductible depuis le path", () => {
    expect(take(prngOf("cwe-v0", "src/a.ts"), 5)).toEqual(take(prngOf("cwe-v0", "src/a.ts"), 5));
    expect(take(prngOf("cwe-v0", "src/a.ts"), 5)).not.toEqual(take(prngOf("cwe-v0", "src/b.ts"), 5));
  });
});
