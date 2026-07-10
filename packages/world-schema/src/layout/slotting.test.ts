import { describe, it, expect } from "vitest";
import { hash32, slotInto } from "./slotting.js";
import { mod } from "../integer.js";

const SEED = "cwe-v0";

function compareCodeUnit(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Chemins candidats déterministes (uniques). */
function candidatePaths(n: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(`src/module-${i}/index.ts`);
  return out;
}

/** Sélectionne `count` chemins dont les créneaux d'accueil (`hash32 mod m`) sont deux à deux distincts. */
function distinctHomePaths(m: number, count: number): string[] {
  const chosen: string[] = [];
  const used = new Set<number>();
  for (const p of candidatePaths(2000)) {
    const home = mod(hash32(SEED, p), m);
    if (!used.has(home)) {
      used.add(home);
      chosen.push(p);
      if (chosen.length === count) break;
    }
  }
  return chosen;
}

function mapEqual(a: Map<string, number>, b: Map<string, number>): boolean {
  if (a.size !== b.size) return false;
  for (const [k, v] of a) if (b.get(k) !== v) return false;
  return true;
}

describe("hash32 (§5.1)", () => {
  it("déterministe et purement fonction du (seed, path normalisé)", () => {
    expect(hash32(SEED, "src/index.ts")).toBe(hash32(SEED, "src/index.ts"));
    // normalizePath : './' initial et '/' final retirés → même hachage
    expect(hash32(SEED, "./src/index.ts")).toBe(hash32(SEED, "src/index.ts"));
    expect(hash32(SEED, "src/index.ts/")).toBe(hash32(SEED, "src/index.ts"));
  });

  it("rend un uint32 (entier non signé sûr)", () => {
    const h = hash32(SEED, "a/b/c.ts");
    expect(Number.isSafeInteger(h)).toBe(true);
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThan(0x100000000);
  });

  it("la graine sépare les espaces de hachage", () => {
    expect(hash32("cwe-v0", "x")).not.toBe(hash32("autre", "x"));
  });
});

describe("slotInto — indépendance à l'ordre d'entrée (§5.2)", () => {
  it("mélange déterministe des mêmes chemins → même affectation", () => {
    const list = candidatePaths(12);
    const m = 16;
    const forward = slotInto(list, m, SEED);
    const reversed = slotInto([...list].reverse(), m, SEED);
    // mélange sans rapport avec l'ordre des chemins : tri par valeur de hachage
    const scrambled = slotInto([...list].sort((a, b) => hash32(SEED, a) - hash32(SEED, b)), m, SEED);
    expect(mapEqual(forward, reversed)).toBe(true);
    expect(mapEqual(forward, scrambled)).toBe(true);
  });

  it("affectation injective, créneaux dans [0, m)", () => {
    const list = candidatePaths(12);
    const m = 16;
    const res = slotInto(list, m, SEED);
    const vals = [...res.values()];
    expect(new Set(vals).size).toBe(vals.length); // deux chemins ne partagent jamais un créneau
    for (const v of vals) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(m);
    }
  });
});

describe("slotInto — sondage et stabilité (§5.2, §5.4, ADR-0003)", () => {
  it("en collision, le plus petit chemin garde son créneau ; le plus grand sonde à +1", () => {
    const m = 8;
    const groups = new Map<number, string[]>();
    for (const p of candidatePaths(600)) {
      const home = mod(hash32(SEED, p), m);
      const g = groups.get(home) ?? [];
      g.push(p);
      groups.set(home, g);
    }
    let colliders: string[] | undefined;
    let home = -1;
    for (const [h, g] of groups) {
      if (g.length >= 2) {
        colliders = [...g].sort(compareCodeUnit);
        home = h;
        break;
      }
    }
    if (colliders === undefined) throw new Error("fixture : aucune collision trouvée");
    const [small, large] = colliders;
    if (small === undefined || large === undefined) throw new Error("fixture incohérente");

    const res = slotInto([small, large], m, SEED);
    expect(res.get(small)).toBe(home); // l'occupant en place ne bouge pas
    expect(res.get(large)).toBe(mod(home + 1, m)); // le nouveau venu sonde
  });

  it("ajouter un chemin (créneau d'accueil libre) ne déplace aucun occupant existant", () => {
    const m = 32;
    const nine = distinctHomePaths(m, 9); // créneaux d'accueil deux à deux distincts
    expect(nine.length).toBe(9);
    const extra = nine[8];
    if (extra === undefined) throw new Error("fixture incomplète");
    const base = nine.slice(0, 8);

    const before = slotInto(base, m, SEED);
    // sans collision, chaque chemin occupe exactement son créneau d'accueil
    for (const p of base) expect(before.get(p)).toBe(mod(hash32(SEED, p), m));

    const after = slotInto(nine, m, SEED);
    for (const p of base) expect(after.get(p)).toBe(before.get(p)); // aucun déplacement
    expect(after.get(extra)).toBe(mod(hash32(SEED, extra), m)); // le nouveau prend son créneau
  });

  it("retirer puis re-slotter redonne exactement l'affectation d'origine (déterminisme)", () => {
    const m = 32;
    const base = distinctHomePaths(m, 8);
    const first = slotInto(base, m, SEED);
    const second = slotInto([...base].reverse(), m, SEED);
    expect(mapEqual(first, second)).toBe(true);
  });

  it("lève si |paths| > m (le sondage ne terminerait pas)", () => {
    expect(() => slotInto(["a", "b", "c"], 2, SEED)).toThrow(RangeError);
  });

  it("m == |paths| : remplit exactement tous les créneaux", () => {
    const m = 8;
    const list = candidatePaths(8);
    const res = slotInto(list, m, SEED);
    expect(new Set(res.values()).size).toBe(8); // les 8 créneaux couverts
  });
});
