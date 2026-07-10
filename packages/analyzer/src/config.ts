/**
 * Configuration du pipeline (couche 1 de classification, métadonnées, exclusions
 * supplémentaires) et calcul de `configurationHash` (contrat §5.4).
 *
 * Format : JSON (`--config <fichier.json>`). Le PRD §12.1 évoque « YAML/JSON » ;
 * en sprint 2 on s'en tient au JSON, suffisant pour démontrer que la couche 1 prime
 * sur la couche 2, et sans dépendance de parseur YAML. La validation est manuelle et
 * stricte : toute clé ou valeur inattendue lève une `ConfigError` claire.
 *
 * `configurationHash` couvre TOUT ce qui influence les octets de l'artefact SAUF les
 * composantes déjà présentes dans le tuple d'identité FR-026 (contrat §10.1) :
 * `repository`, `snapshot.commitSha` et `analyzerVersion` en sont donc exclus.
 */

import {
  CategorySchema,
  DEFAULT_ID_HASH_LENGTH,
  DEFAULT_LAYOUT_OPTIONS,
  canonicalStringify,
  normalizeCommittedAt,
  sha256Hex,
  type Category,
} from "@codeworld/world-schema";
import { ConfigError } from "./errors.js";
import { CLASSIFICATION_RULES, themeForCategory } from "./classify.js";
import { DEFAULT_EXCLUDED_DIRS, MAX_FILE_SIZE_BYTES } from "./exclusions.js";

/** Version de la taxonomie de classification (contrat §5.4, PRD §12.2). */
const TAXONOMY_VERSION = 0;

/** `committedAt` par défaut, déjà normalisé (contrat §3.4.1), en l'absence de config. */
const DEFAULT_COMMITTED_AT = "1970-01-01T00:00:00Z";

/** Métadonnées de dépôt surchargées par la config (toutes optionnelles). */
export interface RepositoryOverride {
  readonly owner?: string;
  readonly name?: string;
  readonly url?: string;
  readonly defaultBranch?: string;
  readonly license?: string | null;
}

/** Métadonnées de snapshot surchargées par la config (toutes optionnelles). */
export interface SnapshotOverride {
  readonly commitSha?: string;
  readonly branch?: string;
  readonly committedAt?: string;
}

/** Configuration brute lue du fichier, après validation de forme. */
export interface FileConfig {
  readonly layoutSeed?: string;
  readonly idHashLength?: number;
  readonly exclude?: readonly string[];
  readonly repository?: RepositoryOverride;
  readonly snapshot?: SnapshotOverride;
  readonly classificationPaths?: ReadonlyMap<string, Category>;
  readonly classificationFolderNames?: ReadonlyMap<string, Category>;
}

/** Configuration résolue : tous les défauts appliqués, prête pour le pipeline. */
export interface ResolvedConfig {
  readonly layoutSeed: string;
  readonly idHashLength: number;
  readonly repository: {
    readonly owner: string;
    readonly name: string;
    readonly url: string;
    readonly defaultBranch: string;
    readonly license: string | null;
  };
  readonly snapshot: {
    readonly commitSha: string;
    readonly branch: string;
    readonly committedAt: string;
  };
  readonly extraExcludes: readonly string[];
  readonly classificationPaths: ReadonlyMap<string, Category>;
  readonly classificationFolderNames: ReadonlyMap<string, Category>;
  /** Empreinte SHA-256 hex de la configuration effective (contrat §5.4). */
  readonly configurationHash: string;
}

// ── Validation manuelle et stricte ──

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function expectString(v: unknown, ctx: string): string {
  if (typeof v !== "string") throw new ConfigError(`${ctx} doit être une chaîne.`);
  return v;
}

function asCategory(v: unknown, ctx: string): Category {
  const r = CategorySchema.safeParse(v);
  if (!r.success) throw new ConfigError(`${ctx} : catégorie invalide « ${String(v)} » (voir taxonomie PRD §12.2).`);
  return r.data;
}

/** Vérifie qu'un objet ne porte que des clés autorisées (mode strict). */
function assertNoUnknownKeys(obj: Record<string, unknown>, allowed: readonly string[], ctx: string): void {
  for (const key of Object.keys(obj)) {
    if (!allowed.includes(key)) throw new ConfigError(`${ctx} : clé inconnue « ${key} ».`);
  }
}

