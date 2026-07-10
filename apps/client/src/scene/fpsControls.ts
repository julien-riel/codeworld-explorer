/**
 * Cœur PUR des contrôles FPS (PRD §9.2) : intégration du déplacement, confinement à
 * la salle courante et détection de franchissement des portails. Aucune dépendance à
 * three ni à React — ces fonctions sont testables en isolation et pilotées par le
 * composant `Camera`, qui n'y ajoute que les entrées (clavier/souris) et l'écriture
 * de la pose transitoire.
 *
 * Repère MONDE en unités de scène (mètres). Les salles flottent dans le vide à des
 * niveaux différents ; les portails sont des liens LOGIQUES entre salles distantes,
 * pas des murs mitoyens. Franchir un portail TÉLÉPORTE donc vers la salle voisine
 * (le composant appelle `requestTeleport`), il ne fait pas marcher d'une salle à
 * l'autre.
 */

import type { SpatialNode } from "@codeworld/world-schema";
import { mmToSceneUnits, type CameraPose } from "../state/store";
import { orientationToYaw, rotateByOrientation, thresholdPoint } from "./roomGeometry";

/** Hauteur d'œil du joueur au-dessus du sol de la salle (unités de scène ≈ 1,6 m). */
export const EYE_HEIGHT = 1.6;

/** Retrait des murs : demi-largeur du joueur, pour ne pas traverser la paroi. */
export const PLAYER_INSET = 0.6;

/** Profondeur (unités) sous laquelle, aligné à une ouverture et poussant dehors, on franchit. */
export const DOOR_TRIGGER_DEPTH = 1.2;

/** Tangage maximal (radians) : évite de basculer la caméra au-delà de la verticale. */
export const MAX_PITCH = Math.PI / 2 - 0.05;

/** Touches de déplacement pressées à un instant donné. */
export interface MoveInput {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
}

/** Aucune touche pressée. */
export const NO_INPUT: MoveInput = { forward: false, backward: false, left: false, right: false };

/** `true` si au moins une direction est demandée. */
export function isMoving(input: MoveInput): boolean {
  return input.forward || input.backward || input.left || input.right;
}

/** Borne le tangage dans `[-MAX_PITCH, MAX_PITCH]`. */
export function clampPitch(pitch: number): number {
  return Math.min(MAX_PITCH, Math.max(-MAX_PITCH, pitch));
}

/**
 * Déplacement horizontal (dx, dz) pour un lacet et un jeu de touches, normalisé puis
 * mis à l'échelle par `distance`. Dans three, au lacet `θ`, l'avant `(0,0,−1)` pointe
 * vers `(−sinθ, −cosθ)` et la droite `(1,0,0)` vers `(cosθ, −sinθ)`.
 */
export function moveDelta(yaw: number, input: MoveInput, distance: number): { dx: number; dz: number } {
  const sinY = Math.sin(yaw);
  const cosY = Math.cos(yaw);
  const fx = -sinY;
  const fz = -cosY;
  const rx = cosY;
  const rz = -sinY;
  let vx = 0;
  let vz = 0;
  if (input.forward) {
    vx += fx;
    vz += fz;
  }
  if (input.backward) {
    vx -= fx;
    vz -= fz;
  }
  if (input.right) {
    vx += rx;
    vz += rz;
  }
  if (input.left) {
    vx -= rx;
    vz -= rz;
  }
  const len = Math.hypot(vx, vz);
  if (len === 0) return { dx: 0, dz: 0 };
  return { dx: (vx / len) * distance, dz: (vz / len) * distance };
}

