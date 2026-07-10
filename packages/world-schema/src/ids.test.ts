import { describe, it, expect } from "vitest";
import {
  normalizePath,
  idHash,
  nodeId,
  spatialNodeId,
  portalId,
  symbolId,
  DEFAULT_ID_HASH_LENGTH,
} from "./ids.js";

describe("normalizePath (contrat §4.1)", () => {
  it("racine = chaîne vide", () => {
    expect(normalizePath("")).toBe("");
    expect(normalizePath("/")).toBe("");
    expect(normalizePath("./")).toBe("");
  });

  it("séparateurs POSIX et suppression du ./ initial et des / finaux", () => {
    expect(normalizePath("src\\util\\a.ts")).toBe("src/util/a.ts");
    expect(normalizePath("./src/index.ts")).toBe("src/index.ts");
    expect(normalizePath("src/index.ts/")).toBe("src/index.ts");
    expect(normalizePath("src/dir///")).toBe("src/dir");
  });

  it("préserve la casse et applique NFC", () => {
    expect(normalizePath("SRC/File.TS")).toBe("SRC/File.TS");
    // "é" décomposé (U+0065 U+0301) → NFC composé (U+00E9).
    const decomposed = "café/x.ts";
    expect(normalizePath(decomposed)).toBe("café/x.ts");
  });
});

describe("idHash (contrat §4.2, §4.3)", () => {
  it("longueur exacte = idHashLength, alphabet base32 minuscule", () => {
    for (const n of [8, 12, 16, 24, 32]) {
      const h = idHash("src/index.ts", n);
      expect(h.length).toBe(n);
      expect(h).toMatch(/^[a-z2-7]+$/);
    }
  });

  it("valeurs stables (référence figée)", () => {
    expect(idHash("")).toBe("4oymiquy7qobjgx3");
    expect(idHash("", 8)).toBe("4oymiquy");
    expect(idHash("", 32)).toBe("4oymiquy7qobjgx36tejs35zeqt24qpe");
    // Le préfixe le plus court est un préfixe des plus longs (même découpe).
    expect(idHash("", 32).startsWith(idHash("", 16))).toBe(true);
    expect(idHash("", 16).startsWith(idHash("", 8))).toBe(true);
  });

  it("longueur par défaut = 16", () => {
    expect(DEFAULT_ID_HASH_LENGTH).toBe(16);
    expect(idHash("anything").length).toBe(16);
  });

  it("lève RangeError hors de [8, 32]", () => {
    expect(() => idHash("x", 7)).toThrow(RangeError);
    expect(() => idHash("x", 33)).toThrow(RangeError);
    expect(() => idHash("x", 0)).toThrow(RangeError);
    expect(() => idHash("x", -1)).toThrow(RangeError);
    expect(() => idHash("x", 16.5)).toThrow(RangeError);
    // Bornes incluses : ne lèvent pas.
    expect(() => idHash("x", 8)).not.toThrow();
    expect(() => idHash("x", 32)).not.toThrow();
  });
});

describe("dérivation des identifiants", () => {
  it("nodeId : préfixe n_, formule unique (racine incluse, sans identifiant magique)", () => {
    expect(nodeId("")).toBe("n_4oymiquy7qobjgx3");
    expect(nodeId("src/index.ts")).toBe("n_ukqxcre5qyx6ffus");
    // nodeId normalise son argument.
    expect(nodeId("./src/index.ts/")).toBe(nodeId("src/index.ts"));
    expect(nodeId("src\\index.ts")).toBe(nodeId("src/index.ts"));
  });

  it("respecte la borne Zod /^n_[a-z2-7]{8,32}$/", () => {
    const re = /^n_[a-z2-7]{8,32}$/;
    expect(nodeId("")).toMatch(re);
    expect(nodeId("a/b/c", 8)).toMatch(re);
    expect(nodeId("a/b/c", 32)).toMatch(re);
  });

  it("spatialNodeId : préfixe s_, dépend de (sourceNodeId, role, page)", () => {
    expect(spatialNodeId("n_" + idHash("src"), "primary", 0)).toBe("s_vphyfwszpnxko4e5");
    expect(spatialNodeId("n_x", "primary", 0)).not.toBe(spatialNodeId("n_x", "annex", 0));
    expect(spatialNodeId("n_x", "annex", 1)).not.toBe(spatialNodeId("n_x", "annex", 2));
  });

  it("portalId : préfixe p_, orienté (from→to)", () => {
    expect(portalId("s_AAA", "s_BBB", "door")).toBe("p_j7lm5vpje26zvgoh");
    expect(portalId("s_AAA", "s_BBB", "door")).not.toBe(portalId("s_BBB", "s_AAA", "door"));
    expect(portalId("s_AAA", "s_BBB", "door")).not.toBe(portalId("s_AAA", "s_BBB", "stair"));
  });

  it("symbolId : préfixe y_, formule (sourceNodeId|qualifiedName|symbolType)", () => {
    const nid = nodeId("src/index.ts");
    // Fidèle à la formule : aucun id forgé hors `y_ + idHash(clé composite)`.
    expect(symbolId(nid, "parseWorld", "function")).toBe("y_" + idHash(`${nid}|parseWorld|function`));
    expect(symbolId(nid, "parseWorld", "function")).toMatch(/^y_[a-z2-7]{8,32}$/);
  });

  it("symbolId : dépend de chaque composante (fusions de déclarations distinguées)", () => {
    const nid = nodeId("src/index.ts");
    const other = nodeId("src/other.ts");
    // Même nom, types différents (interface Foo vs const Foo) → id différents.
    expect(symbolId(nid, "Foo", "interface")).not.toBe(symbolId(nid, "Foo", "variable"));
    // Même nom+type, fichiers différents → id différents.
    expect(symbolId(nid, "Foo", "class")).not.toBe(symbolId(other, "Foo", "class"));
    // Noms différents → id différents.
    expect(symbolId(nid, "Foo", "class")).not.toBe(symbolId(nid, "Bar", "class"));
  });

  it("symbolId : respecte la borne configurable [8, 32] et lève hors plage", () => {
    const nid = nodeId("a.ts");
    expect(symbolId(nid, "x", "function", 8)).toMatch(/^y_[a-z2-7]{8}$/);
    expect(symbolId(nid, "x", "function", 32)).toMatch(/^y_[a-z2-7]{32}$/);
    expect(() => symbolId(nid, "x", "function", 7)).toThrow(RangeError);
  });
});
