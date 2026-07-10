import { BoxGeometry, PlaneGeometry } from "three";
import { describe, expect, it } from "vitest";
import type { FileObject, ObjectKind, Portal, SpatialNode } from "@codeworld/world-schema";
import { buildWorldIndex, type WorldIndex } from "../state/selectors";
import { computeActiveZone } from "../scene/zoneLoading";
import { groupFileObjects } from "../scene/instancing";
import { registerProceduralKits } from "../theme/register";
import { loadSchemaWorld } from "../scene/schemaWorldFixture";
import { geometryTriangleCount } from "./geometry";
import {
  instanceTriangleCount,
  peakRenderStats,
  roomMeshStats,
  worldRenderStats,
  zoneRenderStats,
} from "./staticCounts";

// Configuration de production : les objets se résolvent via le kit procédural.
registerProceduralKits();

// ── Fabriques de fixtures synthétiques ──

let objectSeq = 0;
function makeObject(kind: ObjectKind): FileObject {
  objectSeq += 1;
  return {
    sourceNodeId: `n_obj_${String(objectSeq)}`,
    position: { x: 0, y: 0, z: 0 },
    orientation: 0,
    kind,
    footprint: { x: 2000, z: 2000 },
  };
}

function makeRoom(overrides: Partial<SpatialNode> = {}): SpatialNode {
  return {
    id: "s_room",
    sourceNodeId: "n_room",
    role: "primary",
    page: 0,
    pageCount: 1,
    spaceType: "room",
    theme: "neutral",
    level: 0,
    depthFlattened: false,
    position: { x: 0, y: 0, z: 0 },
    orientation: 0,
    dimensions: { x: 20000, y: 3000, z: 20000 },
    portals: [],
    objects: [],
    ...overrides,
  };
}

/** Index minimal contenant une seule salle isolée (aucun portail, aucun voisin). */
function singleRoomIndex(room: SpatialNode): WorldIndex {
  return {
    nodeById: new Map(),
    spatialById: new Map([[room.id, room]]),
    roomByDirectory: new Map(),
    roomByFile: new Map(),
    hall: undefined,
  };
}

const door = (over: Partial<Portal> = {}): Portal => ({
  id: "p_1",
  toSpatialNodeId: "s_other",
  kind: "door",
  wall: "north",
  offset: 8000,
  width: 3000,
  height: 2400,
  ...over,
});

describe("geometryTriangleCount", () => {
  it("compte les triangles d'une boîte (12) et d'un plan (2)", () => {
    expect(geometryTriangleCount(new BoxGeometry(1, 1, 1))).toBe(12);
    expect(geometryTriangleCount(new PlaneGeometry(1, 1))).toBe(2);
  });
});

describe("instanceTriangleCount (kit procédural)", () => {
  it("reflète la forme réelle de chaque kind : boîte 12, cylindre 24, cône 8", () => {
    expect(instanceTriangleCount("neutral", "file-code")).toBe(12); // box
    expect(instanceTriangleCount("neutral", "file-config")).toBe(24); // cylinder(6)
    expect(instanceTriangleCount("neutral", "file-test")).toBe(8); // cone(4)
    // Le thème ne change pas la géométrie (même vocabulaire de formes).
    expect(instanceTriangleCount("project-hall", "file-config")).toBe(24);
  });
});

describe("roomMeshStats", () => {
  it("salle sans portail : sol + 4 murs pleins = 5 meshes, 50 triangles", () => {
    const stats = roomMeshStats(makeRoom());
    expect(stats).toEqual({ meshCount: 5, triangleCount: 50 });
  });

  it("une porte troue son mur (2 segments + 1 linteau) et ajoute 4 boîtes de cadre", () => {
    const stats = roomMeshStats(makeRoom({ portals: [door()] }));
    // 1 sol + (nord: 3 panneaux) + (3 autres murs: 1 chacun) + (portail: 4 boîtes) = 11 meshes.
    expect(stats.meshCount).toBe(11);
    // 2 (sol) + 6 panneaux×12 + 4 boîtes×12 = 2 + 72 + 48 = 122.
    expect(stats.triangleCount).toBe(122);
  });
});

describe("zoneRenderStats sur une fixture contrôlée", () => {
  it("compte exactement décor, InstancedMesh, instances et triangles d'une salle isolée", () => {
    const room = makeRoom({
      objects: [
        makeObject("file-code"),
        makeObject("file-code"),
        makeObject("file-code"),
        makeObject("file-config"),
        makeObject("file-config"),
        makeObject("file-test"),
      ],
    });
    const stats = zoneRenderStats(singleRoomIndex(room), room.id);

    expect(stats.roomCount).toBe(1);
    expect(stats.roomMeshCount).toBe(5);
    expect(stats.roomTriangleCount).toBe(50);
    // 3 couples (theme, kind) distincts : file-code, file-config, file-test.
    expect(stats.instancedMeshCount).toBe(3);
    expect(stats.instanceCount).toBe(6);
    // 3×12 (box) + 2×24 (cyl) + 1×8 (cone) = 36 + 48 + 8 = 92.
    expect(stats.instanceTriangleCount).toBe(92);
    // draw calls = 5 meshes de décor + 3 InstancedMesh = 8.
    expect(stats.drawCallCount).toBe(8);
    expect(stats.triangleCount).toBe(50 + 92);
  });
});

describe("zoneRenderStats sur le monde `schema` (cohérence d'agrégation)", () => {
  const world = loadSchemaWorld();
  const index = buildWorldIndex(world);

  it("agrège fidèlement le décor et les instances de la zone active du hall", () => {
    const hall = index.hall;
    expect(hall).toBeDefined();
    if (hall === undefined) return;

    const zone = computeActiveZone(index, hall.id);
    let expMesh = 0;
    let expTri = 0;
    for (const room of zone.rooms) {
      const s = roomMeshStats(room);
      expMesh += s.meshCount;
      expTri += s.triangleCount;
    }
    const groups = groupFileObjects(zone.rooms);
    let expInstances = 0;
    let expInstanceTris = 0;
    for (const g of groups) {
      expInstances += g.instances.length;
      expInstanceTris += instanceTriangleCount(g.theme, g.kind) * g.instances.length;
    }

    const stats = zoneRenderStats(index, hall.id);
    expect(stats.roomCount).toBe(zone.rooms.length);
    expect(stats.roomMeshCount).toBe(expMesh);
    expect(stats.roomTriangleCount).toBe(expTri);
    expect(stats.instancedMeshCount).toBe(groups.length);
    expect(stats.instanceCount).toBe(expInstances);
    expect(stats.instanceTriangleCount).toBe(expInstanceTris);
    expect(stats.drawCallCount).toBe(expMesh + groups.length);
    expect(stats.triangleCount).toBe(expTri + expInstanceTris);
  });

  it("le pic est le maximum de chaque compteur sur toutes les zones", () => {
    const { zones, peak } = worldRenderStats(world);
    expect(zones.length).toBe(world.layout.spatialNodes.length);
    expect(peak.drawCallCount).toBe(Math.max(...zones.map((z) => z.drawCallCount)));
    expect(peak.instancedMeshCount).toBe(Math.max(...zones.map((z) => z.instancedMeshCount)));
    expect(peak.instanceCount).toBe(Math.max(...zones.map((z) => z.instanceCount)));
    expect(peak.triangleCount).toBe(Math.max(...zones.map((z) => z.triangleCount)));
    // Le pic composante par composante coïncide avec `peakRenderStats`.
    expect(peakRenderStats(zones).triangleCount).toBe(peak.triangleCount);
  });
});
