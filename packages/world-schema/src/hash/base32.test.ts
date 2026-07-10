import { describe, it, expect } from "vitest";
import { base32 } from "./base32.js";
import { utf8, sha256 } from "./sha256.js";

describe("base32 — vecteurs RFC 4648 §10 (minuscule, sans padding)", () => {
  // Références RFC 4648 (majuscule, avec padding) rendues minuscules et privées
  // de leur padding, conformément au contrat §4.2.
  const cases: ReadonlyArray<readonly [string, string]> = [
    ["", ""],
    ["f", "my"], // MY======
    ["fo", "mzxq"], // MZXQ====
    ["foo", "mzxw6"], // MZXW6===
    ["foob", "mzxw6yq"], // MZXW6YQ=
    ["fooba", "mzxw6ytb"], // MZXW6YTB
    ["foobar", "mzxw6ytboi"], // MZXW6YTBOI======
  ];

  for (const [input, expected] of cases) {
    it(`"${input}" → "${expected}"`, () => {
      expect(base32(utf8(input))).toBe(expected);
    });
  }
});

describe("base32 — propriétés", () => {
  it("n'emploie que l'alphabet minuscule sans padding", () => {
    const s = base32(sha256(utf8("codeworld")));
    expect(s).toMatch(/^[a-z2-7]+$/);
    expect(s).not.toContain("=");
  });

  it("un digest de 32 octets produit 52 caractères", () => {
    expect(base32(sha256(utf8("anything"))).length).toBe(52);
  });
});
