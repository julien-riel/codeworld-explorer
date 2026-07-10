/**
 * BUDGETS de rendu explicites PAR ZONE (PRD §9.5, §16.1). Le budget de rendu est une
 * contrainte de conception : aucune zone (salle courante + voisines montées) ne doit
 * dépasser un plafond de draw calls, d'`InstancedMesh`, d'instances visibles ou de
 * triangles. `checkBudgets` vérifie un monde entier zone par zone et échoue au premier
 * dépassement — c'est le test de performance sur le corpus de référence.
 *
 * Calibrage v0 (pic mesuré sur le corpus, cf. `worldRenderStats`) :
 *   schema  draw 66  · instMesh 5 · instances 43  · triangles 1184
 *   self    draw 148 · instMesh 6 · instances 43  · triangles 1836
 *   zod     draw 190 · instMesh 7 · instances 253 · triangles 4548
 * Les plafonds gardent une marge (~2–5×) au-dessus du pire cas : ils laissent respirer
 * des dépôts plus denses tout en rejetant une régression grossière (zone non déchargée,
 * objets non instanciés, thème explosant le vocabulaire de formes).
 */

import type { World } from "@codeworld/world-schema";
import { worldRenderStats, type ZoneRenderStats } from "./staticCounts";

/** Plafonds de rendu par zone. Tous inclusifs : `actual <= max` est conforme. */
export interface RenderBudgets {
  /** Draw calls max (meshes de décor + `InstancedMesh`). */
  maxDrawCalls: number;
  /** `InstancedMesh` max = couples `(theme, kind)` visibles. Borne structurelle : 7 thèmes × 7 kinds. */
  maxInstancedMeshes: number;
  /** Instances d'objets fichiers visibles max. */
  maxInstances: number;
  /** Triangles max (décor + objets). */
  maxTriangles: number;
}

/**
 * Budgets v0 du produit. Plafonds ronds au-dessus du pic du corpus, pensés comme
 * cibles de conception (PRD §9.5) et non comme mesures serrées.
 */
export const DEFAULT_BUDGETS: RenderBudgets = {
  maxDrawCalls: 500,
  maxInstancedMeshes: 24,
  maxInstances: 1000,
  maxTriangles: 25000,
};

/** Métrique de budget faisant l'objet d'un contrôle. */
export type BudgetMetric = "drawCalls" | "instancedMeshes" | "instances" | "triangles";

/** Dépassement d'un budget par une zone précise. */
export interface BudgetViolation {
  metric: BudgetMetric;
  /** Salle courante de la zone fautive (`s_…`). */
  spatialNodeId: string;
  /** Valeur mesurée dans la zone. */
  actual: number;
  /** Plafond dépassé. */
  budget: number;
  /** Message lisible (français) pour un rapport de test. */
  message: string;
}

/** Rapport de contrôle de budget d'un monde entier. */
export interface BudgetReport {
  /** `true` si aucune zone ne dépasse aucun budget. */
  ok: boolean;
  /** Toutes les violations trouvées (une par métrique et par zone fautive). */
  violations: BudgetViolation[];
}

/** Table métrique → (accès à la valeur de zone, plafond). */
const METRICS: ReadonlyArray<{
  metric: BudgetMetric;
  read: (z: ZoneRenderStats) => number;
  cap: (b: RenderBudgets) => number;
}> = [
  { metric: "drawCalls", read: (z) => z.drawCallCount, cap: (b) => b.maxDrawCalls },
  { metric: "instancedMeshes", read: (z) => z.instancedMeshCount, cap: (b) => b.maxInstancedMeshes },
  { metric: "instances", read: (z) => z.instanceCount, cap: (b) => b.maxInstances },
  { metric: "triangles", read: (z) => z.triangleCount, cap: (b) => b.maxTriangles },
];

/**
 * Vérifie qu'AUCUNE zone d'un monde ne dépasse les budgets. Parcourt la zone active de
 * chaque salle (le joueur peut se tenir dans n'importe laquelle) et signale, par
 * métrique, la zone la plus lourde qui dépasse son plafond. Fonction PURE.
 */
export function checkBudgets(world: World, budgets: RenderBudgets = DEFAULT_BUDGETS): BudgetReport {
  const { zones } = worldRenderStats(world);
  const violations: BudgetViolation[] = [];

  for (const { metric, read, cap } of METRICS) {
    const budget = cap(budgets);
    // Zone la plus lourde pour cette métrique.
    let worst: ZoneRenderStats | null = null;
    for (const zone of zones) {
      if (worst === null || read(zone) > read(worst)) worst = zone;
    }
    if (worst !== null && read(worst) > budget) {
      const actual = read(worst);
      violations.push({
        metric,
        spatialNodeId: worst.currentSpatialNodeId,
        actual,
        budget,
        message: `Zone ${worst.currentSpatialNodeId} : ${metric} = ${String(actual)} > budget ${String(budget)}.`,
      });
    }
  }

  return { ok: violations.length === 0, violations };
}

/** Lève une erreur détaillée si un monde dépasse un budget (pratique en test/CI). */
export function assertBudgets(world: World, budgets: RenderBudgets = DEFAULT_BUDGETS): void {
  const report = checkBudgets(world, budgets);
  if (!report.ok) {
    throw new Error(
      `Budgets de rendu dépassés :\n${report.violations.map((v) => `  - ${v.message}`).join("\n")}`,
    );
  }
}
