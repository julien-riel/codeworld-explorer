/**
 * Cache filesystem par HASH DE CONTENU pour l'analyse statique incrémentale
 * (PRD §14.1, §20.2 « analyse incrémentale par hash de contenu »).
 *
 * Ce qui est mémoïsé : les FAITS BRUTS d'un fichier tels que produits par ts-morph
 * — symboles top-level sans `id`, spécificateurs d'import/re-export. Ces faits ne
 * dépendent QUE des octets du fichier ET de son extension (qui pilote le mode du
 * parseur : JSX pour `.tsx`/`.jsx`). Ils sont donc adressables par `(contentHash, ext)`.
 * Ce qui reste recalculé à chaque exécution car dépendant de l'état GLOBAL du dépôt :
 * l'`id` d'un symbole (dérivé du chemin, spec §15.4) et la résolution des relations
 * (contre l'ensemble des chemins du dépôt). Ces recalculs sont bon marché.
 *
 * DÉTERMINISME (FR-026) : le cache mémoïse une fonction PURE. Un cache chaud DOIT
 * produire un artefact identique octet pour octet à un cache froid (test dédié).
 * Le versionnement `PARSE_CACHE_VERSION` invalide les entrées si la logique
 * d'extraction change ; une entrée illisible ou périmée est traitée comme un défaut
 * de cache (auto-réparation), jamais comme une erreur.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { RelationTypeSchema, SymbolTypeSchema } from "@codeworld/world-schema";
import type { RawSymbol } from "./symbols.js";
import type { ImportSpec } from "./relations.js";

/**
 * Version de la logique d'extraction des faits bruts. À INCRÉMENTER à tout changement
 * de `symbols.ts`/`relations.ts` (ou de la construction du projet ts-morph) susceptible
 * de modifier les faits produits pour un même octet source. Sépare l'invalidation du
 * cache d'un bump d'`ANALYZER_VERSION` (qui, lui, autorise la régénération du corpus).
 */
export const PARSE_CACHE_VERSION = 1;

/** Faits bruts d'un fichier, indépendants du chemin (hors extension, cf. clé de cache). */
export interface FileFacts {
  readonly symbols: readonly RawSymbol[];
  readonly imports: readonly ImportSpec[];
}

/**
 * Port de cache clé→valeur (chaînes), injectable. Toute opération est BEST-EFFORT :
 * un échec de lecture renvoie `undefined` (défaut), un échec d'écriture est ignoré —
 * le cache n'est qu'une optimisation, jamais une source de vérité ni d'échec.
 */
export interface CachePort {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<void>;
}

/** Cache en mémoire (tests, ou analyse unique multi-fichiers d'un même contenu). */
export function createMemoryCache(): CachePort {
  const map = new Map<string, string>();
  return {
    get(key) {
      return Promise.resolve(map.get(key));
    },
    set(key, value) {
      map.set(key, value);
      return Promise.resolve();
    },
  };
}

/**
 * Cache filesystem sous `rootDir`, éclaté en shards de 2 caractères pour éviter les
 * répertoires géants (`<rootDir>/parse/<ab>/<key>.json`). Lectures et écritures
 * tolérantes aux erreurs (best-effort). Un `rootDir` par défaut relève de l'appelant.
 */
export function createFilesystemCache(rootDir: string): CachePort {
  const base = join(rootDir, "parse");
  const pathFor = (key: string): string => {
    const shard = key.length >= 2 ? key.slice(0, 2) : "__";
    return join(base, shard, `${key}.json`);
  };
  return {
    async get(key) {
      try {
        return await readFile(pathFor(key), "utf8");
      } catch {
        return undefined; // ENOENT ou illisible → défaut de cache
      }
    },
    async set(key, value) {
      const file = pathFor(key);
      try {
        await mkdir(dirname(file), { recursive: true });
        await writeFile(file, value);
      } catch {
        // Écriture best-effort : un cache non inscriptible n'interrompt pas l'analyse.
      }
    },
  };
}

