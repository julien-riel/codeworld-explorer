/**
 * Slotting déterministe du moteur de layout (layout-engine-v0 §5).
 *
 * Aucun flux PRNG séquentiel : tout le placement dérive d'un hachage du `path`
 * (`hash32`, domaine `0x02`, distinct des octets `0x00`/`0x01` du contrat §5.3).
 * Le tri par `path` croissant (ordre de code-unit UTF-16) est la SEULE cause
 * d'indépendance à l'ordre d'entrée : `slotInto` l'applique lui-même, de sorte
 * qu'un mélange des mêmes chemins produit exactement la même affectation.
 */

import { sha256, utf8, readUint32BE } from "../hash/sha256.js";
import { normalizePath } from "../ids.js";
import { mod } from "../integer.js";

/** Comparaison en ordre de code-unit UTF-16 (comparaison native des chaînes). */
function compareCodeUnit(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Mot 32 bits d'un chemin (§5.1) :
 * `readUint32BE(sha256(utf8(seed) ++ [0x02] ++ utf8(normalizePath(path)))[0..4])`.
 * Pur et identique bit à bit entre moteurs. La graine `seed = config.layoutSeed`
 * est explicite (le paquet bannit toute globale et toute entropie, ADR-0003).
 */
export function hash32(seed: string, path: string): number {
  const seedBytes = utf8(seed);
  const pathBytes = utf8(normalizePath(path));
  const input = new Uint8Array(seedBytes.length + 1 + pathBytes.length);
  input.set(seedBytes, 0);
  input[seedBytes.length] = 0x02;
  input.set(pathBytes, seedBytes.length + 1);
  return readUint32BE(sha256(input), 0);
}

/**
 * Slotting par hachage avec sondage linéaire (§5.2). Les candidats sont triés par
 * `path` croissant, chacun vise le créneau `hash32(path) mod m` puis sonde
 * linéairement ; l'occupant en place ne bouge JAMAIS (c'est le nouveau venu qui
 * sonde). Précondition : `paths` deux à deux distincts et `|paths| ≤ m`.
 *
 * @returns une affectation `path → indice de créneau` dans `[0, m)`.
 * @throws RangeError si `|paths| > m` (le sondage ne terminerait pas).
 */
export function slotInto(paths: readonly string[], m: number, seed: string): Map<string, number> {
  if (paths.length > m) {
    throw new RangeError(`slotInto : ${paths.length} candidats pour m=${m} (précondition |paths| ≤ m)`);
  }
  const sorted = [...paths].sort(compareCodeUnit);
  const occupied = new Array<boolean>(m).fill(false);
  const result = new Map<string, number>();
  for (const path of sorted) {
    let slot = mod(hash32(seed, path), m);
    while (occupied[slot] === true) {
      slot = mod(slot + 1, m);
    }
    occupied[slot] = true;
    result.set(path, slot);
  }
  return result;
}
