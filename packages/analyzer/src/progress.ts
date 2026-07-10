/**
 * Journal de progression par étape (PRD §14.1 « journal de progression et rapport
 * d'erreurs par étape », §19.3).
 *
 * `ProgressReporter` est un OBSERVATEUR : le pipeline l'appelle en début/fin d'étape,
 * mais ne relit JAMAIS ses mesures pour construire l'artefact. Cette asymétrie garantit
 * que l'horloge réelle (chronométrage) n'entre pas dans `world.json` (FR-026) — elle ne
 * vit que dans le sidecar de provenance (provenance.ts, spec §10.4). Le reporter par
 * défaut est muet (`NOOP_REPORTER`) : sans reporter injecté, `analyze` reste pur et
 * silencieux, et aucun appel à `Date` n'a lieu.
 */

/** Étapes du pipeline, dans l'ordre logique de PRD §19.3 (sous-ensemble du MVP local). */
export type StepName =
  | "metadata"
  | "clone"
  | "inventory"
  | "classify"
  | "analyze-code"
  | "layout"
  | "search"
  | "guards"
  | "validate"
  | "write";

/** Libellés français des étapes, pour l'affichage du journal. */
export const STEP_LABELS: Record<StepName, string> = {
  metadata: "métadonnées GitHub",
  clone: "clone superficiel",
  inventory: "inventaire",
  classify: "classification",
  "analyze-code": "analyse statique",
  layout: "layout spatial",
  search: "index de recherche",
  guards: "gardes d'intégrité",
  validate: "validation du schéma",
  write: "écriture de l'artefact",
};

/** Reçoit les événements de début/fin d'étape (implémentations : muet, console…). */
export interface ProgressReporter {
  start(step: StepName): void;
  done(step: StepName, detail?: string): void;
}

/** Reporter muet : neutre et sans horloge. Défaut du pipeline (préserve la pureté). */
export const NOOP_REPORTER: ProgressReporter = {
  start() {
    /* rien */
  },
  done() {
    /* rien */
  },
};

/** Durée mesurée d'une étape terminée (hors FR-026, pour le sidecar de provenance). */
export interface StepTiming {
  readonly step: StepName;
  readonly durationMs: number;
}

/** Fournit l'instant courant en millisecondes (injectable pour des tests déterministes). */
export type Clock = () => number;

/**
 * Reporter qui CHRONOMÈTRE chaque étape et écrit une ligne sur un puits (stderr côté
 * CLI). Il expose les durées pour le sidecar de provenance et l'étape courante pour
 * l'attribution d'une erreur (« échec à l'étape X »). L'horloge est injectable ; par
 * défaut `Date.now` (autorisé ici : la provenance vit hors de `world.json`).
 */
export class RecordingReporter implements ProgressReporter {
  private readonly sink: (line: string) => void;
  private readonly now: Clock;
  private readonly startedAt = new Map<StepName, number>();
  private readonly timings: StepTiming[] = [];
  private current: StepName | undefined;

  constructor(options: { sink?: ((line: string) => void) | undefined; clock?: Clock | undefined } = {}) {
    this.sink = options.sink ?? (() => undefined);
    this.now = options.clock ?? Date.now;
  }

  start(step: StepName): void {
    this.current = step;
    this.startedAt.set(step, this.now());
    this.sink(`  → ${STEP_LABELS[step]}…\n`);
  }

  done(step: StepName, detail?: string): void {
    const startedAt = this.startedAt.get(step);
    const durationMs = startedAt === undefined ? 0 : this.now() - startedAt;
    this.timings.push({ step, durationMs });
    if (this.current === step) this.current = undefined;
    const suffix = detail !== undefined && detail !== "" ? ` (${detail})` : "";
    this.sink(`  ✓ ${STEP_LABELS[step]} — ${String(durationMs)} ms${suffix}\n`);
  }

  /** Étape commencée mais non terminée (la dernière avant une exception), ou `undefined`. */
  get currentStep(): StepName | undefined {
    return this.current;
  }

  /** Durées par étape terminée, dans l'ordre d'exécution (pour la provenance). */
  getTimings(): readonly StepTiming[] {
    return this.timings;
  }

  /** Durées agrégées par nom d'étape (dernière valeur si une étape se répète). */
  durationsMs(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const t of this.timings) out[t.step] = t.durationMs;
    return out;
  }
}
