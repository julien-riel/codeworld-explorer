/**
 * Étiquette de survol : un SPRITE (billboard) portant le nom du fichier survolé.
 * Pas de DOM (contrainte PRD §11.3) — le texte est peint sur un canvas hors-écran et
 * appliqué en texture. Le composant n'est monté QUE lorsqu'un objet est survolé ; en
 * environnement sans `document` (tests Node), il ne rend rien.
 */

import { useEffect, useMemo, type ReactElement } from "react";
import { CanvasTexture, LinearFilter, Sprite, SpriteMaterial } from "three";
import { PALETTE } from "../palette";

const CANVAS_W = 512;
const CANVAS_H = 128;
/** Hauteur du sprite en unités de scène ; la largeur suit le ratio du canvas. */
const LABEL_HEIGHT = 0.9;
/** Décalage vertical au-dessus du point de contact au sol de l'objet (unités). */
const LABEL_LIFT = 3.4;

/** Peint le nom sur un canvas et renvoie une texture, ou `null` sans `document`. */
function makeTextTexture(text: string): CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  const ctx = canvas.getContext("2d");
  if (ctx === null) return null;

  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  // Pastille de fond arrondie pour la lisibilité (contraste texte/fond, PRD §23.2).
  ctx.fillStyle = PALETTE.surfaceRaised;
  const r = 24;
  ctx.beginPath();
  ctx.moveTo(r, 8);
  ctx.arcTo(CANVAS_W - 8, 8, CANVAS_W - 8, CANVAS_H - 8, r);
  ctx.arcTo(CANVAS_W - 8, CANVAS_H - 8, 8, CANVAS_H - 8, r);
  ctx.arcTo(8, CANVAS_H - 8, 8, 8, r);
  ctx.arcTo(8, 8, CANVAS_W - 8, 8, r);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = PALETTE.border;
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.fillStyle = PALETTE.textPrimary;
  ctx.font = "600 52px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  // Nom tronqué s'il déborde (évite un texte illisible).
  const label = text.length > 26 ? `${text.slice(0, 25)}…` : text;
  ctx.fillText(label, CANVAS_W / 2, CANVAS_H / 2, CANVAS_W - 40);

  const texture = new CanvasTexture(canvas);
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  return texture;
}

/** Props de `HoverLabel`. */
export interface HoverLabelProps {
  /** Point de contact au sol de l'objet survolé (unités de scène). */
  position: readonly [number, number, number];
  text: string;
}

/** Sprite d'étiquette au-dessus de l'objet survolé. */
export function HoverLabel({ position, text }: HoverLabelProps): ReactElement | null {
  const sprite = useMemo(() => {
    const texture = makeTextTexture(text);
    if (texture === null) return null;
    const material = new SpriteMaterial({ map: texture, transparent: true, depthTest: false });
    const s = new Sprite(material);
    s.scale.set((LABEL_HEIGHT * CANVAS_W) / CANVAS_H, LABEL_HEIGHT, 1);
    // Rendu par-dessus la scène pour rester lisible même derrière un mur proche.
    s.renderOrder = 999;
    return s;
  }, [text]);

  useEffect(() => {
    return () => {
      if (sprite === null) return;
      const mat = sprite.material;
      mat.map?.dispose();
      mat.dispose();
    };
  }, [sprite]);

  if (sprite === null) return null;
  return (
    <primitive object={sprite} position={[position[0], position[1] + LABEL_LIFT, position[2]]} />
  );
}
