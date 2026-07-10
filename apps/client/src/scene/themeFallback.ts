/**
 * Kit de thème de REPLI (fallback). La scène importe `ThemeKit` par son INTERFACE
 * (theme/ThemeKit.ts) et ne dépend pas de l'implémentation concrète des thèmes,
 * écrite par un autre agent. Tant qu'un thème n'a pas de kit enregistré, ce repli
 * fournit une géométrie low-poly neutre : la scène reste montable et testable en
 * toute circonstance.
 *
 * Les descripteurs restent en mm (repère modèle) ; la conversion d'échelle est faite
 * au montage. Les couleurs sont des NOMS de palette (jamais un hex nu, PRD §10.3).
 */

import type { ObjectKind, ThemeId } from "@codeworld/world-schema";
import {
  footprint,
  getThemeKit,
  type PrimitiveDescriptor,
  type ThemeKit,
} from "../theme/ThemeKit";
import type { PaletteColorName } from "../palette";

/** Hauteur de rendu par défaut (mm) selon le `kind`. */
const KIND_HEIGHT: Readonly<Record<ObjectKind, number>> = {
  "file-generic": 2200,
  "file-code": 2600,
  "file-config": 1800,
  "file-doc": 2000,
  "file-test": 2400,
  "readme-stand": 2000,
  console: 1200,
};

/** Couleur de palette par défaut selon le `kind` (repli visuel neutre). */
const KIND_COLOR: Readonly<Record<ObjectKind, PaletteColorName>> = {
  "file-generic": "textMuted",
  "file-code": "accent",
  "file-config": "warning",
  "file-doc": "success",
  "file-test": "info",
  "readme-stand": "favorite",
  console: "themeControlRoom",
};

/**
 * Kit de repli : boîtes low-poly dimensionnées sur l'emprise partagée
 * `KIND_FOOTPRINT` et une hauteur par `kind`. Indépendant du thème (mêmes formes
 * pour tous), il ne sert que lorsqu'aucun kit concret n'est enregistré.
 */
export const fallbackThemeKit: ThemeKit = {
  resolve(_theme: ThemeId, kind: ObjectKind): PrimitiveDescriptor {
    const fp = footprint(kind);
    return {
      shape: "box",
      size: { x: fp.x, y: KIND_HEIGHT[kind], z: fp.z },
      color: KIND_COLOR[kind],
    };
  },
  footprint,
};

/**
 * Résout le descripteur de rendu d'un couple `(theme, kind)` : le kit concret du
 * thème s'il est enregistré, sinon le repli. C'est le SEUL point d'accès aux thèmes
 * pour la scène — elle ne connaît jamais une implémentation nommée.
 */
export function resolveDescriptor(theme: ThemeId, kind: ObjectKind): PrimitiveDescriptor {
  return (getThemeKit(theme) ?? fallbackThemeKit).resolve(theme, kind);
}
