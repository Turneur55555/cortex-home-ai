import { useEffect } from "react";

export interface ReminderShortcutHandlers {
  onCreate: () => void;
  onFocusSearch: () => void;
  onSetView: (view: "list" | "kanban" | "calendar") => void;
  onEscape: () => void;
}

/**
 * Global keyboard shortcuts for the Rappels page.
 * - N : nouveau rappel
 * - / : focus recherche
 * - 1/2/3 : changer de vue
 * - Esc : fermer la feuille active
 */
export function useReminderShortcuts(handlers: ReminderShortcutHandlers) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const inField =
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.tagName === "SELECT" ||
          t.isContentEditable);

      if (inField) {
        if (e.key === "Escape") handlers.onEscape();
        return;
      }

      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        handlers.onCreate();
      } else if (e.key === "/") {
        e.preventDefault();
        handlers.onFocusSearch();
      } else if (e.key === "1") handlers.onSetView("list");
      else if (e.key === "2") handlers.onSetView("kanban");
      else if (e.key === "3") handlers.onSetView("calendar");
      else if (e.key === "Escape") handlers.onEscape();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handlers]);
}
