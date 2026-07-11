/**
 * Tests de la configuration de couche 1. Le point du sprint 6 : accepter YAML EN PLUS de
 * JSON (PRD §12.1) sans que le format change quoi que ce soit au fond — même `FileConfig`,
 * même validation stricte, et surtout même `configurationHash` (déterminisme FR-026, le
 * format d'entrée ne doit jamais fuir dans l'identité de l'artefact).
 */

import { describe, expect, it } from "vitest";
import { parseConfigFile, parseConfigJson, parseConfigYaml, resolveConfig } from "./config.js";
import { ConfigError } from "./errors.js";

const JSON_TEXT = JSON.stringify({
  layoutSeed: "abc",
  exclude: ["tmp"],
  classifications: {
    folderNames: { widgets: "ui" },
    paths: { "src/core": "domain" },
  },
});

const YAML_TEXT = `layoutSeed: abc
exclude:
  - tmp
classifications:
  folderNames:
    widgets: ui
  paths:
    src/core: domain
`;

describe("parseConfigYaml — équivalence avec JSON", () => {
  it("produit la même FileConfig que le JSON équivalent", () => {
    expect(parseConfigYaml(YAML_TEXT)).toEqual(parseConfigJson(JSON_TEXT));
  });

  it("résout au même configurationHash (le format n'entre pas dans l'identité)", () => {
    const fromJson = resolveConfig(parseConfigJson(JSON_TEXT), "repo");
    const fromYaml = resolveConfig(parseConfigYaml(YAML_TEXT), "repo");
    expect(fromYaml.configurationHash).toBe(fromJson.configurationHash);
  });
});

describe("parseConfigYaml — validation stricte (identique au JSON)", () => {
  it("rejette une clé inconnue", () => {
    expect(() => parseConfigYaml("layoutSeed: x\nbogus: 1\n")).toThrow(ConfigError);
  });

  it("rejette une catégorie hors taxonomie", () => {
    expect(() => parseConfigYaml("classifications:\n  folderNames:\n    x: not-a-category\n")).toThrow(ConfigError);
  });

  it("rejette une racine non-objet", () => {
    expect(() => parseConfigYaml("- 1\n- 2\n")).toThrow(ConfigError);
  });

  it("signale un YAML syntaxiquement invalide", () => {
    expect(() => parseConfigYaml("foo: [unterminated\n")).toThrow(ConfigError);
  });
});

describe("parseConfigFile — routage par extension", () => {
  it("choisit YAML pour .yaml/.yml et JSON sinon", () => {
    expect(parseConfigFile(YAML_TEXT, "cfg.yaml")).toEqual(parseConfigJson(JSON_TEXT));
    expect(parseConfigFile(YAML_TEXT, "CFG.YML")).toEqual(parseConfigJson(JSON_TEXT));
    expect(parseConfigFile(JSON_TEXT, "cfg.json")).toEqual(parseConfigJson(JSON_TEXT));
    // Extension inconnue → JSON par défaut.
    expect(parseConfigFile(JSON_TEXT, "cfg.conf")).toEqual(parseConfigJson(JSON_TEXT));
  });
});
