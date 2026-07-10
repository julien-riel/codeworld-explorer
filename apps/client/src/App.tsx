/**
 * Ossature de l'application (PRD §11.3, §19.4). Elle monte les DEUX ARBRES FRÈRES,
 * jamais imbriqués l'un dans l'autre :
 *  - la SCÈNE R3F (`<Scene>` + contrôles `<Camera>`) DANS `<Canvas>` — que du three ;
 *  - l'INTERFACE 2D (`<Hud>`) HORS du `<Canvas>` — que du DOM.
 * Ils ne communiquent que par le store Zustand. Galerie, écran de refus de version
 * (FR-027), orientation et panneau de code sont routés par `<Hud>` ; la scène rend le
 * monde quand il est prêt et se limite aux lumières sinon.
 *
 * Le verrouillage du pointeur (regard souris FPS) est demandé quand un clic tombe dans
 * le vide (`onPointerMissed`) alors qu'un monde est chargé ; les clics sur un objet, un
 * portail ou le sol sont interceptés par la scène et ne verrouillent pas.
 */

import { useCallback, useEffect, useRef, type ReactElement } from "react";
import { Canvas } from "@react-three/fiber";
import { useWorldStore } from "./state/store";
import { PALETTE } from "./palette";
import { Scene } from "./scene/Scene";
import { Camera } from "./scene/Camera";
import { Hud } from "./ui/Hud";
import { PerfProbe } from "./perf/PerfProbe";
import { PerfOverlay } from "./perf/PerfOverlay";

export function App(): ReactElement {
  const loadGalleryData = useWorldStore((s) => s.loadGalleryData);
  const canvasElRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    void loadGalleryData();
  }, [loadGalleryData]);

  // Clic dans le vide + monde chargé → verrouille le pointeur pour le regard souris.
  const handlePointerMissed = useCallback(() => {
    if (useWorldStore.getState().worldStatus !== "ready") return;
    const el = canvasElRef.current;
    if (el === null) return;
    try {
      void el.requestPointerLock();
    } catch {
      // Verrouillage indisponible (permission, navigateur) : le regard souris est simplement inactif.
    }
  }, []);

  return (
    <>
      {/* Arbre SCÈNE : uniquement du three, aucun DOM. */}
      <Canvas
        camera={{ position: [0, 1.6, 0], fov: 70, near: 0.1, far: 4000 }}
        style={{ position: "fixed", inset: 0, background: PALETTE.void }}
        onCreated={({ gl }) => {
          canvasElRef.current = gl.domElement;
        }}
        onPointerMissed={handlePointerMissed}
      >
        <Scene />
        <Camera />
        {/* Sonde de perf : lit renderer.info à chaque image, ne rend rien (PRD §9.5). */}
        <PerfProbe />
      </Canvas>

      {/* Arbre INTERFACE 2D : uniquement du DOM, superposé au canvas. */}
      <Hud />
      {/* Overlay de debug des budgets de rendu, activable par F3 (hors <Canvas>). */}
      <PerfOverlay />
    </>
  );
}
