/**
 * Instrumentation des budgets de rendu (PRD §9.5, §16.1). Surface publique du module
 * `perf` : moniteur en direct (sonde de scène + overlay 2D), harnais de mesure
 * hors-ligne et budgets. L'intégrateur monte `<PerfProbe>` DANS `<Canvas>` et
 * `<PerfOverlay>` HORS `<Canvas>` ; les tests et une éventuelle route de debug
 * appellent le harnais pur.
 */

// ── Moniteur en direct ──
export { PerfProbe } from "./PerfProbe";
export { PerfOverlay, PERF_OVERLAY_KEY } from "./PerfOverlay";
export {
  FpsMeter,
  DEFAULT_FPS_WINDOW,
  readRendererInfo,
  getPerfSample,
  commitPerfSample,
  type PerfSample,
  type RenderCounts,
  type RendererInfoLike,
} from "./monitor";

// ── Comptage statique par zone (harnais hors-ligne) ──
export {
  geometryTriangleCount,
} from "./geometry";
export {
  instanceTriangleCount,
  roomMeshStats,
  zoneRenderStats,
  worldRenderStats,
  peakRenderStats,
  type RoomMeshStats,
  type ZoneRenderStats,
  type WorldRenderStats,
  type PeakRenderStats,
} from "./staticCounts";
export {
  measureWorlds,
  allWithinBudget,
  formatMeasurements,
  type NamedWorld,
  type WorldMeasurement,
} from "./harness";

// ── Budgets ──
export {
  DEFAULT_BUDGETS,
  checkBudgets,
  assertBudgets,
  type RenderBudgets,
  type BudgetMetric,
  type BudgetViolation,
  type BudgetReport,
} from "./budgets";
