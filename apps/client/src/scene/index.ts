/**
 * Points d'intégration de la SCÈNE 3D. L'intégrateur monte `<Scene>` À L'INTÉRIEUR
 * d'un `<Canvas>` et câble la caméra FPS séparément ; il n'a besoin de rien d'autre
 * d'ici. Les helpers PURS (zone, géométrie, instances) et le kit de repli sont
 * exposés pour test et réutilisation.
 */

export { Scene } from "./Scene";
export { Camera } from "./Camera";
export { Room, type RoomProps } from "./Room";
export { Portals, type PortalsProps } from "./Portals";
export { FileObjects, type FileObjectsProps } from "./FileObjects";

export { computeActiveZone, type ActiveZone } from "./zoneLoading";
export {
  groupFileObjects,
  type FileInstance,
  type FileObjectGroup,
} from "./instancing";
export {
  orientationToYaw,
  rotateByOrientation,
  thresholdPoint,
  wallLength,
  wallAxis,
  wallPanels,
  WALL_RANK,
  type WallOpening,
  type WallPanel,
} from "./roomGeometry";
export { resolveDescriptor, fallbackThemeKit } from "./themeFallback";
export { geometryFromDescriptor } from "./primitives";

export {
  moveDelta,
  confineToAabb,
  roomAabb,
  roomGates,
  gateAt,
  resolveMovement,
  spawnPose,
  lookAtYaw,
  objectWorldXZ,
  roomFloorSize,
  clampPitch,
  isMoving,
  EYE_HEIGHT,
  PLAYER_INSET,
  type MoveInput,
  type MovementResult,
  type RoomAabb,
  type WorldGate,
} from "./fpsControls";
