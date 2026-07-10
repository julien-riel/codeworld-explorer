/**
 * Schémas Zod stricts et types inférés du noyau v0 (contrat §3).
 *
 * Règles transverses (contrat §2.3) : tout objet est validé en mode strict
 * (`z.strictObject` ⇒ clé inconnue rejetée) ; un champ optionnel est OMIS, jamais
 * émis à `null` (`.optional()` rejette `null`) ; `null` n'est accepté que là où il
 * porte un sens propre (`parentId`, `license`), via `.nullable()`.
 *
 * Zod ne valide que des FORMES : l'intégrité référentielle de l'arbre est portée
 * par `assertTreeInvariants` (contrat §3.5.3, cf. tree.ts), pas ici.
 */

import { z } from "zod";

// ── Formats d'identifiants et de hachage (contrat §3, §4.2) ──
// La longueur exacte de l'empreinte (`idHashLength`) est uniforme dans un artefact
// donné ; `{8,32}` couvre toute la plage configurable (contrat §4.3).
const nodeIdSchema = z.string().regex(/^n_[a-z2-7]{8,32}$/);
const spatialIdSchema = z.string().regex(/^s_[a-z2-7]{8,32}$/);
const portalIdSchema = z.string().regex(/^p_[a-z2-7]{8,32}$/);
const sha256HexSchema = z.string().regex(/^[0-9a-f]{64}$/);

// ── Vecteur entier et orientation (contrat §2.1, §3.7) ──

/** Entiers de millimètres ; aucun flottant ne franchit le schéma (contrat §2.2). */
export const Vec3iSchema = z.strictObject({
  x: z.number().int(),
  y: z.number().int(),
  z: z.number().int(),
});
export type Vec3i = z.infer<typeof Vec3iSchema>;

/** Quart de tour horaire autour de `y` : `0` = nord (`-z`) (contrat §2.1). */
export const OrientationSchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
]);
export type Orientation = z.infer<typeof OrientationSchema>;

// ── Manifest (contrat §3.2) ──

/**
 * `schemaVersion` est épinglé à `z.literal(0)` en défense en profondeur : le refus
 * de version (FR-027, §9) le lit AVANT Zod, mais Zod le revérifie ici.
 */
export const ManifestSchema = z.strictObject({
  schemaVersion: z.literal(0),
  analyzerVersion: z.string(),
  layoutVersion: z.number().int().min(0),
  configurationHash: sha256HexSchema,
});
export type Manifest = z.infer<typeof ManifestSchema>;

// ── Repository (contrat §3.3) ──

export const RepositorySchema = z.strictObject({
  provider: z.literal("github"),
  owner: z.string(),
  name: z.string(),
  url: z.string(),
  defaultBranch: z.string(),
  // `null` a un sens propre : licence inconnue (identifiant SPDX sinon).
  license: z.string().nullable(),
});
export type Repository = z.infer<typeof RepositorySchema>;

// ── Snapshot (contrat §3.4) ──

export const SnapshotSchema = z.strictObject({
  commitSha: z.string().regex(/^[0-9a-f]{40}$/),
  branch: z.string(),
  // Committer date NORMALISÉE en UTC seconde, suffixe littéral 'Z' (contrat §3.4.1).
  committedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/),
});
export type Snapshot = z.infer<typeof SnapshotSchema>;

// ── SourceNode (contrat §3.5) ──

export const NodeTypeSchema = z.enum(["directory", "file"]);
export type NodeType = z.infer<typeof NodeTypeSchema>;

/** Vocabulaire fermé v0 : exclusions volontaires + échecs d'analyse (contrat §3.5.1). */
export const ExcludedReasonSchema = z.enum([
  "vendored",
  "binary",
  "too-large",
  "generated",
  "config-exclude",
  "read-error",
  "parse-error",
]);
export type ExcludedReason = z.infer<typeof ExcludedReasonSchema>;

export const SourceNodeSchema = z.strictObject({
  id: nodeIdSchema,
  // `null` a un sens propre : la racine, et elle seule (contrat §3.5.1).
  parentId: nodeIdSchema.nullable(),
  path: z.string(),
  name: z.string(),
  nodeType: NodeTypeSchema,
  depth: z.number().int().min(0),
  childCount: z.number().int().min(0).optional(),
  language: z.string().optional(),
  sizeBytes: z.number().int().min(0).optional(),
  contentHash: sha256HexSchema.optional(),
  excludedReason: ExcludedReasonSchema.optional(),
});
export type SourceNode = z.infer<typeof SourceNodeSchema>;

// ── Classification (dossiers uniquement, contrat §3.6) ──

/** Taxonomie PRD §12.2 (contrat §3.6). */
export const CategorySchema = z.enum([
  "root",
  "controller",
  "route",
  "service",
  "domain",
  "ui",
  "utility",
  "model",
  "repository",
  "data",
  "configuration",
  "test",
  "documentation",
  "asset",
  "build",
  "generated",
  "vendor",
  "unknown",
]);
export type Category = z.infer<typeof CategorySchema>;

