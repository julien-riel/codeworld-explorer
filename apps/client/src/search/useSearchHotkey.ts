/**
 * Raccourcis clavier de la recherche (PRD §9.4 : accès rapide, anti-friction).
 *
 * - Ctrl/Cmd+K : bascule la recherche ;
 * - « / » : ouvre la recherche (ignoré si le focus est déjà dans un champ éditable) ;
 * - Échap : ferme la recherche (l'input gère son propre Échap, cf. `SearchPanel`).
 *
 * Écouteur unique sur `window`, lu via `getState()` pour ne pas se ré-abonner. À
 * l'ouverture, on relâche le verrouillage du pointeur pour rendre le curseur à l'UI
 * (pur DOM, aucune modification de la scène ni de la caméra).
 */

import { useEffect } from "react";
import { useWorldStore } from "../state/store";

/** Vrai si la cible d'un événement est un champ éditable (input, textarea, contenteditable). */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

/** Libère le verrouillage du pointeur s'il est actif (curseur rendu à l'interface). */
function releasePointer(): void {
  if (typeof document !== "undefined" && typeof document.exitPointerLock === "function") {
    document.exitPointerLock();
  }
}

/** Installe les raccourcis clavier de la recherche. À monter une fois, en-monde. */
export function useSearchHotkey(): void {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const onKeyDown = (event: KeyboardEvent): void => {
      const store = useWorldStore.getState();

      // Ctrl/Cmd+K : bascule ; ouvre → libère le pointeur.
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        const wasOpen = store.searchOpen;
        store.toggleSearch();
        if (!wasOpen) releasePointer();
        return;
      }

      // « / » : ouvre, sauf si l'utilisateur tape déjà dans un champ.
      if (event.key === "/" && !isEditableTarget(event.target)) {
        event.preventDefault();
        store.setSearchOpen(true);
        releasePointer();
        return;
      }

      // Échap hors champ éditable : ferme (dans l'input, `SearchPanel` s'en charge).
      if (event.key === "Escape" && store.searchOpen && !isEditableTarget(event.target)) {
        store.setSearchOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);
}
