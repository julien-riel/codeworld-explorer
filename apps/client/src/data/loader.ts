/**
 * Chargement des artefacts depuis `public/worlds/` (PRD §14.1, §16.1).
 *
 * Le refus de version (FR-027) passe par le CONTRAT : `parseWorld` lit
 * `manifest.schemaVersion` avant toute validation Zod et lève une erreur TYPÉE
 * (`UnsupportedSchemaVersionError`). Le loader ne réinvente pas cette logique : il
 * l'appelle, puis NORMALISE toute défaillance (réseau, JSON, schéma, version) en une
 * `WorldError` discriminée que le store expose pour un affichage propre — jamais une
 * exception non gérée qui remonterait jusqu'à la scène.
 */

import {
  parseWorld,
  UnsupportedSchemaVersionError,
  WorldLoadException,
  type World,
  type WorldLoadError,
} from "@codeworld/world-schema";

/** Racine statique des mondes (servie telle quelle par Vite depuis `public/`). */
const WORLDS_BASE = "worlds";

// ── Galerie (`worlds/index.json`) ──

/** Une entrée de la galerie (`worlds/index.json`). Compteurs indicatifs pour l'UI. */
export interface GalleryEntry {
  /** Nom affiché du monde. */
  name: string;
  /** Sous-dossier du monde sous `worlds/` (ex. "schema"). */
  path: string;
  /** Chemin relatif du `world.json` sous `worlds/` (ex. "schema/world.json"). */
  world: string;
  nodes: number;
  rooms: number;
  files: number;
  artifactBytes: number;
}

/** Index de la galerie. */
export interface Gallery {
  schemaVersion: number;
  worlds: GalleryEntry[];
}

// ── Erreur de chargement client ──

/**
 * `WorldError` : le `WorldLoadError` du contrat (json malformé / version non
 * supportée / schéma invalide) ÉTENDU d'un cas `network` propre au client (fetch
 * échoué, 404…). Discriminée par `kind` ; `message` en français pour l'UI.
 */
export type WorldError =
  | WorldLoadError
  | { kind: "network"; status: number | null; message: string };

/** Échec HTTP (statut non-2xx) porteur du code, distinct d'une panne réseau brute. */
export class HttpError extends Error {
  readonly status: number;
  constructor(status: number, url: string) {
    super(`Requête ${url} : HTTP ${String(status)}.`);
    this.name = "HttpError";
    this.status = status;
  }
}

/**
 * Normalise n'importe quelle défaillance en `WorldError`. C'est le point unique où
 * les erreurs typées du contrat sont converties en état affichable (FR-027).
 */
export function normalizeWorldError(err: unknown): WorldError {
  // Version non supportée : erreur typée du contrat, cas le plus important (FR-027).
  if (err instanceof UnsupportedSchemaVersionError) {
    return {
      kind: "unsupported-schema-version",
      found: err.found,
      supported: err.supported,
      message: err.message,
    };
  }
  // JSON malformé ou schéma invalide : le contrat les emballe dans WorldLoadException.
  if (err instanceof WorldLoadException) {
    return err.error;
  }
  // `JSON.parse` échoue avec un SyntaxError natif.
  if (err instanceof SyntaxError) {
    return { kind: "malformed-json", message: `JSON illisible : ${err.message}` };
  }
  // Échec réseau / fetch (ou HttpError ci-dessous).
  if (err instanceof HttpError) {
    return { kind: "network", status: err.status, message: err.message };
  }
  return {
    kind: "network",
    status: null,
    message: err instanceof Error ? err.message : String(err),
  };
}

// ── URLs ──

/** URL statique du `world.json` d'un monde (`path` = ex. "schema/world.json"). */
export function worldUrl(path: string): string {
  return `${WORLDS_BASE}/${path}`;
}

/**
 * URL statique d'un blob de contenu de fichier, servi sous
 * `worlds/<worldPath>/files/<contentHash>` (chargement à la demande, PRD §11, §16.1).
 */
export function fileContentUrl(worldPath: string, contentHash: string): string {
  return `${WORLDS_BASE}/${worldPath}/files/${contentHash}`;
}

// ── Fetch ──

/** `fetch` + garde de statut, factorisé. Lève `HttpError` sur statut non-2xx. */
async function fetchText(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new HttpError(response.status, url);
  }
  return response.text();
}

/**
 * Charge et valide un monde. Séquence (contrat §9.1) : fetch → `JSON.parse` →
 * `parseWorld` (version puis schéma).
 *
 * @throws UnsupportedSchemaVersionError si `schemaVersion` est inconnu (FR-027).
 * @throws WorldLoadException si le schéma est invalide, `SyntaxError` si le JSON est
 *   illisible, `HttpError`/erreur réseau si le fetch échoue. L'appelant (store)
 *   normalise via `normalizeWorldError` ; rien ne remonte non géré jusqu'à la scène.
 */
export async function loadWorld(path: string): Promise<World> {
  const raw = await fetchText(worldUrl(path));
  const data: unknown = JSON.parse(raw);
  return parseWorld(data);
}

/** Charge l'index de la galerie (`worlds/index.json`). */
export async function loadGallery(): Promise<Gallery> {
  const raw = await fetchText(`${WORLDS_BASE}/index.json`);
  const data: unknown = JSON.parse(raw);
  return data as Gallery;
}
