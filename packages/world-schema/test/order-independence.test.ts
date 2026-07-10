/**
 * Suite 3 — INDÉPENDANCE À L'ORDRE. Mélanger de façon déterministe l'ordre des
 * enfants (`childDirs`) et des fichiers (`files`) en entrée ne change PAS la chaîne
 * canonique de sortie : le layout retrie tout par `path` avant placement
 * (layout-engine-v0 §1.1, §5.2), seule cause d'indépendance à l'ordre d'entrée.
 *
 * On compare des CHAÎNES canoniques, pas des objets (contrat §10.2).
 */

import { describe, it, expect } from "vitest";
import { computeLayout, canonicalStringify, mulberry32 } from "../src/index";
import type { LayoutDir, LayoutTree } from "../src/index";
import { FIXTURES, SEED, OPTIONS } from "./fixtures";

/** Lecture bornée sûre (satisfait `noUncheckedIndexedAccess`). */
function at<T>(xs: readonly T[], i: number): T {
  const v = xs[i];
  if (v === undefined) throw new Error(`index ${String(i)} hors bornes`);
  return v;
}

/** Fisher-Yates déterministe piloté par un `mulberry32` (uint32). */
function shuffle<T>(xs: readonly T[], next: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = next() % (i + 1);
    const tmp = at(a, i);
    a[i] = at(a, j);
    a[j] = tmp;
  }
  return a;
}

/** Mélange RÉCURSIF de `childDirs` et `files` ; `id`/`path`/`depth` inchangés. */
function shuffleDir(d: LayoutDir, next: () => number): LayoutDir {
  const childDirs = shuffle(d.childDirs, next).map((c) => shuffleDir(c, next));
  const files = shuffle(d.files, next);
  return { ...d, childDirs, files };
}

describe("Indépendance à l'ordre : un mélange des entrées ne change pas la sortie", () => {
  for (const fx of FIXTURES) {
    it(`${fx.name} : sortie canonique invariante par permutation des entrées`, () => {
      const reference = canonicalStringify(
        computeLayout(fx.tree, fx.classifications, SEED, OPTIONS),
      );

      // Deux graines de mélange distinctes : deux permutations différentes,
      // toutes deux censées reproduire la même sortie canonique.
      for (const shuffleSeed of [0x1234_5678, 0x2b2b_2b2b, 0x0000_0001]) {
        const shuffled: LayoutTree = { root: shuffleDir(fx.tree.root, mulberry32(shuffleSeed)) };
        const got = canonicalStringify(computeLayout(shuffled, fx.classifications, SEED, OPTIONS));
        expect(got, `permutation ${String(shuffleSeed)} de ${fx.name}`).toBe(reference);
      }
    });
  }
});
