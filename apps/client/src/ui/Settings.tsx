/**
 * Panneau d'options de confort et d'accessibilité (PRD §9.4, §17.3, §23).
 *
 * Arbre 2D CLASSIQUE (hors `<Canvas>`) : il n'écrit QUE des préférences dans le store,
 * qui les persiste par dépôt/commit (FR-022) ; la scène et la caméra en dérivent leur
 * comportement (`state/preferences.ts`). Aucun rendu three ici.
 *
 * Préférences pilotées : réduction des mouvements, transitions animées, vitesse de
 * déplacement, qualité visuelle et mode « sans déplacement libre » (§23.1).
 */

import type { ReactElement } from "react";
import {
  MAX_MOVE_SPEED,
  MIN_MOVE_SPEED,
  usePreferences,
  useSettingsOpen,
  useWorldStore,
  type VisualQuality,
} from "../state/store";
import { transitionsActive } from "../state/preferences";
import { ChoiceRow, SliderRow, ToggleRow } from "./SettingsRows";

const QUALITY_OPTIONS: readonly { value: VisualQuality; label: string }[] = [
  { value: "low", label: "Basse" },
  { value: "medium", label: "Moyenne" },
  { value: "high", label: "Élevée" },
];

/** Formate le multiplicateur de vitesse en libellé lisible : `1×`, `1.5×`, `0.25×`. */
function speedText(value: number): string {
  return `${value.toString()}×`;
}

export function Settings(): ReactElement | null {
  const open = useSettingsOpen();
  const prefs = usePreferences();
  const setReduceMotion = useWorldStore((s) => s.setReduceMotion);
  const setTransitionsEnabled = useWorldStore((s) => s.setTransitionsEnabled);
  const setMoveSpeed = useWorldStore((s) => s.setMoveSpeed);
  const setVisualQuality = useWorldStore((s) => s.setVisualQuality);
  const setFreeMovement = useWorldStore((s) => s.setFreeMovement);
  const setSettingsOpen = useWorldStore((s) => s.setSettingsOpen);

  if (!open) return null;

  // État DÉRIVÉ : la réduction des mouvements force les transitions à off (§17.3).
  const motionForcesTransitionsOff = !transitionsActive(prefs) && prefs.transitionsEnabled;

  return (
    <aside
      className="cw-panel cw-settings"
      role="dialog"
      aria-label="Options de confort et d'accessibilité"
      data-reduce-motion={prefs.reduceMotion ? "true" : "false"}
    >
      <header className="cw-settings-head">
        <h2>Options</h2>
        <button
          type="button"
          className="cw-btn"
          onClick={() => {
            setSettingsOpen(false);
          }}
          aria-label="Fermer les options"
        >
          <span aria-hidden="true">✕</span>
        </button>
      </header>

      <div className="cw-settings-body">
        <ToggleRow
          id="cw-pref-reduce-motion"
          label="Réduction des mouvements"
          checked={prefs.reduceMotion}
          onChange={setReduceMotion}
          hint="Supprime le balancement de caméra et les transitions animées non essentielles."
        />

        <ToggleRow
          id="cw-pref-transitions"
          label="Transitions animées"
          checked={prefs.transitionsEnabled}
          onChange={setTransitionsEnabled}
          hint={
            motionForcesTransitionsOff
              ? "Désactivées par la réduction des mouvements."
              : "Glissement fluide lors des déplacements et téléportations."
          }
        />

        <ToggleRow
          id="cw-pref-free-movement"
          label="Déplacement libre"
          checked={prefs.freeMovement}
          onChange={setFreeMovement}
          hint={
            prefs.freeMovement
              ? "Contrôles FPS (clavier/souris, clic au sol) actifs."
              : "Mode sans déplacement libre : naviguez par mini-carte, recherche et fil d'Ariane."
          }
        />

        <SliderRow
          id="cw-pref-move-speed"
          label="Vitesse de déplacement"
          value={prefs.moveSpeed}
          min={MIN_MOVE_SPEED}
          max={MAX_MOVE_SPEED}
          step={0.25}
          valueText={speedText(prefs.moveSpeed)}
          onChange={setMoveSpeed}
        />

        <ChoiceRow
          legend="Qualité visuelle"
          name="cw-pref-visual-quality"
          value={prefs.visualQuality}
          options={QUALITY_OPTIONS}
          onChange={setVisualQuality}
        />
      </div>
    </aside>
  );
}
