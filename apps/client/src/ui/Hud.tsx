/**
 * Conteneur de l'overlay 2D (PRD §11.3, §19.4).
 *
 * Arbre React CLASSIQUE superposé au canvas, HORS du <Canvas> : il ne rend jamais
 * d'objet three et ne communique avec la scène que par le store. Sa racine laisse
 * PASSER les clics (`pointer-events: none`) ; seuls ses panneaux les captent (classes
 * `.cw-panel`/`.cw-bar`/`.cw-screen`), pour que la scène reçoive les clics ailleurs.
 *
 * Il aiguille aussi l'écran de plus haut niveau : galerie (aucun monde), écran de refus
 * (FR-027), ou l'interface en-monde (orientation, fil d'Ariane, panneau de code).
 */

import type { ReactElement } from "react";
import { useWorldError, useWorldStatus, useWorldStore } from "../state/store";
import { paletteCssVars } from "./cssVars";
import { useWorld } from "./hooks";
import { Gallery } from "./Gallery";
import { VersionError } from "./VersionError";
import { OrientationBar } from "./OrientationBar";
import { Breadcrumb } from "./Breadcrumb";
import { CodePanel } from "./CodePanel";
import { SearchPanel } from "./SearchPanel";
import { Settings } from "./Settings";
import { Minimap } from "./Minimap";
import "./hud.css";

/** Interface affichée à l'intérieur d'un monde chargé. */
function InWorldHud(): ReactElement {
  return (
    <>
      <OrientationBar />
      <Breadcrumb />
      <SearchPanel />
      <CodePanel />
      <Settings />
      <Minimap />
    </>
  );
}

export function Hud(): ReactElement {
  const status = useWorldStatus();
  const worldError = useWorldError();
  const world = useWorld();
  const closeWorld = useWorldStore((s) => s.closeWorld);

  let screen: ReactElement;
  if (status === "error" && worldError !== null) {
    screen = <VersionError error={worldError} onDismiss={closeWorld} />;
  } else if (status === "loading") {
    screen = (
      <div className="cw-screen" aria-live="polite">
        <p className="cw-muted">Chargement du monde…</p>
      </div>
    );
  } else if (status === "ready" && world !== null) {
    screen = <InWorldHud />;
  } else {
    screen = <Gallery />;
  }

  return (
    <div className="cw-hud" style={paletteCssVars()}>
      {screen}
    </div>
  );
}