function parseCategoryRecord(v: unknown, ctx: string): Map<string, Category> {
  if (!isPlainObject(v)) throw new ConfigError(`${ctx} doit être un objet.`);
  const out = new Map<string, Category>();
  for (const [key, value] of Object.entries(v)) out.set(key, asCategory(value, `${ctx}.${key}`));
  return out;
}

/**
 * Valide et normalise le contenu JSON d'un fichier de configuration. Lève
 * `ConfigError` sur toute forme inattendue ; renvoie une `FileConfig` typée.
 */
export function parseConfigJson(text: string): FileConfig {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (error) {
    throw new ConfigError(`Configuration JSON illisible : ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!isPlainObject(data)) throw new ConfigError("La configuration doit être un objet JSON.");
  assertNoUnknownKeys(
    data,
    ["layoutSeed", "idHashLength", "exclude", "repository", "snapshot", "classifications"],
    "config",
  );

  const config: {
    layoutSeed?: string;
    idHashLength?: number;
    exclude?: string[];
    repository?: RepositoryOverride;
    snapshot?: SnapshotOverride;
    classificationPaths?: Map<string, Category>;
    classificationFolderNames?: Map<string, Category>;
  } = {};

  if (data.layoutSeed !== undefined) config.layoutSeed = expectString(data.layoutSeed, "config.layoutSeed");

  if (data.idHashLength !== undefined) {
    const n = data.idHashLength;
    if (typeof n !== "number" || !Number.isInteger(n) || n < 8 || n > 32) {
      throw new ConfigError("config.idHashLength doit être un entier dans [8, 32] (contrat §4.3).");
    }
    config.idHashLength = n;
  }

  if (data.exclude !== undefined) {
    if (!Array.isArray(data.exclude)) throw new ConfigError("config.exclude doit être un tableau de chaînes.");
    config.exclude = data.exclude.map((e, i) => expectString(e, `config.exclude[${String(i)}]`));
  }

  if (data.repository !== undefined) {
    if (!isPlainObject(data.repository)) throw new ConfigError("config.repository doit être un objet.");
    const r = data.repository;
    assertNoUnknownKeys(r, ["owner", "name", "url", "defaultBranch", "license"], "config.repository");
    const repo: { owner?: string; name?: string; url?: string; defaultBranch?: string; license?: string | null } = {};
    if (r.owner !== undefined) repo.owner = expectString(r.owner, "config.repository.owner");
    if (r.name !== undefined) repo.name = expectString(r.name, "config.repository.name");
    if (r.url !== undefined) repo.url = expectString(r.url, "config.repository.url");
    if (r.defaultBranch !== undefined) repo.defaultBranch = expectString(r.defaultBranch, "config.repository.defaultBranch");
    if (r.license !== undefined) repo.license = r.license === null ? null : expectString(r.license, "config.repository.license");
    config.repository = repo;
  }

  if (data.snapshot !== undefined) {
    if (!isPlainObject(data.snapshot)) throw new ConfigError("config.snapshot doit être un objet.");
    const s = data.snapshot;
    assertNoUnknownKeys(s, ["commitSha", "branch", "committedAt"], "config.snapshot");
    const snap: { commitSha?: string; branch?: string; committedAt?: string } = {};
    if (s.commitSha !== undefined) {
      const sha = expectString(s.commitSha, "config.snapshot.commitSha");
      if (!/^[0-9a-f]{40}$/.test(sha)) throw new ConfigError("config.snapshot.commitSha doit être 40 caractères hexadécimaux minuscules.");
      snap.commitSha = sha;
    }
    if (s.branch !== undefined) snap.branch = expectString(s.branch, "config.snapshot.branch");
    if (s.committedAt !== undefined) snap.committedAt = expectString(s.committedAt, "config.snapshot.committedAt");
    config.snapshot = snap;
  }

  if (data.classifications !== undefined) {
    if (!isPlainObject(data.classifications)) throw new ConfigError("config.classifications doit être un objet.");
    assertNoUnknownKeys(data.classifications, ["paths", "folderNames"], "config.classifications");
    if (data.classifications.paths !== undefined) {
      config.classificationPaths = parseCategoryRecord(data.classifications.paths, "config.classifications.paths");
    }
    if (data.classifications.folderNames !== undefined) {
      const raw = parseCategoryRecord(data.classifications.folderNames, "config.classifications.folderNames");
      // Clés abaissées en ASCII pour un appariement insensible à la casse (cf. classify.ts).
      const lowered = new Map<string, Category>();
      for (const [name, cat] of raw) lowered.set(asciiLowerKey(name), cat);
      config.classificationFolderNames = lowered;
    }
  }

  return config;
}

/** Abaissement ASCII pur (cohérent avec classify.ts et language.ts). */
function asciiLowerKey(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const u = s.charCodeAt(i);
    out += String.fromCharCode(u >= 0x41 && u <= 0x5a ? u + 0x20 : u);
  }
  return out;
}

// ── Résolution et hachage ──

/** Représentation triée d'une `Map` en objet simple, pour un hachage stable. */
function mapToRecord(m: ReadonlyMap<string, Category>): Record<string, Category> {
  const out: Record<string, Category> = {};
  for (const key of [...m.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))) {
    const value = m.get(key);
    if (value !== undefined) out[key] = value;
  }
  return out;
}

/**
 * Construit `effectiveConfig` (contrat §5.4) puis son empreinte. La sérialisation
 * canonique trie elle-même les clés d'objet ; l'ordre d'insertion est donc sans effet.
 */
function computeConfigurationHash(
  layoutSeed: string,
  idHashLength: number,
  extraExcludes: readonly string[],
  classificationPaths: ReadonlyMap<string, Category>,
  classificationFolderNames: ReadonlyMap<string, Category>,
): string {
  const visualMappings = CLASSIFICATION_RULES.map((rule) => ({
    folderNames: [...rule.folderNames],
    classification: rule.category,
    theme: themeForCategory(rule.category),
    priority: rule.priority,
  }));

  const effectiveConfig = {
    exclusionRules: {
      excludedDirs: Object.keys(DEFAULT_EXCLUDED_DIRS).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
      extraExcludes: [...extraExcludes].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
      maxFileSizeBytes: MAX_FILE_SIZE_BYTES,
    },
    visualMappings,
    layoutSeed,
    layoutOptions: DEFAULT_LAYOUT_OPTIONS,
    idHashLength,
    taxonomyVersion: TAXONOMY_VERSION,
    classificationOverrides: {
      paths: mapToRecord(classificationPaths),
      folderNames: mapToRecord(classificationFolderNames),
    },
    ai: { modelId: "", promptVersion: "" },
  };

  return sha256Hex(canonicalStringify(effectiveConfig));
}

/**
 * Applique les défauts déterministes (aucune horloge, aucun appel git) et calcule
 * `configurationHash`. `repoName` est le nom de base du dossier analysé, défaut de
 * `repository.name`. Les métadonnées de dépôt/commit sont des VALEURS DÉTERMINISTES
 * — le sprint 2 ne clone pas GitHub et ne lit pas l'historique git (PRD §27.2) ; la
 * config peut les surcharger explicitement.
 */
export function resolveConfig(fileConfig: FileConfig | undefined, repoName: string): ResolvedConfig {
  const fc = fileConfig ?? {};
  const layoutSeed = fc.layoutSeed ?? "codeworld";
  const idHashLength = fc.idHashLength ?? DEFAULT_ID_HASH_LENGTH;

  const owner = fc.repository?.owner ?? "local";
  const name = fc.repository?.name ?? repoName;
  const defaultBranch = fc.repository?.defaultBranch ?? "main";
  const url = fc.repository?.url ?? `https://github.com/${owner}/${name}`;
  const license = fc.repository?.license ?? null;

  const commitSha = fc.snapshot?.commitSha ?? "0".repeat(40);
  const branch = fc.snapshot?.branch ?? defaultBranch;
  let committedAt = DEFAULT_COMMITTED_AT;
  if (fc.snapshot?.committedAt !== undefined) {
    try {
      committedAt = normalizeCommittedAt(fc.snapshot.committedAt);
    } catch (error) {
      throw new ConfigError(
        `config.snapshot.committedAt non normalisable : ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  const extraExcludes = fc.exclude ?? [];
  const classificationPaths = fc.classificationPaths ?? new Map<string, Category>();
  const classificationFolderNames = fc.classificationFolderNames ?? new Map<string, Category>();

  const configurationHash = computeConfigurationHash(
    layoutSeed,
    idHashLength,
    extraExcludes,
    classificationPaths,
    classificationFolderNames,
  );

  return {
    layoutSeed,
    idHashLength,
    repository: { owner, name, url, defaultBranch, license },
    snapshot: { commitSha, branch, committedAt },
    extraExcludes,
    classificationPaths,
    classificationFolderNames,
    configurationHash,
  };
}
