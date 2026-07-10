/**
 * Sonde de performance, composant de SCÈNE (dans `<Canvas>`). Elle ne rend RIEN
 * (`return null`) : à chaque image, elle lit `renderer.info` (draw calls, triangles…)
 * et alimente le FPS glissant, puis publie l'échantillon dans le conteneur transitoire
 * (`commitPerfSample`) SANS `setState` — aucun re-render, aucun coût de framerate
 * (PRD §9.5, §11.3). L'overlay 2D lit ce conteneur de son côté.
 *
 * Contrainte dure (PRD §11.3, §19.4) : composant three PUR, aucun DOM.
 */

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { commitPerfSample, FpsMeter, readRendererInfo } from "./monitor";

/** Alimente le moniteur à chaque image. Ne monte aucun objet visible. */
export function PerfProbe(): null {
  const meter = useRef<FpsMeter>(new FpsMeter());

  useFrame((state, delta) => {
    meter.current.sample(delta);
    // `renderer.info` est remis à zéro au début de chaque rendu (r3f) : lu ici, il
    // porte les compteurs de l'image PRÉCÉDENTE complète.
    commitPerfSample(readRendererInfo(state.gl.info), meter.current.fps());
  });

  return null;
}