/** Couches de décision PRD §12.1 ; `"ai"` n'est jamais produit en v0 (contrat §3.6). */
export const DecisionSourceSchema = z.enum(["config", "rule", "static", "ai"]);
export type DecisionSource = z.infer<typeof DecisionSourceSchema>;

export const EvidenceSchema = z.strictObject({
  kind: z.string(),
  detail: z.string(),
});
export type Evidence = z.infer<typeof EvidenceSchema>;

export const ClassificationSchema = z.strictObject({
  sourceNodeId: nodeIdSchema,
  category: CategorySchema,
  // Pour-mille entier (contrat §2.1).
  confidence: z.number().int().min(0).max(1000),
  decisionSource: DecisionSourceSchema,
  evidence: z.array(EvidenceSchema),
  overriddenByConfig: z.boolean(),
});
export type Classification = z.infer<typeof ClassificationSchema>;

// ── Vocabulaires de layout (contrat §3.7) ──

/** v0 PRODUIT : `hall`, `room`, `plaza`, `gallery` ; les autres sont réservés (contrat §3.7). */
export const SpaceTypeSchema = z.enum([
  "hall",
  "room",
  "plaza",
  "gallery",
  "corridor",
  "warehouse",
  "floor-stack",
]);
export type SpaceType = z.infer<typeof SpaceTypeSchema>;

/** v0 : `project-hall`, `control-room`, `neutral` ; les autres sont réservés (contrat §3.7, §13.2). */
export const ThemeIdSchema = z.enum([
  "project-hall",
  "control-room",
  "neutral",
  "factory",
  "design-gallery",
  "tool-workshop",
  "object-museum",
  "archive-warehouse",
  "machine-room",
  "laboratory",
  "library",
]);
export type ThemeId = z.infer<typeof ThemeIdSchema>;

/** `hall` = racine ; `primary` = tout autre dossier ; `annex` = page de pagination (contrat §3.7.1). */
export const SpatialRoleSchema = z.enum(["hall", "primary", "annex"]);
export type SpatialRole = z.infer<typeof SpatialRoleSchema>;

/** v0 PRODUIT : `door`, `stair` ; `elevator`, `portal` réservés, jamais émis (contrat §3.7). */
export const PortalKindSchema = z.enum(["door", "stair", "elevator", "portal"]);
export type PortalKind = z.infer<typeof PortalKindSchema>;

/** Vocabulaire d'objets fichiers (layout-engine-v0 §8.2). */
export const ObjectKindSchema = z.enum([
  "file-generic",
  "file-code",
  "file-config",
  "file-doc",
  "file-test",
  "readme-stand",
  "console",
]);
export type ObjectKind = z.infer<typeof ObjectKindSchema>;

export const WallSchema = z.enum(["north", "south", "east", "west"]);
export type Wall = z.infer<typeof WallSchema>;

// ── Portal, FileObject, SpatialNode, WorldLayout (contrat §3.7) ──

export const PortalSchema = z.strictObject({
  id: portalIdSchema,
  toSpatialNodeId: spatialIdSchema,
  kind: PortalKindSchema,
  wall: WallSchema,
  // mm le long du mur depuis le coin de référence ; toujours positif (contrat §3.7.6).
  offset: z.number().int().min(0),
  width: z.number().int(),
  height: z.number().int(),
});
export type Portal = z.infer<typeof PortalSchema>;

/** Emprise au sol en repère modèle, mm (layout-engine-v0 §8.3). */
export const FootprintSchema = z.strictObject({
  x: z.number().int(),
  z: z.number().int(),
});
export type Footprint = z.infer<typeof FootprintSchema>;

export const FileObjectSchema = z.strictObject({
  sourceNodeId: nodeIdSchema,
  // LOCAL au centre-sol de la salle (contrat §2.1, §3.7).
  position: Vec3iSchema,
  orientation: OrientationSchema,
  kind: ObjectKindSchema,
  footprint: FootprintSchema,
});
export type FileObject = z.infer<typeof FileObjectSchema>;

export const SpatialNodeSchema = z.strictObject({
  id: spatialIdSchema,
  sourceNodeId: nodeIdSchema,
  role: SpatialRoleSchema,
  page: z.number().int().min(0),
  pageCount: z.number().int().min(1),
  spaceType: SpaceTypeSchema,
  theme: ThemeIdSchema,
  level: z.number().int().min(0),
  depthFlattened: z.boolean(),
  position: Vec3iSchema,
  orientation: OrientationSchema,
  dimensions: Vec3iSchema,
  portals: z.array(PortalSchema),
  objects: z.array(FileObjectSchema),
});
export type SpatialNode = z.infer<typeof SpatialNodeSchema>;

