/**
 * Contrôles FPS (PRD §9.2, §9.5, §11.3). Composant de SCÈNE (dans `<Canvas>`) : il ne
 * rend AUCUN DOM et ne partage la caméra avec l'interface 2D que par le store.
 *
 * ── Pose HORS de React ──
 * La pose caméra est mutée à chaque image dans le conteneur transitoire du store
 * (`getCameraPose`), jamais par un `setState` qui re-rendrait l'UI 2D. Les entrées
 * (clavier, souris) vivent dans des refs ; les tranches discrètes du store (salle
 * courante, préférences, téléportation) sont lues par sélecteurs FINS et recopiées
 * dans des refs pour la boucle `useFrame`.
 *
 * ── Contrôles ──
 * WASD/flèches déplacent à `layout.normalSpeed` × `moveSpeed`, confinés à la salle
 * courante ; franchir un portail téléporte vers la salle voisine. La souris regarde
 * sous verrouillage du pointeur. Un clic sur le sol (point-and-click) glisse vers la
 * destination visée.
 */

import { useEffect, useRef, type ReactElement } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import type { Camera as ThreeCamera } from "three";
import type { SpatialNode } from "@codeworld/world-schema";
import type { WorldIndex } from "../state/selectors";
import {
  getCameraPose,
  mmToSceneUnits,
  useWorldStore,
  type Preferences,
} from "../state/store";
import { fpsControlsEnabled, transitionsActive } from "../state/preferences";
import {
  clampPitch,
  confineToAabb,
  isMoving,
  objectWorldXZ,
  resolveMovement,
  roomAabb,
  roomFloorSize,
  spawnPose,
  type MoveInput,
} from "./fpsControls";

/** Sensibilité de la souris (radians par pixel). */
const LOOK_SENSITIVITY = 0.0022;

/** Applique la pose transitoire à la caméra three (lacet puis tangage, ordre FPS). */
function applyPose(
  camera: ThreeCamera,
  position: readonly [number, number, number],
  yaw: number,
  pitch: number,
): void {
  camera.position.set(position[0], position[1], position[2]);
  camera.rotation.set(pitch, yaw, 0, "YXZ");
}

/** Table des touches → direction de déplacement. */
function keyDirection(code: string): keyof MoveInput | null {
  switch (code) {
    case "KeyW":
    case "ArrowUp":
      return "forward";
    case "KeyS":
    case "ArrowDown":
      return "backward";
    case "KeyA":
    case "ArrowLeft":
      return "left";
    case "KeyD":
    case "ArrowRight":
      return "right";
    default:
      return null;
  }
}

