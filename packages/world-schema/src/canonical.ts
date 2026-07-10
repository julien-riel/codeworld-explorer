/**
 * Sérialisation canonique (contrat §6). Sortie minifiée, déterministe, entiers
 * seuls : clés d'objet triées en ordre de code-unit UTF-16, tableaux JAMAIS
 * réordonnés (le producteur les a déjà triés, §2.4), aucun blanc, aucun saut de
 * ligne final. Le fichier `world.json` EST exactement cette chaîne encodée en
 * UTF-8 sans BOM (§6.2).
 */

import { NonCanonicalNumberError, NonCanonicalValueError } from "./errors.js";
import { sha256Hex, utf8 } from "./hash/sha256.js";

/** Comparaison en ordre de code-unit UTF-16 (comparaison native des chaînes). */
function compareCodeUnit(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function stringifyNumber(v: number): string {
  // Garde d'exécution : NaN, ±Infinity, flottants et entiers non sûrs lèvent.
  // -0 passe (Number.isSafeInteger(-0) === true) et `String(-0) === "0"`, donc
  // 0 et -0 produisent des octets identiques.
  if (!Number.isFinite(v) || !Number.isSafeInteger(v)) {
    throw new NonCanonicalNumberError(v);
  }
  return String(v);
}

function stringifyValue(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return stringifyNumber(value);
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return "[" + value.map((el: unknown) => stringifyValue(el)).join(",") + "]";
  }
  if (typeof value === "object") {
    // Valeur restreinte à un objet non nul et non-tableau : accès par clé requis.
    const rec = value as Record<string, unknown>;
    const keys = Object.keys(rec)
      .filter((k) => rec[k] !== undefined)
      .sort(compareCodeUnit);
    const parts = keys.map((k) => JSON.stringify(k) + ":" + stringifyValue(rec[k]));
    return "{" + parts.join(",") + "}";
  }
  // undefined, function, symbol, bigint.
  throw new NonCanonicalValueError(typeof value);
}

/** Rend la forme canonique (chaîne) d'une valeur (contrat §6.1). */
export function canonicalStringify(value: unknown): string {
  return stringifyValue(value);
}

/** Encode la forme canonique en octets UTF-8 sans BOM (contrat §6.2). */
export function canonicalBytes(value: unknown): Uint8Array {
  return utf8(canonicalStringify(value));
}

/**
 * Empreinte SHA-256 hex des octets canoniques d'une valeur (contrat §10.3). Deux
 * artefacts sont identiques au sens FR-026 si et seulement si leurs `hashWorld`
 * coïncident ; sert de golden compact pour verrouiller la reproductibilité sans
 * comparer octet à octet un fichier volumineux.
 */
export function hashWorld(value: unknown): string {
  return sha256Hex(canonicalBytes(value));
}
