/**
 * Pipeline de normalisation des kits d'assets 3D CC0 (PRD §10.4, §30.4, FR-029).
 *
 * Décision produit (phase 0) : les thèmes sont rendus en géométries procédurales
 * instanciées ; aucun asset externe n'est téléchargé. Ce pipeline et le manifeste
 * de provenance sont donc écrits et exercés « à vide », prêts à recevoir de vrais
 * kits CC0. Pour garantir qu'ils fonctionnent réellement, ils sont testés sur un
 * `Document` glTF construit par programme (cf. tests).
 *
 * Chaque étape est une fonction (quasi) pure sur un `Document` gltf-transform,
 * testable isolément. L'ordre canonique est fixé par `PIPELINE` et reflété dans
 * le champ `transforms` du manifeste.
 */

import {
  Document,
  NodeIO,
  Logger,
  Verbosity,
  PropertyType,
  getBounds,
} from "@gltf-transform/core";
import {
  KHRMeshQuantization,
  EXTMeshoptCompression,
} from "@gltf-transform/extensions";
import { dedup, quantize, meshopt } from "@gltf-transform/functions";
import { MeshoptEncoder, MeshoptDecoder } from "meshoptimizer";

import { TRANSFORM_IDS, type TransformId } from "./manifest.js";

/** Triplet de couleur linéaire (composantes RGB dans `[0, 1]`). */
export type Rgb = readonly [number, number, number];

/**
 * Palette UNIQUE du produit (PRD §10.4 : « remappe les textures vers la palette
 * unique du produit »). Couleurs plates, lisibles, partagées par tous les thèmes
 * pour permettre l'instancing (un seul matériau, peu de draw calls).
 */
export const PRODUCT_PALETTE: readonly Rgb[] = [
  [0.05, 0.05, 0.06], // encre
  [0.93, 0.93, 0.9], // papier
  [0.85, 0.28, 0.22], // rouge signalétique
  [0.2, 0.5, 0.86], // bleu route
  [0.3, 0.7, 0.4], // vert dossier
  [0.95, 0.76, 0.2], // jaune repère
  [0.55, 0.35, 0.72], // violet doc
  [0.5, 0.52, 0.55], // gris neutre
];

/** Taille cible (mm) de la plus grande dimension de la boîte englobante. */
export const DEFAULT_TARGET_SIZE = 4000;

/** Tolérance relative en deçà de laquelle la normalisation d'échelle est un no-op. */
const SCALE_EPSILON = 1e-6;

/** Options du pipeline de normalisation. */
export interface NormalizeOptions {
  /** Fichier source du kit brut (GLB/glTF). */
  readonly input: string;
  /** Chemin de sortie de l'asset normalisé (GLB). */
  readonly output: string;
  /** Taille cible de la plus grande dimension (mm). Défaut : {@link DEFAULT_TARGET_SIZE}. */
  readonly targetSize?: number;
  /** Palette de remappage. Défaut : {@link PRODUCT_PALETTE}. */
  readonly palette?: readonly Rgb[];
}

/**
 * Fabrique un `NodeIO` configuré pour lire/écrire les GLB normalisés : extensions
 * de quantization et de compression Meshopt enregistrées, avec encodeur/décodeur.
 */
export function createAssetIO(): NodeIO {
  return new NodeIO()
    .registerExtensions([KHRMeshQuantization, EXTMeshoptCompression])
    .registerDependencies({
      "meshopt.encoder": MeshoptEncoder,
      "meshopt.decoder": MeshoptDecoder,
    });
}

/** Journaliseur silencieux : le pipeline ne doit rien écrire sur la sortie standard. */
function silentLogger(): Logger {
  return new Logger(Verbosity.SILENT);
}

// ── Étape 1 : normalisation d'échelle ──────────────────────────────────────

/**
 * Boîte englobante monde de la première scène, ou `null` si le document est vide.
 * Passe par `getBounds`, qui tient compte des transformations de nœud (donc reste
 * correcte même après quantization, laquelle encode une échelle sur le nœud).
 */
export function worldBounds(
  doc: Document,
): { min: [number, number, number]; max: [number, number, number] } | null {
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
  if (!scene) return null;
  const { min, max } = getBounds(scene);
  return { min, max };
}

/**
 * Normalise l'échelle pour que la plus grande dimension de la boîte englobante
 * égale `targetSize`. L'échelle est appliquée aux nœuds racine de la scène
 * (translation ET échelle), homothétie centrée sur l'origine : la taille du monde
 * est multipliée EXACTEMENT par le facteur, robuste à toute transformation de nœud.
 *
 * No-op si le document est déjà normalisé (facteur ≈ 1) : d'où l'idempotence.
 */