export const WorldLayoutSchema = z.strictObject({
  layoutVersion: z.number().int().min(0),
  // = config.layoutSeed, indépendant du commit (contrat §5.3).
  seed: z.string(),
  normalSpeed: z.number().int().min(0),
  maxRoomHalfExtent: z.number().int().min(0),
  spatialNodes: z.array(SpatialNodeSchema),
});
export type WorldLayout = z.infer<typeof WorldLayoutSchema>;

// ── SearchIndex (contrat §3.8) ──

export const SearchDocSchema = z.strictObject({
  // sourceNodeId en v0 (symbolId en phase 1) : forme `string` figée (contrat §3.8).
  ref: z.string(),
  path: z.string(),
  name: z.string(),
  kind: NodeTypeSchema,
  language: z.string().optional(),
  category: CategorySchema.optional(),
  // RÉSERVÉ phase 1 ; ABSENT en v0 (contrat §3.8).
  symbolNames: z.array(z.string()).optional(),
});
export type SearchDoc = z.infer<typeof SearchDocSchema>;

export const SearchIndexSchema = z.strictObject({
  version: z.number().int().min(0),
  documents: z.array(SearchDocSchema),
});
export type SearchIndex = z.infer<typeof SearchIndexSchema>;

// ── Entités réservées (sprints 5 à 7) : nommées, optionnelles, ABSENTES en v0 (contrat §3.9) ──
// Leur FORME est figée dès v0 pour éviter tout bump majeur en phase 1 ; un artefact
// v0 valide n'en porte AUCUNE clé (rejet à la présence : cf. WorldSchema plus bas).

export const RefTargetSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("node"), id: z.string() }),
  z.strictObject({ kind: z.literal("symbol"), id: z.string() }),
]);
export type RefTarget = z.infer<typeof RefTargetSchema>;

export const SymbolSchema = z.strictObject({
  id: z.string(),
  sourceNodeId: z.string(),
  name: z.string(),
  qualifiedName: z.string(),
  symbolType: z.string(),
  startLine: z.number().int(),
  endLine: z.number().int(),
  exported: z.boolean(),
});
// Le nom `Symbol` (contrat §3.9) masque le type global dans ce module seul ; usage
// type-only, aucun conflit d'exécution.
export type Symbol = z.infer<typeof SymbolSchema>;

export const RelationSchema = z.strictObject({
  sourceRef: RefTargetSchema,
  targetRef: RefTargetSchema,
  relationType: z.string(),
  confidence: z.number().int().min(0).max(1000),
  evidence: z.array(EvidenceSchema),
});
export type Relation = z.infer<typeof RelationSchema>;

export const SemanticSummarySchema = z.strictObject({
  targetRef: RefTargetSchema,
  // Texte normalisé LF (contrat §3.9, §6.1).
  summary: z.string(),
  modelId: z.string(),
  promptVersion: z.string(),
  sourceRefs: z.array(RefTargetSchema),
});
export type SemanticSummary = z.infer<typeof SemanticSummarySchema>;

export const GuidedTourSchema = z.strictObject({
  title: z.string(),
  steps: z.array(
    z.strictObject({
      target: RefTargetSchema,
      text: z.string(),
      sourceRefs: z.array(RefTargetSchema),
    }),
  ),
  generatedBy: z.string(),
});
export type GuidedTour = z.infer<typeof GuidedTourSchema>;

// ── Objet racine `World` (contrat §3.1) ──

const worldObjectSchema = z.strictObject({
  manifest: ManifestSchema,
  repository: RepositorySchema,
  snapshot: SnapshotSchema,
  // Collections de premier niveau v0 : toujours présentes, vides si vides (contrat §2.3).
  nodes: z.array(SourceNodeSchema),
  classifications: z.array(ClassificationSchema),
  layout: WorldLayoutSchema,
  search: SearchIndexSchema,
  // Réservé sprints 5–7 : forme figée, mais ABSENT d'un artefact v0 valide (contrat §3.9).
  symbols: z.array(SymbolSchema).optional(),
  relations: z.array(RelationSchema).optional(),
  summaries: z.array(SemanticSummarySchema).optional(),
  tour: GuidedTourSchema.optional(),
});
export type World = z.infer<typeof worldObjectSchema>;

/** Clés d'entités réservées (contrat §3.9) : déclarées optionnelles, mais interdites en v0. */
const RESERVED_V0_KEYS = ["symbols", "relations", "summaries", "tour"] as const;

/**
 * Schéma v0 de l'artefact. Les entités réservées (sprints 5–7) sont déclarées
 * optionnelles pour figer leur forme (contrat §3.9), mais leur PRÉSENCE est rejetée :
 * « un artefact v0 valide est un artefact sans ces clés ».
 */
export const WorldSchema = worldObjectSchema.superRefine((world, ctx) => {
  for (const key of RESERVED_V0_KEYS) {
    if (world[key] !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: [key],
        message: `L'entité réservée « ${key} » (sprints 5–7) ne doit pas être émise en v0 (contrat §3.9).`,
      });
    }
  }
});
