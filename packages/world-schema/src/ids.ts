/**
 * Normalisation de chemin et dérivation des identifiants (contrat §4).
 *
 * Formule d'identité unique : `id = "<préfixe>_" + idHash(...)`, où
 * `idHash(s) = base32(sha256(utf8(s))).slice(0, idHashLength)`. Aucun identifiant
 * magique (`n_root` proscrit) : la racine suit `nodeId("")`.
 */

import { sha256, utf8 } from "./hash/sha256.js";
import { base32 } from "./hash/base32.js";

/** Longueur par défaut de l'empreinte d'identité, en caractères base32 (contrat §4.3 : 80 bits). */
export const DEFAULT_ID_HASH_LENGTH = 16;
/** Bornes inclusives de `idHashLength` (contrat §4.3, cohérentes avec la borne Zod `{8,32}`). */
export const MIN_ID_HASH_LENGTH = 8;
export const MAX_ID_HASH_LENGTH = 32;

/**
 * Normalise un chemin (contrat §4.1) : séparateurs POSIX, suppression d'un `./`
 * initial et des `/` finaux, normalisation Unicode NFC, casse préservée.
 * La racine du dépôt a `path === ""`.
 */
export function normalizePath(raw: string): string {
  let p = raw.replace(/\\/g, "/");
  if (p.startsWith("./")) p = p.slice(2);
  while (p.length > 0 && p.endsWith("/")) p = p.slice(0, -1);
  return p.normalize("NFC");
}

/**
 * Empreinte d'identité : les `idHashLength` premiers CARACTÈRES de la base32 du
 * SHA-256 des octets UTF-8 de `s` (contrat §4.2).
 *
 * @throws RangeError si `idHashLength` n'est pas un entier de `[8, 32]` — la
 * plage configurable du contrat §4.3. Hors de cette plage, aucun identifiant
 * n'est produit : l'appelant doit corriger `config.idHashLength`.
 */
export function idHash(s: string, idHashLength: number = DEFAULT_ID_HASH_LENGTH): string {
  if (
    !Number.isInteger(idHashLength) ||
    idHashLength < MIN_ID_HASH_LENGTH ||
    idHashLength > MAX_ID_HASH_LENGTH
  ) {
    throw new RangeError(
      `idHashLength doit être un entier dans [${MIN_ID_HASH_LENGTH}, ${MAX_ID_HASH_LENGTH}] ; reçu : ${idHashLength}`,
    );
  }
  return base32(sha256(utf8(s))).slice(0, idHashLength);
}

/** `id` d'un `SourceNode` : `"n_" + idHash(normalizePath(path))` (contrat §4.2). */
export function nodeId(path: string, idHashLength: number = DEFAULT_ID_HASH_LENGTH): string {
  return "n_" + idHash(normalizePath(path), idHashLength);
}

/** `id` d'un `SpatialNode` : `"s_" + idHash(sourceNodeId + "|" + role + "|" + page)` (contrat §4.2, §3.7). */
export function spatialNodeId(
  sourceNodeId: string,
  role: string,
  page: number,
  idHashLength: number = DEFAULT_ID_HASH_LENGTH,
): string {
  return "s_" + idHash(`${sourceNodeId}|${role}|${page}`, idHashLength);
}

/** `id` d'un `Portal` : `"p_" + idHash(fromId + "->" + toId + "|" + kind)` (contrat §4.2, §3.7). */
export function portalId(
  fromSpatialNodeId: string,
  toSpatialNodeId: string,
  kind: string,
  idHashLength: number = DEFAULT_ID_HASH_LENGTH,
): string {
  return "p_" + idHash(`${fromSpatialNodeId}->${toSpatialNodeId}|${kind}`, idHashLength);
}
