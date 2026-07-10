/**
 * Primitives arithmétiques ENTIÈRES du moteur de layout (layout-engine-v0 §9.4).
 *
 * Contrainte dure du paquet : aucune division inexacte, aucune trigonométrie,
 * aucun flottant résiduel. Toutes ces fonctions supposent des entiers sûrs en
 * entrée et rendent des entiers sûrs ; les préconditions (signe, non-nullité du
 * diviseur) sont documentées là où elles ne se lisent pas dans le code.
 */

/** Minimum entier. */
export function min(a: number, b: number): number {
  return a < b ? a : b;
}

/** Maximum entier. */
export function max(a: number, b: number): number {
  return a > b ? a : b;
}

/** Valeur absolue entière. */
export function abs(a: number): number {
  return a < 0 ? -a : a;
}

/**
 * Quotient entier tronqué vers zéro. Précondition : `a ≥ 0`, `b > 0`.
 * La correction ±1 rattrape tout arrondi de la division flottante, de sorte que
 * le résultat est EXACT pour tout couple d'entiers sûrs (jamais une troncature
 * approximative).
 */
export function div(a: number, b: number): number {
  let q = Math.floor(a / b);
  const r = a - q * b;
  if (r < 0) q -= 1;
  else if (r >= b) q += 1;
  return q;
}

/**
 * Reste euclidien dans `[0, n)`. Précondition : `n > 0`. Contrairement à `%` de
 * JavaScript, le résultat n'est jamais négatif (utile pour le slotting §5.2).
 */
export function mod(a: number, n: number): number {
  const r = a % n;
  return r < 0 ? r + n : r;
}

/** Plafond de division entière : plus petit `q` tel que `q·b ≥ a`. Précondition : `a ≥ 0`, `b > 0`. */
export function ceilDiv(a: number, b: number): number {
  return a === 0 ? 0 : div(a + b - 1, b);
}

/** Plancher de racine carrée entière : plus grand `k` tel que `k·k ≤ n`. Précondition : `n ≥ 0`. */
export function isqrtFloor(n: number): number {
  if (n < 2) return n;
  let x = n;
  let y = div(x + 1, 2);
  while (y < x) {
    x = y;
    y = div(x + div(n, x), 2);
  }
  return x;
}

/** Plafond de racine carrée entière : plus petit `k` tel que `k·k ≥ n`. Précondition : `n ≥ 0`. */
export function isqrtCeil(n: number): number {
  if (n === 0) return 0;
  const r = isqrtFloor(n);
  return r * r === n ? r : r + 1;
}
