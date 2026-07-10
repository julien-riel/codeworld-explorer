/**
 * Tests du journal de progression : chronométrage par horloge injectée (déterministe),
 * suivi de l'étape courante pour l'attribution d'erreur, durées agrégées, et neutralité
 * du reporter muet.
 */

import { describe, it, expect } from "vitest";
import { NOOP_REPORTER, RecordingReporter } from "./progress.js";

/** Horloge factice avançant d'un pas fixe à chaque lecture. */
function fakeClock(steps: number[]): () => number {
  let i = 0;
  return () => steps[Math.min(i++, steps.length - 1)] ?? 0;
}

describe("RecordingReporter", () => {
  it("chronomètre chaque étape (fin − début) et agrège les durées", () => {
    // start inventory @0, done @10 ; start layout @10, done @35.
    const reporter = new RecordingReporter({ clock: fakeClock([0, 10, 10, 35]) });
    reporter.start("inventory");
    reporter.done("inventory");
    reporter.start("layout");
    reporter.done("layout");
    expect(reporter.durationsMs()).toEqual({ inventory: 10, layout: 25 });
    expect(reporter.getTimings()).toEqual([
      { step: "inventory", durationMs: 10 },
      { step: "layout", durationMs: 25 },
    ]);
  });

  it("expose l'étape courante entre start et done (attribution d'erreur)", () => {
    const reporter = new RecordingReporter();
    expect(reporter.currentStep).toBeUndefined();
    reporter.start("clone");
    expect(reporter.currentStep).toBe("clone");
    reporter.done("clone");
    expect(reporter.currentStep).toBeUndefined();
  });

  it("écrit une ligne par début et par fin sur le puits fourni", () => {
    const lines: string[] = [];
    const reporter = new RecordingReporter({ sink: (l) => lines.push(l), clock: fakeClock([0, 5]) });
    reporter.start("inventory");
    reporter.done("inventory", "12 nœuds");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("inventaire");
    expect(lines[1]).toContain("5 ms");
    expect(lines[1]).toContain("12 nœuds");
  });
});

describe("NOOP_REPORTER", () => {
  it("ne fait rien et n'interroge aucune horloge", () => {
    expect(() => {
      NOOP_REPORTER.start("inventory");
      NOOP_REPORTER.done("inventory");
    }).not.toThrow();
  });
});
