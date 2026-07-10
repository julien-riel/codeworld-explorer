/**
 * Pont PALETTE → variables CSS (`--cw-*`).
 *
 * La palette produit reste l'UNIQUE source de vérité (PRD §10.3) : au lieu de coder
 * des hex nus dans la feuille de style, on projette chaque teinte nommée en variable
 * CSS custom, posée sur la racine de l'overlay. La feuille `hud.css` ne référence que
 * `var(--cw-…)`, donc aucune couleur n'est dupliquée.
 */

import type { CSSProperties } from "react";
import { PALETTE } from "../palette";

/** `surfaceRaised` → `surface-raised`. */
function kebab(name: string): string {
  return name.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}

/** Objet de style portant toutes les variables `--cw-*` dérivées de la palette. */
export function paletteCssVars(): CSSProperties {
  // `CSSProperties` accepte les propriétés custom `--*` : le Record est assignable tel quel.
  const vars: Record<string, string> = {};
  for (const [name, value] of Object.entries(PALETTE)) {
    vars[`--cw-${kebab(name)}`] = value;
  }
  return vars;
}
