/**
 * Suite 2 — FR-026 (DÉTERMINISME). Deux exécutions de `computeLayout` sur la MÊME
 * entrée produisent la même CHAÎNE `canonicalStringify`. On compare des chaînes,
 * jamais des objets : une comparaison d'objets ne verrait pas une divergence
 * d'ordre de clés (contrat §10.2, §10.3 point 1).
 *
 * La graine `seed` est indépendante du commit (ADR-0003) ; à entrée et options
 * fixées, la sortie est identique octet pour octet.
 */

import { describe, it, expect } from "vitest";
import { computeLayout, canonicalStringify } from "../src/index";
import { FIXTURES, SEED, OPTIONS } from "./fixtures";

describe("FR-026 : deux exécutions produisent la même chaîne canonique", () => {
  for (const fx of FIXTURES) {
    it(`${fx.name} : run1 === run2 (octet pour octet)`, () => {
      const run1 = canonicalStringify(computeLayout(fx.tree, fx.classifications, SEED, OPTIONS));
      const run2 = canonicalStringify(computeLayout(fx.tree, fx.classifications, SEED, OPTIONS));
      expect(typeof run1).toBe("string");
      expect(run1.length).toBeGreaterThan(0);
      expect(run2).toBe(run1);
    });
  }
});