/** Compteurs d'usage du cache, pour le journal de progression (hors artefact). */
export interface ParseCacheStats {
  hits: number;
  misses: number;
}

/**
 * Enveloppe typée au-dessus d'un `CachePort` : sérialise/désérialise les `FileFacts`
 * avec garde de version et validation de forme. Sans port (cache désactivé), tout est
 * un défaut et rien n'est stocké. La clé compose `contentHash` et `ext` : deux fichiers
 * d'octets identiques mais d'extensions différentes (`.ts` vs `.tsx`) ne partagent
 * jamais une entrée, car l'extension change le mode du parseur.
 */
export class ParseCache {
  readonly stats: ParseCacheStats = { hits: 0, misses: 0 };
  constructor(private readonly port?: CachePort) {}

  /** Vrai si un cache est réellement branché (sinon toutes les opérations sont neutres). */
  get enabled(): boolean {
    return this.port !== undefined;
  }

  private static key(contentHash: string, ext: string): string {
    // `ext` est déjà en minuscules et de charset sûr (voir language.ts) ; sans extension,
    // on marque « _ » pour rester déterministe et distinct d'un fichier suffixé.
    return `${contentHash}.${ext === "" ? "_" : ext}`;
  }

  async get(contentHash: string, ext: string): Promise<FileFacts | undefined> {
    if (this.port === undefined) return undefined;
    const raw = await this.port.get(ParseCache.key(contentHash, ext));
    const facts = raw === undefined ? undefined : decodeFacts(raw);
    if (facts === undefined) this.stats.misses += 1;
    else this.stats.hits += 1;
    return facts;
  }

  async set(contentHash: string, ext: string, facts: FileFacts): Promise<void> {
    if (this.port === undefined) return;
    await this.port.set(ParseCache.key(contentHash, ext), encodeFacts(facts));
  }
}

/** Sérialise des faits en JSON versionné (forme stable, lisible). */
function encodeFacts(facts: FileFacts): string {
  return JSON.stringify({ v: PARSE_CACHE_VERSION, symbols: facts.symbols, imports: facts.imports });
}

/**
 * Désérialise et VALIDE des faits ; renvoie `undefined` (défaut de cache) si la version
 * diffère, si le JSON est illisible, ou si la forme ne correspond pas. Jamais d'exception :
 * un cache corrompu ou d'une version antérieure se répare de lui-même à la réécriture.
 */
function decodeFacts(raw: string): FileFacts | undefined {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (typeof data !== "object" || data === null) return undefined;
  const obj = data as { v?: unknown; symbols?: unknown; imports?: unknown };
  if (obj.v !== PARSE_CACHE_VERSION) return undefined;
  if (!Array.isArray(obj.symbols) || !Array.isArray(obj.imports)) return undefined;
  if (!obj.symbols.every(isRawSymbol) || !obj.imports.every(isImportSpec)) return undefined;
  return { symbols: obj.symbols, imports: obj.imports };
}

function isRawSymbol(v: unknown): v is RawSymbol {
  if (typeof v !== "object" || v === null) return false;
  const s = v as Record<string, unknown>;
  return (
    typeof s.name === "string" &&
    typeof s.qualifiedName === "string" &&
    // Vocabulaire fermé : un `symbolType` corrompu est traité comme un défaut (auto-réparation
    // → re-parsing), jamais propagé vers un échec Zod en aval (spec §15.2).
    SymbolTypeSchema.safeParse(s.symbolType).success &&
    Number.isInteger(s.startLine) &&
    Number.isInteger(s.endLine) &&
    typeof s.exported === "boolean"
  );
}

function isImportSpec(v: unknown): v is ImportSpec {
  if (typeof v !== "object" || v === null) return false;
  const s = v as Record<string, unknown>;
  return typeof s.specifier === "string" && RelationTypeSchema.safeParse(s.relationType).success;
}
