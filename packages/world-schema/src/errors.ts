/**
 * Erreurs typées et DISCRIMINÉES du paquet. Chaque classe porte un champ `kind`
 * (littéral stable, anglais) permettant au client de discriminer sans dépendre
 * du `message` (français, pour l'UI), et des champs exploitables — pas seulement
 * un texte.
 *
 * Cible ES2022 : `extends Error` fonctionne nativement (`instanceof` fiable),
 * aucune bidouille de prototype nécessaire.
 */

/** Union des `kind` discriminants exposés par ce paquet. */
export type WorldSchemaErrorKind =
  | "unsupported-schema-version"
  | "tree-invariant"
  | "id-collision"
  | "non-normalizable-date"
  | "layout-invariant"
  | "non-canonical-number"
  | "non-canonical-value";

/** Version de schéma non reconnue (contrat §9, FR-027). Lue AVANT toute validation Zod. */
export class UnsupportedSchemaVersionError extends Error {
  // `as const` : fixe le TYPE LITTÉRAL du discriminant (exigé par prefer-as-const).
  readonly kind = "unsupported-schema-version" as const;
  readonly found: number;
  readonly supported: readonly number[];
  constructor(found: number, supported: readonly number[], message?: string) {
    super(
      message ??
        `Version de schéma non supportée : ${String(found)} (supportées : ${supported.join(", ")}).`,
    );
    this.name = "UnsupportedSchemaVersionError";
    this.found = found;
    this.supported = supported;
  }
}

/** Violation d'un invariant d'arbre `SourceNode` (contrat §3.5.3). */
export class TreeInvariantError extends Error {
  readonly kind = "tree-invariant" as const;
  /** Identifiant de la règle violée (ex. "root-unique", "parent-resolved", "id-derived"). */
  readonly rule: string;
  /** Chemins fautifs (au moins un). */
  readonly paths: readonly string[];
  /** Identifiants fautifs, si pertinents. */
  readonly nodeIds: readonly string[];
  constructor(
    rule: string,
    paths: readonly string[],
    nodeIds: readonly string[] = [],
    message?: string,
  ) {
    super(message ?? `Invariant d'arbre violé (${rule}) : ${paths.join(", ")}`);
    this.name = "TreeInvariantError";
    this.rule = rule;
    this.paths = paths;
    this.nodeIds = nodeIds;
  }
}

/** Collision d'identifiants dérivés (contrat §4.3). Remède : augmenter `config.idHashLength`. */
export class IdCollisionError extends Error {
  readonly kind = "id-collision" as const;
  /** L'`id` produit en double. */
  readonly id: string;
  /** Les chemins (ou clés) distincts qui produisent le même `id`. */
  readonly paths: readonly string[];
  /** Longueur d'empreinte en vigueur lors de la collision (le levier de remède). */
  readonly idHashLength: number;
  constructor(id: string, paths: readonly string[], idHashLength: number, message?: string) {
    super(
      message ??
        `Collision d'identifiant « ${id} » entre : ${paths.join(", ")} (idHashLength=${String(idHashLength)}).`,
    );
    this.name = "IdCollisionError";
    this.id = id;
    this.paths = paths;
    this.idHashLength = idHashLength;
  }
}

/** Date de commit non normalisable en `YYYY-MM-DDTHH:MM:SSZ` (contrat §3.4.1). */
export class NonNormalizableDateError extends Error {
  readonly kind = "non-normalizable-date" as const;
  /** La valeur source (`git show -s --format=%cI`) rejetée. */
  readonly value: string;
  /** Motif du rejet (ex. "année hors [1000, 9999]", "format non parsable"). */
  readonly reason: string;
  constructor(value: string, reason: string, message?: string) {
    super(message ?? `Date non normalisable « ${value} » : ${reason}.`);
    this.name = "NonNormalizableDateError";
    this.value = value;
    this.reason = reason;
  }
}

/** Violation d'un invariant géométrique de layout (layout-engine-v0 §11). */
export class LayoutInvariantError extends Error {
  readonly kind = "layout-invariant" as const;
  /** Identifiant de l'invariant (ex. "I3", "I5"). */
  readonly invariant: string;
  /** Description exploitable du cas fautif. */
  readonly detail: string;
  /** `SpatialNode.id` concernés. */
  readonly spatialNodeIds: readonly string[];
  constructor(
    invariant: string,
    detail: string,
    spatialNodeIds: readonly string[] = [],
    message?: string,
  ) {
    super(message ?? `Invariant de layout violé (${invariant}) : ${detail}`);
    this.name = "LayoutInvariantError";
    this.invariant = invariant;
    this.detail = detail;
    this.spatialNodeIds = spatialNodeIds;
  }
}

/** Nombre non canonisable rencontré à la sérialisation (contrat §6.1) : non fini ou entier non sûr. */
export class NonCanonicalNumberError extends Error {
  readonly kind = "non-canonical-number" as const;
  /** La valeur fautive (NaN, ±Infinity, flottant, ou entier hors des entiers sûrs). */
  readonly value: number;
  constructor(value: number, message?: string) {
    super(
      message ??
        `Nombre non canonique : ${String(value)} (attendu : entier sûr fini, cf. contrat §6.1).`,
    );
    this.name = "NonCanonicalNumberError";
    this.value = value;
  }
}

/** Valeur non canonisable à la sérialisation (contrat §6.1) : `undefined`, fonction, symbole, bigint. */
export class NonCanonicalValueError extends Error {
  readonly kind = "non-canonical-value" as const;
  /** Le type rencontré (résultat de `typeof`). */
  readonly valueType: string;
  constructor(valueType: string, message?: string) {
    super(message ?? `Valeur non canonique de type « ${valueType} » (cf. contrat §6.1).`);
    this.name = "NonCanonicalValueError";
    this.valueType = valueType;
  }
}
