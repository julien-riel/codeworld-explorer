/**
 * Harnais de mesure hors-ligne applicable à PLUSIEURS mondes (PRD §9.5, §16.1). Il
 * mesure les compteurs statiques par zone et vérifie les budgets, SANS aucun GL — donc
 * intégrable en test (corpus de référence) ou derrière une route de debug.
 *
 * Découplé du chargement disque : il reçoit des mondes déjà parsés (voir
 * `corpusWorlds.ts` pour la variante node/fs de test). Fonctions PURES.
 */

import type { World } from "@codeworld/world-schema";
import {
  checkBudgets,
  DEFAULT_BUDGETS,
  type BudgetReport,
  type RenderBudgets,
} from "./budgets";
import { worldRenderStats, type PeakRenderStats } from "./staticCounts";

/** Un monde nommé à mesurer. */
export interface NamedWorld {
  name: string;
  world: World;
}

/** Rapport de mesure d'un monde : pic de charge + contrôle de budget. */
export interface WorldMeasurement {
  name: string;
  peak: PeakRenderStats;
  report: BudgetReport;
}

/** Mesure une liste de mondes nommés et contrôle chacun contre les budgets. */
export function measureWorlds(
  worlds: readonly NamedWorld[],
  budgets: RenderBudgets = DEFAULT_BUDGETS,
): WorldMeasurement[] {
  return worlds.map(({ name, world }) => ({
    name,
    peak: worldRenderStats(world).peak,
    report: checkBudgets(world, budgets),
  }));
}

/** `true` si tous les mondes mesurés respectent leurs budgets. */
export function allWithinBudget(measurements: readonly WorldMeasurement[]): boolean {
  return measurements.every((m) => m.report.ok);
}

/** Rend un rapport lisible (une ligne par monde) pour un affichage console/debug. */
export function formatMeasurements(measurements: readonly WorldMeasurement[]): string {
  return measurements
    .map((m) => {
      const p = m.peak;
      const status = m.report.ok ? "OK " : "DÉPASSÉ";
      return `${status} ${m.name.padEnd(8)} draw=${String(p.drawCallCount)} instMesh=${String(p.instancedMeshCount)} instances=${String(p.instanceCount)} triangles=${String(p.triangleCount)}`;
    })
    .join("\n");
}
