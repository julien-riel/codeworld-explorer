import { describe, it, expect } from "vitest";
import {
  UnsupportedSchemaVersionError,
  TreeInvariantError,
  IdCollisionError,
  NonNormalizableDateError,
  LayoutInvariantError,
  NonCanonicalNumberError,
  NonCanonicalValueError,
} from "./errors.js";

describe("erreurs typées et discriminées", () => {
  it("chacune est une Error avec un `kind` discriminant et des champs exploitables", () => {
    const e1 = new UnsupportedSchemaVersionError(3, [0]);
    expect(e1).toBeInstanceOf(Error);
    expect(e1.kind).toBe("unsupported-schema-version");
    expect(e1.found).toBe(3);
    expect(e1.supported).toEqual([0]);
    expect(e1.name).toBe("UnsupportedSchemaVersionError");

    const e2 = new TreeInvariantError("id-derived", ["src/a.ts"], ["n_x"]);
    expect(e2.kind).toBe("tree-invariant");
    expect(e2.rule).toBe("id-derived");
    expect(e2.paths).toEqual(["src/a.ts"]);
    expect(e2.nodeIds).toEqual(["n_x"]);

    const e3 = new IdCollisionError("n_abc", ["a", "b"], 8);
    expect(e3.kind).toBe("id-collision");
    expect(e3.id).toBe("n_abc");
    expect(e3.paths).toEqual(["a", "b"]);
    expect(e3.idHashLength).toBe(8);

    const e4 = new NonNormalizableDateError("0999-01-01T00:00:00Z", "année hors [1000, 9999]");
    expect(e4.kind).toBe("non-normalizable-date");
    expect(e4.value).toBe("0999-01-01T00:00:00Z");
    expect(e4.reason).toContain("année");

    const e5 = new LayoutInvariantError("I3", "salles a et b se chevauchent", ["s_a", "s_b"]);
    expect(e5.kind).toBe("layout-invariant");
    expect(e5.invariant).toBe("I3");
    expect(e5.spatialNodeIds).toEqual(["s_a", "s_b"]);

    const e6 = new NonCanonicalNumberError(1.5);
    expect(e6.kind).toBe("non-canonical-number");
    expect(e6.value).toBe(1.5);

    const e7 = new NonCanonicalValueError("bigint");
    expect(e7.kind).toBe("non-canonical-value");
    expect(e7.valueType).toBe("bigint");
  });

  it("les valeurs par défaut des champs optionnels sont des tableaux vides", () => {
    expect(new TreeInvariantError("root-unique", ["", ""]).nodeIds).toEqual([]);
    expect(new LayoutInvariantError("I5", "non connexe").spatialNodeIds).toEqual([]);
  });
});
