/**
 * Suite 4 — INVARIANTS. `assertLayoutInvariants` (layout-engine-v0 §11, I1–I12)
 * passe sur le layout de chacune des six fixtures. Comme `computeLayout` exécute
 * déjà cette garde à l'écriture (§9.1), la simple production d'un layout est une
 * première vérification ; on la rejoue ici en défense en profondeur sur l'artefact.
 */

import { describe, it, expect } from "vitest";
import { assertLayoutInvariants } from "../src/index";
import { FIXTURES, layoutOf, OPTIONS } from "./fixtures";

describe("assertLayoutInvariants sur les six fixtures", () => {
  for (const fx of FIXTURES) {
    it(`${fx.name} : le layout satisfait I1–I12`, () => {
      const layout = layoutOf(fx);
      expect(() => {
        assertLayoutInvariants(layout, fx.tree, OPTIONS);
      }).not.toThrow();
    });
  }
});
