/**
 * Tests du sidecar de provenance (§10.4) : forme du contenu avec horloge/hôte injectés
 * (déterministe), et écriture sur disque. La provenance est HORS FR-026 : ces tests ne
 * comparent jamais d'octets à un instantané figé, ils vérifient la forme.
 */

import { afterEach, beforeEach, describe, it, expect } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildProvenance, writeProvenance, PROVENANCE_FILENAME } from "./provenance.js";
import { ANALYZER_VERSION } from "./version.js";

describe("buildProvenance", () => {
  it("assemble buildAt/host/analyzerVersion/durationsMs/artifactSha256", () => {
    const p = buildProvenance({
      durationsMs: { inventory: 12, layout: 30 },
      artifactSha256: "a".repeat(64),
      now: () => new Date("2026-07-10T12:00:00Z"),
      host: "poste-test",
    });
    expect(p).toEqual({
      buildAt: "2026-07-10T12:00:00.000Z",
      host: "poste-test",
      analyzerVersion: ANALYZER_VERSION,
      durationsMs: { inventory: 12, layout: 30 },
      artifactSha256: "a".repeat(64),
    });
  });
});

describe("writeProvenance", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "cwx-prov-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("écrit world.build.json lisible et relisible", async () => {
    const p = buildProvenance({
      durationsMs: { write: 3 },
      artifactSha256: "b".repeat(64),
      now: () => new Date("2026-01-01T00:00:00Z"),
      host: "h",
    });
    const path = await writeProvenance(dir, p);
    expect(path.endsWith(PROVENANCE_FILENAME)).toBe(true);
    const text = await readFile(join(dir, PROVENANCE_FILENAME), "utf8");
    expect(JSON.parse(text)).toEqual(p);
    expect(text.endsWith("\n")).toBe(true);
  });
});