/** Bornes AABB monde (unités de scène) du volume marchable d'une salle. */
export interface RoomAabb {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/**
 * AABB monde d'une salle, retirée de `inset`. Une orientation impaire (1/3) échange
 * largeur et profondeur ; comme l'orientation est un multiple de 90°, la boîte reste
 * alignée sur les axes monde.
 */
export function roomAabb(room: SpatialNode, inset: number = PLAYER_INSET): RoomAabb {
  const cx = mmToSceneUnits(room.position.x);
  const cz = mmToSceneUnits(room.position.z);
  const swap = room.orientation === 1 || room.orientation === 3;
  const halfX = mmToSceneUnits(swap ? room.dimensions.z : room.dimensions.x) / 2;
  const halfZ = mmToSceneUnits(swap ? room.dimensions.x : room.dimensions.z) / 2;
  const hx = Math.max(0, halfX - inset);
  const hz = Math.max(0, halfZ - inset);
  return { minX: cx - hx, maxX: cx + hx, minZ: cz - hz, maxZ: cz + hz };
}

/** Ramène `(x, z)` dans l'AABB (confinement à la salle courante). */
export function confineToAabb(x: number, z: number, aabb: RoomAabb): { x: number; z: number } {
  return {
    x: Math.min(aabb.maxX, Math.max(aabb.minX, x)),
    z: Math.min(aabb.maxZ, Math.max(aabb.minZ, z)),
  };
}

/** Ouverture d'un portail projetée en repère MONDE (unités de scène). */
export interface WorldGate {
  toSpatialNodeId: string;
  /** Extrémités de l'ouverture le long du mur. */
  ax: number;
  az: number;
  bx: number;
  bz: number;
  /** Centre de l'ouverture. */
  mx: number;
  mz: number;
  /** Normale sortante unitaire (vers l'extérieur de la salle). */
  nx: number;
  nz: number;
}

/** Projette les ouvertures de portail d'une salle en repère MONDE (unités de scène). */
export function roomGates(room: SpatialNode): WorldGate[] {
  const w = room.dimensions.x;
  const d = room.dimensions.z;
  const cx = mmToSceneUnits(room.position.x);
  const cz = mmToSceneUnits(room.position.z);
  const toWorld = (pt: { x: number; z: number }): { x: number; z: number } => {
    const r = rotateByOrientation(pt.x, pt.z, room.orientation);
    return { x: mmToSceneUnits(r.x + room.position.x), z: mmToSceneUnits(r.z + room.position.z) };
  };
  return room.portals.map((p) => {
    const a = toWorld(thresholdPoint(p.wall, p.offset - p.width / 2, w, d));
    const b = toWorld(thresholdPoint(p.wall, p.offset + p.width / 2, w, d));
    const mx = (a.x + b.x) / 2;
    const mz = (a.z + b.z) / 2;
    let nx = -(b.z - a.z);
    let nz = b.x - a.x;
    const nlen = Math.hypot(nx, nz) || 1;
    nx /= nlen;
    nz /= nlen;
    // Oriente la normale vers l'extérieur (à l'opposé du centre de la salle).
    if ((mx - cx) * nx + (mz - cz) * nz < 0) {
      nx = -nx;
      nz = -nz;
    }
    return { toSpatialNodeId: p.toSpatialNodeId, ax: a.x, az: a.z, bx: b.x, bz: b.z, mx, mz, nx, nz };
  });
}

/**
 * Rend le `toSpatialNodeId` du portail franchi si la position `(px, pz)` est alignée à
 * son ouverture, proche du mur et poussée vers l'extérieur (dx, dz) ; sinon `null`.
 */
export function gateAt(
  gates: readonly WorldGate[],
  px: number,
  pz: number,
  dx: number,
  dz: number,
): string | null {
  for (const g of gates) {
    const sx = g.bx - g.ax;
    const sz = g.bz - g.az;
    const segLen2 = sx * sx + sz * sz;
    if (segLen2 === 0) continue;
    const t = ((px - g.ax) * sx + (pz - g.az) * sz) / segLen2;
    if (t < -0.05 || t > 1.05) continue; // hors de la largeur de l'ouverture
    const perp = (px - g.mx) * g.nx + (pz - g.mz) * g.nz; // distance au-delà du mur
    if (perp < -DOOR_TRIGGER_DEPTH) continue; // encore loin à l'intérieur
    if (dx * g.nx + dz * g.nz <= 0) continue; // ne pousse pas vers la sortie
    return g.toSpatialNodeId;
  }
  return null;
}

/** Résultat d'un pas de déplacement : nouvelle position + salle voisine à rejoindre. */
export interface MovementResult {
  position: [number, number, number];
  /** `toSpatialNodeId` si un portail a été franchi (téléportation à déclencher), sinon `null`. */
  crossedInto: string | null;
}

/**
 * Un pas d'intégration : avance de `speed·dt` selon les touches, confine à la salle,
 * et signale un franchissement de portail le cas échéant. Fonction PURE (cœur testé
 * séparément de R3F).
 */
export function resolveMovement(
  position: readonly [number, number, number],
  yaw: number,
  input: MoveInput,
  dt: number,
  speedUnitsPerSec: number,
  room: SpatialNode,
): MovementResult {
  const distance = speedUnitsPerSec * dt;
  const { dx, dz } = moveDelta(yaw, input, distance);
  const aabb = roomAabb(room);
  const confined = confineToAabb(position[0] + dx, position[2] + dz, aabb);
  const crossedInto = gateAt(roomGates(room), confined.x, confined.z, dx, dz);
  return { position: [confined.x, position[1], confined.z], crossedInto };
}

/** Lacet pour regarder de `(x, z)` vers `(tx, tz)` (repère three, avant `= −z` au lacet 0). */
export function lookAtYaw(x: number, z: number, tx: number, tz: number): number {
  const dx = tx - x;
  const dz = tz - z;
  if (dx === 0 && dz === 0) return 0;
  return Math.atan2(-dx, -dz);
}

/** Position MONDE (x, z, unités de scène) d'un objet fichier d'une salle, ou `null`. */
export function objectWorldXZ(room: SpatialNode, sourceNodeId: string): { x: number; z: number } | null {
  for (const object of room.objects) {
    if (object.sourceNodeId !== sourceNodeId) continue;
    const r = rotateByOrientation(object.position.x, object.position.z, room.orientation);
    return {
      x: mmToSceneUnits(r.x + room.position.x),
      z: mmToSceneUnits(r.z + room.position.z),
    };
  }
  return null;
}

/**
 * Pose d'apparition dans une salle : au centre-sol, à hauteur d'œil, tournée vers
 * `faceTarget` si fourni (par ex. le fichier ouvert), sinon selon l'orientation.
 */
export function spawnPose(room: SpatialNode, faceTarget?: { x: number; z: number }): CameraPose {
  const x = mmToSceneUnits(room.position.x);
  const z = mmToSceneUnits(room.position.z);
  const y = mmToSceneUnits(room.position.y) + EYE_HEIGHT;
  const yaw =
    faceTarget === undefined ? orientationToYaw(room.orientation) : lookAtYaw(x, z, faceTarget.x, faceTarget.z);
  return { position: [x, y, z], yaw, pitch: 0 };
}

/** Dimensions monde (largeur, profondeur, unités de scène) du sol d'une salle. */
export function roomFloorSize(room: SpatialNode): { width: number; depth: number } {
  const swap = room.orientation === 1 || room.orientation === 3;
  return {
    width: mmToSceneUnits(swap ? room.dimensions.z : room.dimensions.x),
    depth: mmToSceneUnits(swap ? room.dimensions.x : room.dimensions.z),
  };
}
