import { describe, expect, it } from "vitest";
import { registerProceduralKits } from "../theme/register";
import { loadCorpus, loadCorpusWorld } from "./corpusWorlds";
import {
  assertBudgets,
  checkBudgets,
  DEFAULT_BUDGETS,
  type RenderBudgets,
} from "./budgets";
import { allWithinBudget, measureWorlds } from "./harness";
import { worldRenderStats } from "./staticCounts";

// Les budgets v0 sont calibrés sur le rendu procédural : on l'active.
registerProceduralKits();

const corpus = loadCorpus();

describe("checkBudgets sur le corpus de référence", () => {
  it.each(corpus.map((c) => c.name))("le monde `%s` respecte tous les budgets", (name) => {
    const entry = corpus.find((c) => c.name === name);
    expect(entry).toBeDefined();
    if (entry === undefined) return;
    const report = checkBudgets(entry.world);
    expect(report.violations).toEqual([]);
    expect(report.ok).toBe(true);
    expect(() => {
      assertBudgets(entry.world);
    }).not.toThrow();
  });

  it("chaque pic de zone reste sous le plafond correspondant", () => {
    for (const { world } of corpus) {
      const { peak } = worldRenderStats(world);
      expect(peak.drawCallCount).toBeLessThanOrEqual(DEFAULT_BUDGETS.maxDrawCalls);
      expect(peak.instancedMeshCount).toBeLessThanOrEqual(DEFAULT_BUDGETS.maxInstancedMeshes);
      expect(peak.instanceCount).toBeLessThanOrEqual(DEFAULT_BUDGETS.maxInstances);
      expect(peak.triangleCount).toBeLessThanOrEqual(DEFAULT_BUDGETS.maxTriangles);
    }
  });

  it("mesure tout le corpus comme conforme", () => {
    const measurements = measureWorlds(corpus);
    expect(measurements.map((m) => m.name)).toEqual(["schema", "self", "zod"]);
    expect(allWithinBudget(measurements)).toBe(true);
  });
});

describe("checkBudgets rejette un dépassement", () => {
  it("un monde synthétique aux instances gonflées dépasse le budget d'instances", () => {
    // On clone un monde réel et on sature une salle d'objets (zone non instanciable).
    const world = structuredClone(loadCorpusWorld("schema"));
    const room = world.layout.spatialNodes.find((n) => n.objects.length > 0);
    expect(room).toBeDefined();
    if (room === undefined) return;

    const template = room.objects[0];
    if (template === undefined) return;
    const bloated = DEFAULT_BUDGETS.maxInstances + 200;
    room.objects = Array.from({ length: bloated }, () => structuredClone(template));

    const report = checkBudgets(world);
    expect(report.ok).toBe(false);
    const instanceViolation = report.violations.find((v) => v.metric === "instances");
    expect(instanceViolation).toBeDefined();
    // La zone fautive est celle de la salle gonflée OU d'une voisine (une zone couvre
    // salle courante + voisines) : dans tous les cas, elle dépasse le budget d'instances.
    expect(instanceViolation?.actual).toBeGreaterThan(DEFAULT_BUDGETS.maxInstances);
    expect(instanceViolation?.actual).toBeGreaterThanOrEqual(bloated);
    expect(() => {
      assertBudgets(world);
    }).toThrow(/instances/);
  });

  it("un budget serré rejette même le corpus (contrôle du sens de la comparaison)", () => {
    const tight: RenderBudgets = {
      maxDrawCalls: 1,
      maxInstancedMeshes: 1,
      maxInstances: 1,
      maxTriangles: 1,
    };
    const report = checkBudgets(loadCorpusWorld("zod"), tight);
    expect(report.ok).toBe(false);
    // Les quatre métriques dépassent un budget de 1.
    expect(new Set(report.violations.map((v) => v.metric))).toEqual(
      new Set(["drawCalls", "instancedMeshes", "instances", "triangles"]),
    );
  });

  it("un budget très large accepte tout", () => {
    const loose: RenderBudgets = {
      maxDrawCalls: 1e6,
      maxInstancedMeshes: 1e6,
      maxInstances: 1e6,
      maxTriangles: 1e9,
    };
    for (const { world } of corpus) {
      expect(checkBudgets(world, loose).ok).toBe(true);
    }
  });
});
