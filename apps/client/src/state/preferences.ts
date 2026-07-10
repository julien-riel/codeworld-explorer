/**
 * État de confort DÉRIVÉ des préférences (PRD §9.4, §17.3, §23).
 *
 * Fonctions PURES, sans dépendance à React ni au store : la scène, la caméra et
 * l'overlay 2D consomment ces booléens dérivés plutôt que de réinterpréter les
 * préférences brutes chacun de leur côté. Les deux règles d'accessibilité sensibles
 * sont donc encodées UNE seule fois, ici :
 *  - §17.3 « le mode réduction des mouvements retire les transitions animées non
 *    essentielles » → `transitionsActive` combine `transitionsEnabled` ET `reduceMotion` ;
 *  - §23.1 « mode sans déplacement libre » → `fpsControlsEnabled` reflète `freeMovement`,
 *    l'état lu par la caméra pour couper les contrôles FPS.
 */

import type { Preferences, VisualQuality } from "./store";

/**
 * Les transitions animées sont-elles effectivement actives ? La réduction des
 * mouvements les coupe même si elles restent « activées » dans les préférences
 * (§17.3) : les deux conditions doivent être vraies.
 */
export function transitionsActive(p: Preferences): boolean {
  return p.transitionsEnabled && !p.reduceMotion;
}

/** Le balancement/lissage de caméra est-il autorisé ? Coupé par la réduction des mouvements. */
export function cameraSwayEnabled(p: Preferences): boolean {
  return !p.reduceMotion;
}

/**
 * Les contrôles FPS (déplacement libre) sont-ils actifs ? Le mode « sans déplacement
 * libre » les désactive : la caméra ne bouge alors plus qu'au gré des téléportations
 * déclenchées par la mini-carte, la recherche ou la liste hiérarchique (§23.1).
 */
export function fpsControlsEnabled(p: Preferences): boolean {
  return p.freeMovement;
}

/** État de confort dérivé, agrégé pour les consommateurs (scène, caméra, overlay). */
export interface Comfort {
  /** Transitions animées effectivement actives. */
  transitionsActive: boolean;
  /** Balancement/lissage de caméra autorisé. */
  cameraSwayEnabled: boolean;
  /** Contrôles FPS (déplacement libre) actifs. */
  fpsControlsEnabled: boolean;
  /** Multiplicateur de vitesse de déplacement. */
  moveSpeed: number;
  /** Niveau de qualité visuelle. */
  visualQuality: VisualQuality;
}

/** Projette des préférences en leur état de confort dérivé. Fonction PURE. */
export function deriveComfort(p: Preferences): Comfort {
  return {
    transitionsActive: transitionsActive(p),
    cameraSwayEnabled: cameraSwayEnabled(p),
    fpsControlsEnabled: fpsControlsEnabled(p),
    moveSpeed: p.moveSpeed,
    visualQuality: p.visualQuality,
  };
}
