import { describe, it, expect } from "vitest";
import { hash32 } from "./fnv1a.js";

describe("hash32 (FNV-1a 32 bits)", () => {
  it("vecteurs de référence (calculés à la main : offset basis 0x811c9dc5, prime 0x01000193)", () => {
    // "" ne parcourt aucun octet → l'offset basis lui-même.
    expect(hash32("")).toBe(0x811c9dc5);
    // "a" : 0x811c9dc5 XOR 0x61 = 0x811c9da4 ; ×0x01000193 mod 2^32 = 0xe40c292c.
    expect(hash32("a")).toBe(0xe40c292c);
    // Vecteur FNV-1a classique.
    expect(hash32("foobar")).toBe(0xbf9cf968);
  });

  it("est un entier non signé 32 bits", () => {
    for (const s of ["", "a", "foobar", "codeworld", "n_αβγ/файл.ts"]) {
      const h = hash32(s);
      expect(Number.isInteger(h)).toBe(true);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThanOrEqual(0xffffffff);
      expect(h >>> 0).toBe(h); // inchangé par la conversion uint32
    }
  });

  it("est stable et sensible à l'entrée", () => {
    expect(hash32("foo")).toBe(hash32("foo"));
    expect(hash32("foo")).not.toBe(hash32("bar"));
  });
});
