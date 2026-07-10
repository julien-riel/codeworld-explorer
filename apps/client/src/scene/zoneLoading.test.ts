import { describe, expect, it } from "vitest";
import { buildWorldIndex } from "../state/selectors";
import { computeActiveZone } from "./zoneLoading";
import { loadSchemaWorld } from "./schemaWorldFixture";

const world = loadSchemaWorld();
const index = buildWorldIndex(world);

describe("computeActiveZone", () => {
  it("monte la salle courante et ses voisines immédiates, salle courante en tête", () => {
    const hall = index.hall;
    expect(hall).toBeDefined();
    if (hall === undefined) return;

    const zone = computeActiveZone(index, hall.id);
    expect(zone.currentId).toBe(hall.id);
    expect(zone.rooms[0]?.id).toBe(hall.id);

    // La zone = hall + salles cibles de ses portails (une porte de distance).
    const expected = new Set<string>([hall.id, ...hall.portals.map((p) => p.toSpatialNodeId)]);
    const actual = new Set(zone.rooms.map((r) => r.id));
    expect(actual).toEqual(expected);
  });

  it("ne monte PAS le monde entier (chargement par zone)", () => {
    const hall = index.hall;
    if (hall === undefined) return;
    const zone = computeActiveZone(index, hall.id);
    // Le monde `schema` a plus de salles que la seule zone du hall.
    expect(world.layout.spatialNodes.length).toBeGreaterThan(zone.rooms.length);
  });

  it("chaque salle voisine est réellement atteignable par un portail de la salle courante", () => {
    const start = world.layout.spatialNodes.find((s) => s.portals.length > 0);
    expect(start).toBeDefined();
    if (start === undefined) return;
    const zone = computeActiveZone(index, start.id);
    const reachable = new Set(start.portals.map((p) => p.toSpatialNodeId));
    for (const room of zone.rooms) {
      if (room.id === start.id) continue;
      expect(reachable.has(room.id)).toBe(true);
    }
  });

  it("retourne une zone vide sans monde ou pour une salle inconnue", () => {
    expect(computeActiveZone(null, "s_whatever")).toEqual({ currentId: null, rooms: [] });
    expect(computeActiveZone(index, "s_does_not_exist")).toEqual({ currentId: null, rooms: [] });
    expect(computeActiveZone(index, null)).toEqual({ currentId: null, rooms: [] });
  });
});
