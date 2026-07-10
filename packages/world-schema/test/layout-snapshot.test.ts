/**
 * Suite 1 — SNAPSHOT du layout sur chaque fixture. Le snapshot est la CHAÎNE
 * canonique (`canonicalStringify`) du `WorldLayout` produit : c'est exactement la
 * portion des octets de `world.json` couverte par FR-026 pour la géométrie.
 *
 * Les snapshots sont écrits sur disque (un fichier par fixture, sous
 * `__snapshots__/`), committables, et servent de tests de régression du layout
 * déterministe (PRD §16.4, §31.3). `vitest run` échoue si un octet change sans mise
 * à jour explicite du snapshot ; il ne le régénère jamais silencieusement.
 */

import { describe, it, expect } from "vitest";
import { canonicalStringify } from "../src/index";
import { FIXTURES, layoutOf } from "./fixtures";

describe("Snapshot du layout canonique (régression déterministe)", () => {
  for (const fx of FIXTURES) {
    it(`${fx.name} : layout stable octet pour octet`, async () => {
      const canonical = canonicalStringify(layoutOf(fx));
      await expect(canonical).toMatchFileSnapshot(`./__snapshots__/layout-${fx.name}.json`);
    });
  }
});
