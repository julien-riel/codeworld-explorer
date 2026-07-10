/**
 * FNV-1a 32 bits sur les octets UTF-8 d'une chaîne.
 *
 * Attention : ce `hash32` est le FNV-1a canonique, distinct du `hash32(path)`
 * du moteur de layout (layout-engine-v0 §5.1), qui est fondé sur SHA-256. Le
 * moteur de layout doit implémenter le sien à part (voir readUint32BE/sha256).
 */

import { utf8 } from "./sha256.js";

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/** Empreinte FNV-1a 32 bits, entier non signé dans `[0, 2^32)`. */
export function hash32(s: string): number {
  let h = FNV_OFFSET_BASIS;
  const bytes = utf8(s);
  for (const b of bytes) {
    h ^= b;
    h = Math.imul(h, FNV_PRIME) >>> 0;
  }
  return h >>> 0;
}
