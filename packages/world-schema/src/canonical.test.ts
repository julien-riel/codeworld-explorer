import { describe, it, expect } from "vitest";
import { canonicalStringify, canonicalBytes, hashWorld } from "./canonical.js";
import { sha256Hex } from "./hash/sha256.js";
import { NonCanonicalNumberError, NonCanonicalValueError } from "./errors.js";

describe("canonicalStringify — ordre des clés", () => {
  it("l'ordre des clés d'entrée n'influence pas la sortie", () => {
    const a = canonicalStringify({ b: 1, a: 2, c: 3 });
    const b = canonicalStringify({ c: 3, a: 2, b: 1 });
    expect(a).toBe(b);
    expect(a).toBe('{"a":2,"b":1,"c":3}');
  });

  it("tri en code-unit UTF-16 (majuscules avant minuscules)", () => {
    expect(canonicalStringify({ a: 1, B: 2, A: 3 })).toBe('{"A":3,"B":2,"a":1}');
  });

  it("clés à valeur undefined filtrées (jamais de null de substitution)", () => {
    expect(canonicalStringify({ a: 1, b: undefined, c: 2 })).toBe('{"a":1,"c":2}');
  });
});

describe("canonicalStringify — nombres", () => {
  it("-0 et 0 produisent des octets identiques", () => {
    expect(canonicalStringify(-0)).toBe("0");
    expect(canonicalStringify(0)).toBe("0");
    expect(canonicalBytes(-0)).toEqual(canonicalBytes(0));
    expect(canonicalStringify({ x: -0 })).toBe(canonicalStringify({ x: 0 }));
  });

  it("entiers sûrs émis sans décimale ni notation scientifique", () => {
    expect(canonicalStringify(9007199254740991)).toBe("9007199254740991");
    expect(canonicalStringify(-42)).toBe("-42");
    expect(canonicalStringify(1000)).toBe("1000");
  });

  it("un flottant lève NonCanonicalNumberError", () => {
    expect(() => canonicalStringify(1.5)).toThrow(NonCanonicalNumberError);
    expect(() => canonicalStringify({ x: 0.1 })).toThrow(NonCanonicalNumberError);
  });

  it("NaN et Infinity lèvent", () => {
    expect(() => canonicalStringify(NaN)).toThrow(NonCanonicalNumberError);
    expect(() => canonicalStringify(Infinity)).toThrow(NonCanonicalNumberError);
    expect(() => canonicalStringify(-Infinity)).toThrow(NonCanonicalNumberError);
  });

  it("un entier non sûr lève", () => {
    expect(() => canonicalStringify(9007199254740992)).toThrow(NonCanonicalNumberError);
    expect(() => canonicalStringify(Number.MAX_VALUE)).toThrow(NonCanonicalNumberError);
  });
});

describe("canonicalStringify — valeurs non canoniques", () => {
  it("undefined, fonction, symbole, bigint lèvent NonCanonicalValueError", () => {
    expect(() => canonicalStringify(undefined)).toThrow(NonCanonicalValueError);
    expect(() => canonicalStringify(() => 0)).toThrow(NonCanonicalValueError);
    expect(() => canonicalStringify(Symbol("s"))).toThrow(NonCanonicalValueError);
    expect(() => canonicalStringify(10n)).toThrow(NonCanonicalValueError);
  });

  it("porte le type fautif", () => {
    try {
      canonicalStringify(10n);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(NonCanonicalValueError);
      expect((e as NonCanonicalValueError).valueType).toBe("bigint");
    }
  });
});

describe("canonicalStringify — tableaux et primitives", () => {
  it("les tableaux ne sont jamais réordonnés", () => {
    expect(canonicalStringify([3, 1, 2])).toBe("[3,1,2]");
    expect(canonicalStringify(["b", "a", "c"])).toBe('["b","a","c"]');
  });

  it("null et booléens", () => {
    expect(canonicalStringify(null)).toBe("null");
    expect(canonicalStringify(true)).toBe("true");
    expect(canonicalStringify(false)).toBe("false");
  });

  it("chaînes échappées via JSON.stringify", () => {
    expect(canonicalStringify('a"b\\c')).toBe('"a\\"b\\\\c"');
    expect(canonicalStringify("ligne1\nligne2")).toBe('"ligne1\\nligne2"');
  });
});

describe("canonicalStringify — forme du fichier (contrat §6.2)", () => {
  it("minifié, sans blanc insignifiant, sans saut de ligne final", () => {
    const world = {
      manifest: { schemaVersion: 0, layoutVersion: 0 },
      nodes: [
        { id: "n_b", depth: 1 },
        { id: "n_a", depth: 0 },
      ],
    };
    const out = canonicalStringify(world);
    expect(out).toBe(
      '{"manifest":{"layoutVersion":0,"schemaVersion":0},' +
        '"nodes":[{"depth":1,"id":"n_b"},{"depth":0,"id":"n_a"}]}',
    );
    expect(out).not.toContain("\n");
    expect(out).not.toContain(" ");
    expect(out.endsWith("\n")).toBe(false);
  });

  it("canonicalBytes encode en UTF-8 sans BOM", () => {
    const bytes = canonicalBytes("é");
    // Pas de BOM EF BB BF ; "é" en UTF-8 = C3 A9, entouré des guillemets 0x22.
    expect(Array.from(bytes)).toEqual([0x22, 0xc3, 0xa9, 0x22]);
  });
});

describe("hashWorld — empreinte octet FR-026 (contrat §10.3)", () => {
  it("= sha256Hex(canonicalBytes) et insensible à l'ordre des clés d'entrée", () => {
    const a = { b: 1, a: [3, 2, 1], c: { y: 0, x: 0 } };
    const b = { c: { x: 0, y: 0 }, a: [3, 2, 1], b: 1 };
    expect(hashWorld(a)).toBe(sha256Hex(canonicalBytes(a)));
    // Même contenu, ordre d'insertion différent → même empreinte.
    expect(hashWorld(a)).toBe(hashWorld(b));
    // Un tableau réordonné (le producteur ne trie pas ici) → empreinte différente.
    expect(hashWorld(a)).not.toBe(hashWorld({ ...a, a: [1, 2, 3] }));
  });
});
