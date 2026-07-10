/**
 * PRNG mulberry32 et dérivation de graine par nœud (contrat §5.2, §5.3).
 *
 * Le hasard est ENTIER : `mulberry32` rend des entiers uint32, jamais un
 * flottant de `[0,1)`. La graine d'un nœud dérive de son `path` (indépendante de
 * l'ordre de parcours) et de la seule graine de configuration (indépendante du
 * commit, ADR-0003).
 */

import { sha256, utf8, readUint32BE } from "./hash/sha256.js";
import { normalizePath } from "./ids.js";

/**
 * PRNG mulberry32 (contrat §5.2). Arithmétique 32 bits non signée ; `Math.imul`
 * est déterministe et disponible dans Node comme dans le navigateur.
 * @returns une fonction `next()` rendant un entier uint32 dans `[0, 2^32)`.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1) >>> 0;
    t = (t ^ (t + Math.imul(t ^ (t >>> 7), t | 61))) >>> 0;
    return (t ^ (t >>> 14)) >>> 0;
  };
}

/**
 * Graine du flux PRNG d'un nœud (contrat §5.3) :
 * `readUint32BE(sha256(utf8(seed) ++ [0x00] ++ utf8(normalizePath(path)))[0..4])`.
 * L'octet `0x00` sépare le domaine « flux PRNG » du slotting (`0x01`, `0x02`).
 */
export function nodeStreamSeed(seed: string, path: string): number {
  const seedBytes = utf8(seed);
  const pathBytes = utf8(normalizePath(path));
  const input = new Uint8Array(seedBytes.length + 1 + pathBytes.length);
  input.set(seedBytes, 0);
  input[seedBytes.length] = 0x00;
  input.set(pathBytes, seedBytes.length + 1);
  return readUint32BE(sha256(input), 0);
}

/** Flux PRNG propre au nœud de chemin `path`, semé par `nodeStreamSeed` (contrat §5.3). */
export function prngOf(seed: string, path: string): () => number {
  return mulberry32(nodeStreamSeed(seed, path));
}
