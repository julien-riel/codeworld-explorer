/**
 * Accès React à l'index de recherche du monde courant (arbre 2D, PRD §11.3).
 *
 * L'index MiniSearch est construit UNE fois par monde et mémoïsé dans un cache faible
 * (`WeakMap` clé = objet `World`) : il survit au montage/démontage du panneau de
 * recherche sans repeupler l'index, et se libère avec le monde. Aucun three ici.
 */

import { useMemo } from "react";
import type { World } from "@codeworld/world-schema";
import { useWorld } from "../ui/hooks";
import { buildSearchIndex, type ClientSearchIndex } from "./searchIndex";

// Cache faible : clé = la référence du monde ; libéré par le GC avec le monde.
const cache = new WeakMap<World, ClientSearchIndex>();

/** Retourne (en le construisant au besoin) l'index de recherche d'un monde. */
export function getSearchIndex(world: World): ClientSearchIndex {
  let index = cache.get(world);
  if (index === undefined) {
    index = buildSearchIndex(world.search);
    cache.set(world, index);
  }
  return index;
}

/** Index de recherche du monde courant, ou `null` hors monde. Stable par monde. */
export function useSearchIndex(): ClientSearchIndex | null {
  const world = useWorld();
  return useMemo(() => (world === null ? null : getSearchIndex(world)), [world]);
}