export function normalizeScale(
  doc: Document,
  targetSize = DEFAULT_TARGET_SIZE,
): void {
  const bounds = worldBounds(doc);
  if (!bounds) return;
  const size = Math.max(
    bounds.max[0] - bounds.min[0],
    bounds.max[1] - bounds.min[1],
    bounds.max[2] - bounds.min[2],
  );
  if (size <= 0) return;
  const factor = targetSize / size;
  if (Math.abs(factor - 1) <= SCALE_EPSILON) return; // déjà normalisé
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
  if (!scene) return;
  for (const node of scene.listChildren()) {
    const t = node.getTranslation();
    node.setTranslation([t[0] * factor, t[1] * factor, t[2] * factor]);
    const s = node.getScale();
    node.setScale([s[0] * factor, s[1] * factor, s[2] * factor]);
  }
}

// ── Étape 2 : remappage vers la palette unique ─────────────────────────────

/** Indice de la couleur de palette la plus proche (distance euclidienne RGB). */
function nearestPaletteIndex(
  rgb: readonly [number, number, number],
  palette: readonly Rgb[],
): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < palette.length; i++) {
    const p = palette[i]!;
    const dr = rgb[0] - p[0];
    const dg = rgb[1] - p[1];
    const db = rgb[2] - p[2];
    const d = dr * dr + dg * dg + db * db;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/**
 * Remappe le `baseColorFactor` de chaque matériau vers la couleur de palette la
 * plus proche (l'alpha d'origine est préservé). Idempotent : une couleur déjà sur
 * la palette est son propre plus proche voisin.
 */
export function remapToPalette(
  doc: Document,
  palette: readonly Rgb[] = PRODUCT_PALETTE,
): void {
  for (const material of doc.getRoot().listMaterials()) {
    const [r, g, b, a] = material.getBaseColorFactor();
    const p = palette[nearestPaletteIndex([r, g, b], palette)]!;
    material.setBaseColorFactor([p[0], p[1], p[2], a]);
  }
}

// ── Étape 3 : fusion des matériaux ─────────────────────────────────────────

/**
 * Fusionne les matériaux devenus identiques (dedup gltf-transform). Après le
 * remappage de palette, des matériaux jadis distincts partagent la même couleur
 * et sont réunis en un seul, réduisant les draw calls (PRD §10.4).
 */
export async function mergeMaterials(doc: Document): Promise<void> {
  await doc.transform(dedup({ propertyTypes: [PropertyType.MATERIAL] }));
}

// ── Étape 4 : quantization ─────────────────────────────────────────────────

/** Quantifie les attributs de géométrie (KHR_mesh_quantization). */
export async function quantizeGeometry(doc: Document): Promise<void> {
  await doc.transform(quantize());
}

// ── Étape 5 : compression Meshopt ──────────────────────────────────────────

/** Compresse la géométrie via EXT_meshopt_compression. */
export async function compressMeshopt(doc: Document): Promise<void> {
  await MeshoptEncoder.ready;
  await doc.transform(meshopt({ encoder: MeshoptEncoder }));
}

// ── Orchestration ──────────────────────────────────────────────────────────

/** Ordre canonique des étapes du pipeline. */
export const PIPELINE: readonly TransformId[] = TRANSFORM_IDS;

/**
 * Applique le pipeline complet à un `Document`, en place, et renvoie la liste
 * ORDONNÉE des transformations appliquées (destinée au manifeste). L'ordre suit
 * {@link PIPELINE}.
 */
export async function normalizeDocument(
  doc: Document,
  options: { targetSize?: number; palette?: readonly Rgb[] } = {},
): Promise<TransformId[]> {
  const targetSize = options.targetSize ?? DEFAULT_TARGET_SIZE;
  const palette = options.palette ?? PRODUCT_PALETTE;
  await MeshoptEncoder.ready;

  normalizeScale(doc, targetSize);
  remapToPalette(doc, palette);
  await mergeMaterials(doc);
  await quantizeGeometry(doc);
  await compressMeshopt(doc);

  return [...PIPELINE];
}

/** Lit un GLB depuis le disque en un `Document`. */
export async function readGlb(path: string): Promise<Document> {
  const doc = await createAssetIO().read(path);
  doc.setLogger(silentLogger());
  return doc;
}

/** Sérialise un `Document` en octets GLB. */
export async function writeGlbBytes(doc: Document): Promise<Uint8Array> {
  return createAssetIO().writeBinary(doc);
}

/**
 * Normalise un asset sur disque : lit `input`, applique le pipeline, écrit le GLB
 * dans `output`, et renvoie la liste ordonnée des transformations appliquées
 * (à consigner dans le manifeste de provenance).
 */
export async function normalizeKit(
  options: NormalizeOptions,
): Promise<TransformId[]> {
  const doc = await readGlb(options.input);
  const transforms = await normalizeDocument(doc, {
    targetSize: options.targetSize ?? DEFAULT_TARGET_SIZE,
    palette: options.palette ?? PRODUCT_PALETTE,
  });
  await createAssetIO().write(options.output, doc);
  return transforms;
}
