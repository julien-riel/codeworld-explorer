/**
 * Suite 7 — FR-005 / COUVERTURE. Sur le layout de chaque fixture :
 *   - exactement UN `SpatialNode` de rôle `hall|primary` par dossier non exclu, le
 *     `hall` étant réservé à la racine (contrat §3.7.1, FR-005) ;
 *   - BIJECTION entre les fichiers non exclus et les `FileObject`, toutes pages
 *     confondues (contrat §3.7.4).
 *
 * Les ensembles de référence sont RE-DÉRIVÉS de l'arbre d'entrée, indépendamment
 * de la garde interne du moteur.
 */

import { describe, it, expect } from "vitest";
import type { LayoutDir } from "../src/index";
import { FIXTURES, layoutOf } from "./fixtures";

interface TreeIndex {
  readonly dirIds: readonly string[];
  readonly fileIds: readonly string[];
  readonly rootId: string;
}

function indexTree(root: LayoutDir): TreeIndex {
  const dirIds: string[] = [];
  const fileIds: string[] = [];
  const walk = (d: LayoutDir): void => {
    dirIds.push(d.id);
    for (const f of d.files) fileIds.push(f.id);
    for (const c of d.childDirs) walk(c);
  };
  walk(root);
  return { dirIds, fileIds, rootId: root.id };
}

describe("FR-005 : une salle identité par dossier ; bijection fichiers ↔ objets", () => {
  for (const fx of FIXTURES) {
    it(`${fx.name} : cardinalité des salles et couverture des fichiers`, () => {
      const layout = layoutOf(fx);
      const { dirIds, fileIds, rootId } = indexTree(fx.tree.root);

      // ── Exactement un hall|primary par dossier ──
      const identityByDir = new Map<string, number>();
      let hallCount = 0;
      for (const n of layout.spatialNodes) {
        if (n.role === "hall" || n.role === "primary") {
          identityByDir.set(n.sourceNodeId, (identityByDir.get(n.sourceNodeId) ?? 0) + 1);
        }
        if (n.role === "hall") {
          hallCount++;
          expect(n.sourceNodeId, "le hall est réservé à la racine").toBe(rootId);
        }
      }
      expect(hallCount, "exactement un hall (la racine)").toBe(1);
      for (const dirId of dirIds) {
        expect(identityByDir.get(dirId), `dossier ${dirId} : salles hall|primary`).toBe(1);
      }
      // Aucune salle identité orpheline (sourceNodeId hors des dossiers de l'arbre).
      expect(identityByDir.size, "nombre de dossiers porteurs d'identité").toBe(dirIds.length);

      // ── Bijection fichiers non exclus ↔ FileObject ──
      const placed: string[] = [];
      for (const n of layout.spatialNodes) for (const o of n.objects) placed.push(o.sourceNodeId);
      const placedSet = new Set(placed);
      expect(placed.length, "aucun fichier placé en double").toBe(placedSet.size);
      expect(placedSet.size, "cardinalité fichiers = objets").toBe(fileIds.length);
      for (const fid of fileIds) {
        expect(placedSet.has(fid), `fichier ${fid} sans FileObject`).toBe(true);
      }
    });
  }
});
