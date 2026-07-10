/**
 * Base32 RFC 4648, alphabet MINUSCULE, SANS padding (contrat §4.2).
 *
 * Choix figés par le contrat : alphabet `abcdefghijklmnopqrstuvwxyz234567`,
 * aucun caractère de remplissage `=`. 32 octets (256 bits) → 52 caractères.
 */

const ALPHABET = "abcdefghijklmnopqrstuvwxyz234567";

/** Encode des octets en base32 RFC 4648 minuscule sans padding. */
export function base32(bytes: Uint8Array): string {
  let out = "";
  let value = 0; // accumulateur des bits non encore émis (toujours < 2^13)
  let bits = 0; // nombre de bits significatifs dans `value`
  for (const b of bytes) {
    value = ((value << 8) | b) >>> 0;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += ALPHABET.charAt((value >>> bits) & 31);
    }
    // On ne garde que les `bits` bits de poids faible restants (bits < 5),
    // ce qui borne `value` et interdit tout débordement 32 bits.
    value &= (1 << bits) - 1;
  }
  if (bits > 0) {
    out += ALPHABET.charAt((value << (5 - bits)) & 31);
  }
  return out;
}