/** Contrôleur caméra FPS. Ne rend qu'un plan invisible de sol pour le point-and-click. */
export function Camera(): ReactElement | null {
  const camera = useThree((s) => s.camera);
  const domElement = useThree((s) => s.gl.domElement) as HTMLElement | undefined;

  // ── Tranches discrètes du store (re-rendus rares) recopiées dans des refs ──
  const index = useWorldStore((s) => s.worldIndex);
  const currentId = useWorldStore((s) => s.currentSpatialNodeId);
  const preferences = useWorldStore((s) => s.preferences);
  const pendingTeleport = useWorldStore((s) => s.pendingTeleport);
  const normalSpeed = useWorldStore((s) => s.world?.layout.normalSpeed ?? 6000);

  const room: SpatialNode | null =
    index !== null && currentId !== null ? (index.spatialById.get(currentId) ?? null) : null;

  const roomRef = useRef<SpatialNode | null>(room);
  const indexRef = useRef<WorldIndex | null>(index);
  const prefsRef = useRef<Preferences>(preferences);
  const speedRef = useRef<number>(normalSpeed);
  roomRef.current = room;
  indexRef.current = index;
  prefsRef.current = preferences;
  speedRef.current = normalSpeed;

  // ── Refs transitoires (jamais dans le store, jamais de re-render) ──
  const inputRef = useRef<MoveInput>({ forward: false, backward: false, left: false, right: false });
  const walkTargetRef = useRef<{ x: number; z: number } | null>(null);
  const lockedRef = useRef<boolean>(false);

  // ── Clavier : met à jour les touches pressées ; annule le point-and-click en cours ──
  useEffect(() => {
    if (typeof window === "undefined") return;
    const setKey = (code: string, pressed: boolean): boolean => {
      const dir = keyDirection(code);
      if (dir === null) return false;
      inputRef.current[dir] = pressed;
      if (pressed) walkTargetRef.current = null;
      return true;
    };
    const onDown = (e: KeyboardEvent): void => {
      if (setKey(e.code, true)) e.preventDefault();
    };
    const onUp = (e: KeyboardEvent): void => {
      if (setKey(e.code, false)) e.preventDefault();
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, []);

  // ── Souris : regard sous verrouillage du pointeur ──
  useEffect(() => {
    if (domElement === undefined || typeof document === "undefined") return;
    const onMove = (e: MouseEvent): void => {
      if (!lockedRef.current) return;
      const pose = getCameraPose();
      pose.yaw -= e.movementX * LOOK_SENSITIVITY;
      pose.pitch = clampPitch(pose.pitch - e.movementY * LOOK_SENSITIVITY);
    };
    const onLockChange = (): void => {
      lockedRef.current = document.pointerLockElement === domElement;
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("pointerlockchange", onLockChange);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("pointerlockchange", onLockChange);
    };
  }, [domElement]);

  // ── Téléportation : repositionne la caméra au centre de la salle cible, puis consomme ──
  useEffect(() => {
    if (pendingTeleport === null) return;
    const idx = indexRef.current;
    const clear = useWorldStore.getState().clearTeleport;
    if (idx === null) {
      clear();
      return;
    }
    const target = idx.spatialById.get(pendingTeleport.spatialNodeId);
    if (target === undefined) {
      clear();
      return;
    }
    const faceId = pendingTeleport.selectedFileNodeId;
    const face = faceId === null ? undefined : (objectWorldXZ(target, faceId) ?? undefined);
    const pose = spawnPose(target, face);
    const cur = getCameraPose();
    cur.position[0] = pose.position[0];
    cur.position[1] = pose.position[1];
    cur.position[2] = pose.position[2];
    cur.yaw = pose.yaw;
    cur.pitch = pose.pitch;
    walkTargetRef.current = null;
    clear();
  }, [pendingTeleport]);

  // ── Boucle de rendu : intègre le déplacement et applique la pose (jamais de setState) ──
  useFrame((_, delta) => {
    const pose = getCameraPose();
    const current = roomRef.current;
    // Borne le pas de temps : un onglet regelé ne doit pas téléporter le joueur.
    const dt = Math.min(delta, 0.05);

    // Mode « sans déplacement libre » (PRD §23.1) : la caméra ne bouge plus qu'aux
    // téléportations (mini-carte, recherche, liste). On coupe donc l'intégration FPS.
    if (current !== null && fpsControlsEnabled(prefsRef.current)) {
      const speed = mmToSceneUnits(speedRef.current) * prefsRef.current.moveSpeed;
      const input = inputRef.current;

      if (isMoving(input)) {
        walkTargetRef.current = null;
        const res = resolveMovement(pose.position, pose.yaw, input, dt, speed, current);
        pose.position[0] = res.position[0];
        pose.position[1] = res.position[1];
        pose.position[2] = res.position[2];
        if (res.crossedInto !== null) {
          useWorldStore.getState().requestTeleport({ kind: "room", spatialNodeId: res.crossedInto });
        }
      } else if (walkTargetRef.current !== null) {
        // Transitions coupées (réduction des mouvements OU transitions désactivées) → saut instantané.
        const reached = stepTowardTarget(
          pose,
          walkTargetRef.current,
          speed,
          dt,
          current,
          !transitionsActive(prefsRef.current),
        );
        if (reached) walkTargetRef.current = null;
      }
    }

    applyPose(camera, pose.position, pose.yaw, pose.pitch);
  });

  if (room === null) return null;

  // Plan invisible au sol de la salle courante : capte les clics « aller ici ».
  const size = roomFloorSize(room);
  const floorY = mmToSceneUnits(room.position.y);
  return (
    <mesh
      position={[mmToSceneUnits(room.position.x), floorY + 0.02, mmToSceneUnits(room.position.z)]}
      rotation={[-Math.PI / 2, 0, 0]}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        // Sans déplacement libre, le clic-au-sol ne glisse pas : navigation par téléportation.
        if (!fpsControlsEnabled(prefsRef.current)) return;
        walkTargetRef.current = confineToAabb(e.point.x, e.point.z, roomAabb(room));
      }}
    >
      <planeGeometry args={[size.width, size.depth]} />
      {/* Invisible mais raycastable : opacité nulle plutôt que `visible={false}`. */}
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  );
}

/**
 * Fait glisser la pose vers une cible point-and-click ; saut instantané si `instant`
 * (transitions coupées, PRD §17.3, §23.2). Retourne `true` quand la cible est atteinte.
 */
function stepTowardTarget(
  pose: { position: [number, number, number] },
  target: { x: number; z: number },
  speed: number,
  dt: number,
  room: SpatialNode,
  instant: boolean,
): boolean {
  const x = pose.position[0];
  const z = pose.position[2];
  const dx = target.x - x;
  const dz = target.z - z;
  const dist = Math.hypot(dx, dz);
  if (dist === 0) return true;
  const step = instant ? dist : speed * dt;
  const aabb = roomAabb(room);
  if (dist <= step) {
    const c = confineToAabb(target.x, target.z, aabb);
    pose.position[0] = c.x;
    pose.position[2] = c.z;
    return true;
  }
  const c = confineToAabb(x + (dx / dist) * step, z + (dz / dist) * step, aabb);
  pose.position[0] = c.x;
  pose.position[2] = c.z;
  return false;
}
