/**
 * Tests du cache par hash de contenu : round-trip mémoire/filesystem, garde de version,
 * clé sensible à l'extension, compteurs hits/misses, et neutralité quand le cache est
 * désactivé. La CORRECTION du cache (chaud == froid, octet pour octet) est vérifiée
 * bout-à-bout dans `analyze.test.ts` (cache mémoire, via `analyze`) et `run.test.ts`
 * (cache filesystem, via le CLI `runAnalyze`) ; ici on couvre l'unité.
 */

import { afterEach, beforeEach, describe, it, expect } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ParseCache,
  PARSE_CACHE_VERSION,
  createFilesystemCache,
  createMemoryCache,
  type FileFacts,
} from "./cache.js";

const FACTS: FileFacts = {
  symbols: [{ name: "foo", qualifiedName: "foo", symbolType: "function", startLine: 1, endLine: 3, exported: true }],
  imports: [{ specifier: "./b", relationType: "import" }],
};

describe("ParseCache — désactivé (aucun port)", () => {
  it("tout est un défaut, rien n'est stocké, stats neutres", async () => {
    const cache = new ParseCache();
    expect(cache.enabled).toBe(false);
    await cache.set("abc", "ts", FACTS);
    expect(await cache.get("abc", "ts")).toBeUndefined();
    expect(cache.stats).toEqual({ hits: 0, misses: 0 });
  });
});

describe("ParseCache — round-trip et stats", () => {
  it("un set puis get renvoie les mêmes faits et incrémente hits", async () => {
    const cache = new ParseCache(createMemoryCache());
    await cache.set("hash1", "ts", FACTS);
    const got = await cache.get("hash1", "ts");
    expect(got).toEqual(FACTS);
    expect(cache.stats).toEqual({ hits: 1, misses: 0 });
  });

  it("un get sans entrée compte un miss", async () => {
    const cache = new ParseCache(createMemoryCache());
    expect(await cache.get("absent", "ts")).toBeUndefined();
    expect(cache.stats).toEqual({ hits: 0, misses: 1 });
  });

  it("la clé distingue les extensions (même hash, .ts vs .tsx)", async () => {
    const port = createMemoryCache();
    const cache = new ParseCache(port);
    await cache.set("samehash", "ts", FACTS);
    // Même contentHash mais extension .tsx : entrée distincte, donc défaut.
    expect(await cache.get("samehash", "tsx")).toBeUndefined();
    expect(await cache.get("samehash", "ts")).toEqual(FACTS);
  });
});

describe("ParseCache — garde de version et robustesse", () => {
  it("une entrée d'une autre version est ignorée (auto-réparation)", async () => {
    const port = createMemoryCache();
    // Empoisonne le port avec une valeur d'une version antérieure.
    await port.set(`hash2.ts`, JSON.stringify({ v: PARSE_CACHE_VERSION + 1, symbols: [], imports: [] }));
    const cache = new ParseCache(port);
    expect(await cache.get("hash2", "ts")).toBeUndefined();
  });

  it("un JSON illisible est traité comme un défaut, sans exception", async () => {
    const port = createMemoryCache();
    await port.set(`hash3.ts`, "{ pas du json");
    const cache = new ParseCache(port);
    expect(await cache.get("hash3", "ts")).toBeUndefined();
  });

  it("un symbolType hors vocabulaire (cache corrompu) est un défaut, jamais propagé", async () => {
    const port = createMemoryCache();
    await port.set(
      `hash4.ts`,
      JSON.stringify({
        v: PARSE_CACHE_VERSION,
        symbols: [{ name: "x", qualifiedName: "x", symbolType: "banana", startLine: 1, endLine: 1, exported: true }],
        imports: [],
      }),
    );
    const cache = new ParseCache(port);
    // « banana » n'est pas un SymbolType : l'entrée est rejetée (auto-réparation), pas
    // servie vers un échec Zod en aval.
    expect(await cache.get("hash4", "ts")).toBeUndefined();
  });
});

describe("createFilesystemCache", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "cwx-cache-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("persiste et relit les faits entre deux instances de cache", async () => {
    const a = new ParseCache(createFilesystemCache(dir));
    await a.set("deadbeef", "tsx", FACTS);
    // Nouvelle instance sur le même répertoire : la persistance est sur disque.
    const b = new ParseCache(createFilesystemCache(dir));
    expect(await b.get("deadbeef", "tsx")).toEqual(FACTS);
  });

  it("un get sur un répertoire vide est un défaut (jamais une erreur)", async () => {
    const cache = new ParseCache(createFilesystemCache(dir));
    expect(await cache.get("jamais-ecrit", "ts")).toBeUndefined();
  });
});
