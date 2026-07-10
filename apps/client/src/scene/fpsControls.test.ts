import { describe, expect, it } from "vitest";
import { buildWorldIndex } from "../state/selectors";
import { mmToSceneUnits } from "../state/store";
import {
  clampPitch,
  confineToAabb,
  EYE_HEIGHT,
  lookAtYaw,
  MAX_PITCH,
  moveDelta,
  resolveMovement,
  roomAabb,
  roomGates,
  spawnPose,
} from "./fpsControls";
import { loadSchemaWorld } from "./schemaWorldFixture";

const world = loadSchemaWorld();
const index = buildWorldIndex(world);
const hall = index.hall;
if (hall === undefined) throw new Error("Le monde `schema` doit avoir un hall");

const NO_INPUT = { forward: false, backward: false, left: false, right: false } as const;

describe("moveDelta", () => {
  it("avance vers −z au lacet 0 (le « nord »)", () => {
    const { dx, dz } = moveDelta(0, { ...NO_INPUT, forward: true }, 6);
    expect(dx).toBeCloseTo(0, 6);
    expect(dz).toBeCloseTo(-6, 6);
  });

  it("va vers +x en pas latéral droit au lacet 0", () => {
    const { dx, dz } = moveDelta(0, { ...NO_INPUT, right: true }, 6);
    expect(dx).toBeCloseTo(6, 6);
    expect(dz).toBeCloseTo(0, 6);
  });

  it("suit le lacet : avancer à 90° pousse vers −x", () => {
    const { dx, dz } = moveDelta(Math.PI / 2, { ...NO_INPUT, forward: true }, 6);
    expect(dx).toBeCloseTo(-6, 6);
    expect(dz).toBeCloseTo(0, 6);
  });

  it("normalise les diagonales (pas plus rapide en biais)", () => {
    const { dx, dz } = moveDelta(0, { ...NO_INPUT, forward: true, right: true }, 6);
    expect(Math.hypot(dx, dz)).toBeCloseTo(6, 6);
  });

  it("ne bouge pas sans touche", () => {
    expect(moveDelta(0, NO_INPUT, 6)).toEqual({ dx: 0, dz: 0 });
  });
});

describe("clampPitch", () => {
  it("borne le tangage à ±MAX_PITCH", () => {
    expect(clampPitch(10)).toBeCloseTo(MAX_PITCH, 6);
    expect(clampPitch(-10)).toBeCloseTo(-MAX_PITCH, 6);
    expect(clampPitch(0.3)).toBeCloseTo(0.3, 6);
  });
});

describe("roomAabb", () => {
  it("centre l'AABB sur la salle et la retire des murs", () => {
    const aabb = roomAabb(hall);
    const cx = mmToSceneUnits(hall.position.x);
    const cz = mmToSceneUnits(hall.position.z);
    const halfX = mmToSceneUnits(hall.dimensions.x) / 2;
    expect((aabb.minX + aabb.maxX) / 2).toBeCloseTo(cx, 6);
    expect((aabb.minZ + aabb.maxZ) / 2).toBeCloseTo(cz, 6);
    // Retrait strictement positif : le volume marchable est plus petit que la salle.
    expect(aabb.maxX - cx).toBeLessThan(halfX);
    expect(aabb.maxX - cx).toBeGreaterThan(0);
  });
});

describe("confineToAabb", () => {
  it("ramène un point hors bornes sur le bord", () => {
    const aabb = { minX: -1, maxX: 1, minZ: -2, maxZ: 2 };
    expect(confineToAabb(5, -9, aabb)).toEqual({ x: 1, z: -2 });
    expect(confineToAabb(0, 0, aabb)).toEqual({ x: 0, z: 0 });
  });
});

describe("resolveMovement", () => {
  it("laisse la pose inchangée sans entrée", () => {
    const start: [number, number, number] = [mmToSceneUnits(hall.position.x), EYE_HEIGHT, mmToSceneUnits(hall.position.z)];
    const res = resolveMovement(start, 0, NO_INPUT, 0.1, 6, hall);
    expect(res.position).toEqual(start);
    expect(res.crossedInto).toBeNull();
  });

  it("confine le joueur dans la salle même sur un grand pas", () => {
    const start: [number, number, number] = [mmToSceneUnits(hall.position.x), EYE_HEIGHT, mmToSceneUnits(hall.position.z)];
    const aabb = roomAabb(hall);
    // Un pas énorme (100 s à 6 u/s) doit rester borné par l'AABB.
    const res = resolveMovement(start, 0, { ...NO_INPUT, forward: true }, 100, 6, hall);
    expect(res.position[0]).toBeGreaterThanOrEqual(aabb.minX);
    expect(res.position[0]).toBeLessThanOrEqual(aabb.maxX);
    expect(res.position[2]).toBeGreaterThanOrEqual(aabb.minZ);
    expect(res.position[2]).toBeLessThanOrEqual(aabb.maxZ);
    // Avancer vers le « nord » sans portail là : on colle au mur, pas de franchissement.
    expect(res.position[2]).toBeCloseTo(aabb.minZ, 6);
    expect(res.crossedInto).toBeNull();
  });

  it("franchit un portail quand on pousse dans l'ouverture", () => {
    const portalIndex = hall.portals.findIndex((p) => p.wall === "east");
    expect(portalIndex).toBeGreaterThanOrEqual(0);
    const gate = roomGates(hall)[portalIndex];
    expect(gate).toBeDefined();
    if (gate === undefined) return;
    const aabb = roomAabb(hall);
    // Placé contre le mur est, aligné au centre de la porte, poussant vers l'est.
    const start: [number, number, number] = [aabb.maxX, EYE_HEIGHT, gate.mz];
    const res = resolveMovement(start, 0, { ...NO_INPUT, right: true }, 0.1, 6, hall);
    expect(res.crossedInto).toBe(hall.portals[portalIndex]?.toSpatialNodeId);
  });

  it("ne franchit pas un mur plein hors de toute porte", () => {
    const aabb = roomAabb(hall);
    // Contre le mur est mais loin de l'ouverture : on reste bloqué, aucun franchissement.
    const start: [number, number, number] = [aabb.maxX, EYE_HEIGHT, aabb.maxZ];
    const res = resolveMovement(start, 0, { ...NO_INPUT, right: true }, 0.1, 6, hall);
    expect(res.crossedInto).toBeNull();
  });
});

describe("spawnPose", () => {
  it("place la caméra au centre-sol à hauteur d'œil", () => {
    const pose = spawnPose(hall);
    expect(pose.position[0]).toBeCloseTo(mmToSceneUnits(hall.position.x), 6);
    expect(pose.position[2]).toBeCloseTo(mmToSceneUnits(hall.position.z), 6);
    expect(pose.position[1]).toBeCloseTo(mmToSceneUnits(hall.position.y) + EYE_HEIGHT, 6);
    expect(pose.pitch).toBe(0);
  });

  it("oriente vers une cible fournie", () => {
    const x = mmToSceneUnits(hall.position.x);
    const z = mmToSceneUnits(hall.position.z);
    // Cible à l'est : le lacet doit regarder vers +x (avant = (−sinθ, −cosθ)).
    const pose = spawnPose(hall, { x: x + 10, z });
    expect(-Math.sin(pose.yaw)).toBeCloseTo(1, 6);
    expect(-Math.cos(pose.yaw)).toBeCloseTo(0, 6);
  });
});

describe("lookAtYaw", () => {
  it("regarde vers −z pour une cible au nord", () => {
    expect(lookAtYaw(0, 0, 0, -5)).toBeCloseTo(0, 6);
  });
});
