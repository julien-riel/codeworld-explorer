/**
 * Contrat `world.json` — point d'entrée du paquet.
 *
 * Ce fichier ne réexporte QUE les primitives pures (versions, erreurs typées,
 * hachage, identifiants, PRNG, sérialisation canonique, arithmétique entière).
 * Le schéma Zod complet et le moteur de layout sont écrits par d'autres agents ;
 * leurs réexports s'ajouteront ici sans conflit de nom.
 */

export * from "./version.js";
export * from "./errors.js";
export * from "./hash/sha256.js";
export * from "./hash/base32.js";
export * from "./hash/fnv1a.js";
export * from "./ids.js";
export * from "./random.js";
export * from "./canonical.js";
export * from "./integer.js";
export * from "./schema.js";
export * from "./tree.js";
export * from "./dates.js";
export * from "./parse.js";
export * from "./layout/options.js";
export * from "./layout/compute.js";
export * from "./layout/invariants.js";
