import { describe, it, expect } from "vitest";
import { normalizeCommittedAt } from "./dates.js";
import { NonNormalizableDateError } from "./errors.js";

describe("normalizeCommittedAt (contrat §3.4.1)", () => {
  it("offset positif : soustrait l'offset (exemple du contrat)", () => {
    expect(normalizeCommittedAt("2026-07-09T14:32:07+02:00")).toBe("2026-07-09T12:32:07Z");
  });

  it("offset négatif : ajoute l'offset", () => {
    expect(normalizeCommittedAt("2026-07-09T09:15:00-05:00")).toBe("2026-07-09T14:15:00Z");
  });

  it("passage de jour en arrière (offset > heure locale)", () => {
    expect(normalizeCommittedAt("2026-07-09T01:00:00+02:00")).toBe("2026-07-08T23:00:00Z");
  });

  it("passage de jour en avant", () => {
    expect(normalizeCommittedAt("2026-07-09T23:30:00-02:00")).toBe("2026-07-10T01:30:00Z");
  });

  it("passage d'année (jour + mois + année reculent)", () => {
    expect(normalizeCommittedAt("2027-01-01T00:30:00+02:00")).toBe("2026-12-31T22:30:00Z");
  });

  it("année bissextile : 29 février 2024 valide, roule vers mars", () => {
    expect(normalizeCommittedAt("2024-02-29T23:00:00-02:00")).toBe("2024-03-01T01:00:00Z");
    expect(normalizeCommittedAt("2024-02-29T12:00:00Z")).toBe("2024-02-29T12:00:00Z");
  });

  it("Z déjà normalisé : identité", () => {
    expect(normalizeCommittedAt("2026-07-09T12:32:07Z")).toBe("2026-07-09T12:32:07Z");
  });

  it("offset +00:00 équivaut à Z", () => {
    expect(normalizeCommittedAt("2026-07-09T12:32:07+00:00")).toBe("2026-07-09T12:32:07Z");
  });

  it("tronque une fraction de seconde vers zéro (jamais d'arrondi)", () => {
    expect(normalizeCommittedAt("2026-07-09T14:32:07.999999+02:00")).toBe("2026-07-09T12:32:07Z");
  });

  it("29 février d'une année non bissextile : rejeté", () => {
    expect(() => normalizeCommittedAt("2023-02-29T12:00:00Z")).toThrow(NonNormalizableDateError);
  });

  it("année UTC hors [1000, 9999] après conversion : rejetée", () => {
    expect(() => normalizeCommittedAt("9999-12-31T23:30:00-02:00")).toThrow(NonNormalizableDateError);
    expect(() => normalizeCommittedAt("1000-01-01T00:30:00+02:00")).toThrow(NonNormalizableDateError);
  });

  it("formes non parsables : rejetées", () => {
    expect(() => normalizeCommittedAt("pas-une-date")).toThrow(NonNormalizableDateError);
    expect(() => normalizeCommittedAt("2026-07-09 12:00:00Z")).toThrow(NonNormalizableDateError);
    expect(() => normalizeCommittedAt("2026-13-01T00:00:00Z")).toThrow(NonNormalizableDateError);
    expect(() => normalizeCommittedAt("2026-07-32T00:00:00Z")).toThrow(NonNormalizableDateError);
    expect(() => normalizeCommittedAt("2026-07-09T25:00:00Z")).toThrow(NonNormalizableDateError);
  });

  it("porte la valeur source et le motif (exploitable)", () => {
    try {
      normalizeCommittedAt("2023-02-29T12:00:00Z");
      throw new Error("attendu : levée");
    } catch (error) {
      expect(error).toBeInstanceOf(NonNormalizableDateError);
      if (error instanceof NonNormalizableDateError) {
        expect(error.value).toBe("2023-02-29T12:00:00Z");
        expect(error.kind).toBe("non-normalizable-date");
      }
    }
  });
});
