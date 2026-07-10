/**
 * Tests du clone superficiel. Deux niveaux :
 *   - port FACTICE : vérifie la forme des arguments `git` (durcissement §22.2, profondeur
 *     1, séparateur `--`) et le rejet d'un SHA inattendu, sans `git` réel ;
 *   - port RÉEL : clone HORS-LIGNE d'un dépôt git local via `file://` (aucun réseau),
 *     preuve que la lecture du SHA, de la branche et de la committer date fonctionne.
 */

import { afterEach, beforeEach, describe, it, expect } from "vitest";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { nodeGitPort, shallowClone, type GitPort } from "./git.js";
import { GitCloneError } from "./errors.js";

const run = promisify(execFile);

describe("shallowClone — forme des arguments (port factice)", () => {
  it("clone superficiel durci, puis lit sha/branche/date", async () => {
    const calls: string[][] = [];
    const fake: GitPort = {
      run(args) {
        calls.push([...args]);
        if (args.includes("clone")) return Promise.resolve("");
        if (args.includes("--abbrev-ref")) return Promise.resolve("main");
        if (args.includes("rev-parse")) return Promise.resolve("a".repeat(40));
        if (args.includes("show")) return Promise.resolve("2026-07-09T14:32:07+02:00");
        return Promise.resolve("");
      },
    };
    const result = await shallowClone("https://github.com/o/r", "/dest", { ref: "v1", port: fake });

    expect(result).toEqual({
      dir: "/dest",
      commitSha: "a".repeat(40),
      branch: "main",
      committedAtRaw: "2026-07-09T14:32:07+02:00",
    });
    const clone = calls[0]!;
    expect(clone).toContain("--depth");
    expect(clone).toContain("--no-tags");
    expect(clone).toContain("--single-branch");
    expect(clone).toContain("--branch"); // ref fourni
    expect(clone).toContain("v1");
    // Séparateur d'options et arguments finaux dans l'ordre.
    const dashDash = clone.indexOf("--");
    expect(clone.slice(dashDash)).toEqual(["--", "https://github.com/o/r", "/dest"]);
    // Durcissement présent.
    expect(clone.join(" ")).toContain("core.hooksPath=/dev/null");
  });

  it("tête détachée (--branch tag) : la branche retombe sur la ref demandée", async () => {
    const fake: GitPort = {
      run(args) {
        if (args.includes("clone")) return Promise.resolve("");
        if (args.includes("--abbrev-ref")) return Promise.resolve("HEAD"); // détaché
        if (args.includes("rev-parse")) return Promise.resolve("b".repeat(40));
        if (args.includes("show")) return Promise.resolve("2026-01-01T00:00:00Z");
        return Promise.resolve("");
      },
    };
    const result = await shallowClone("https://github.com/o/r", "/dest", { ref: "v2.0.0", port: fake });
    expect(result.branch).toBe("v2.0.0");
  });

  it("rejette un SHA inattendu par une GitCloneError", async () => {
    const fake: GitPort = {
      run(args) {
        if (args.includes("clone")) return Promise.resolve("");
        if (args.includes("rev-parse")) return Promise.resolve("pas-un-sha");
        return Promise.resolve("");
      },
    };
    await expect(shallowClone("https://github.com/o/r", "/dest", { port: fake })).rejects.toBeInstanceOf(
      GitCloneError,
    );
  });
});

describe("shallowClone — clone file:// réel (hors-ligne)", () => {
  let origin: string;
  let scratch: string;
  const committer = "2026-07-09T14:32:07+02:00";

  beforeEach(async () => {
    scratch = await mkdtemp(join(tmpdir(), "cwx-git-"));
    origin = join(scratch, "origin");
    const env = {
      ...process.env,
      GIT_AUTHOR_DATE: committer,
      GIT_COMMITTER_DATE: committer,
      GIT_AUTHOR_NAME: "Test",
      GIT_AUTHOR_EMAIL: "test@example.com",
      GIT_COMMITTER_NAME: "Test",
      GIT_COMMITTER_EMAIL: "test@example.com",
    };
    await run("git", ["init", "-b", "main", origin], { env });
    await writeFile(join(origin, "index.ts"), 'export const x = 1;\n');
    await run("git", ["-C", origin, "add", "."], { env });
    await run("git", ["-C", origin, "commit", "-m", "initial"], { env });
  });

  afterEach(async () => {
    await rm(scratch, { recursive: true, force: true });
  });

  it("extrait sha (40 hex), branche et committer date brute du commit", async () => {
    const dest = join(scratch, "clone");
    const result = await shallowClone(`file://${origin}`, dest, { port: nodeGitPort });
    expect(result.commitSha).toMatch(/^[0-9a-f]{40}$/);
    expect(result.branch).toBe("main");
    expect(result.committedAtRaw).toBe(committer);
    expect(result.dir).toBe(dest);
  });
});
