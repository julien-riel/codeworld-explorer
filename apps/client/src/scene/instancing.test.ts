import { describe, expect, it } from "vitest";
import { buildWorldIndex } from "../state/selectors";
import { mmToSceneUnits } from "../state/store";
import { computeActiveZone } from "./zoneLoading";
import { groupFileObjects } from "./instancing";
import { orientationToYaw } from "./roomGeometry";
import { loadSchemaWorld } from "./schemaWorldFixture";

const world = loadSchemaWorld();
const index = buildWorldIndex(world);

describe("groupFileObjects", () => {
  it("ne produit aucun groupe pour une liste de salles vide", () => {
    expect(groupFileObjects([])).toEqual([]);
  });

  it("regroupe les objets d'une salle par (theme, kind) et n'en perd aucun", () => {
    const hall = index.hall;
    expect(hall).toBeDefined();
    if (hall === undefined) return;

    const groups = groupFileObjects([hall]);
    // Tous les objets du hall partagent son thème.
    for (const g of groups) expect(g.theme).toBe(hall.theme);
    // Aucune instance perdue : la somme couvre tous les objets.
    const total = groups.reduce((n, g) => n + g.instances.length, 0);
    expect(total).toBe(hall.objects.length);
    // Une seule InstancedMesh par kind distinct.
    const distinctKinds = new Set(hall.objects.map((o) => o.kind));
    expect(groups).toHaveLength(distinctKinds.size);
  });

  it("calcule la transformation MONDE d'un objet (position mm→unités + lacet cumulé)", () => {
    const hall = index.hall;
    if (hall === undefined) return;
    const object = hall.objects[0];
    expect(object).toBeDefined();
    if (object === undefined) return;

    const groups = groupFileObjects([hall]);
    const found = groups
      .flatMap((g) => g.instances)
      .find((i) => i.sourceNodeId === object.sourceNodeId);
    expect(found).toBeDefined();
    if (found === undefined) return;

    // Salle d'orientation 0 : la position locale se translate simplement de la position monde.
    expect(found.position[0]).toBeCloseTo(mmToSceneUnits(hall.position.x + object.position.x));
    expect(found.position[1]).toBeCloseTo(mmToSceneUnits(hall.position.y + object.position.y));
    expect(found.position[2]).toBeCloseTo(mmToSceneUnits(hall.position.z + object.position.z));
    // Lacet = orientation salle + orientation objet.
    expect(found.yaw).toBeCloseTo(
      orientationToYaw(hall.orientation) + orientationToYaw(object.orientation),
    );
  });

  it("produit une InstancedMesh par couple (theme, kind) distinct sur toute la zone active", () => {
    const hall = index.hall;
    if (hall === undefined) return;
    const zone = computeActiveZone(index, hall.id);
    const groups = groupFileObjects(zone.rooms);

    // Compte de référence indépendant : ensemble des couples (theme, kind) présents.
    const expectedPairs = new Set<string>();
    for (const room of zone.rooms) {
      for (const o of room.objects) expectedPairs.add(`${room.theme} ${o.kind}`);
    }
    expect(groups).toHaveLength(expectedPairs.size);
    // Chaque groupe est unique.
    const keys = new Set(groups.map((g) => `${g.theme} ${g.kind}`));
    expect(keys.size).toBe(groups.length);
  });
});
