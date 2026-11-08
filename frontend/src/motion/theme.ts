/** Remember whether the person prefers the dark or light look. Purely visual; nothing else reads it. */
import { useCallback, useSyncExternalStore } from "react";

export type Theme = "dark" | "light";
const STORAGE_KEY = "legacydiff.theme";
const listeners = new Set<() => void>();

function current(): Theme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useTheme(): [
  Theme,
  (origin?: { x: number; y: number }) => void,
] {
  const theme = useSyncExternalStore(subscribe, current, () => "dark" as Theme);
  const toggle = useCallback((origin?: { x: number; y: number }) => {
    const next: Theme = current() === "dark" ? "light" : "dark";
    const apply = () => {
      document.documentElement.dataset.theme = next;
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        /* The theme still changes for this visit when storage is unavailable. */
      }
      for (const listener of listeners) listener();
    };
    // Browsers with view transitions wipe the new theme out from the toggle in a circle.
    const doc = document as Document & {
      startViewTransition?: (callback: () => void) => { ready: Promise<void> };
    };
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!doc.startViewTransition || reduced || !origin) {
      apply();
      return;
    }
    const transition = doc.startViewTransition(apply);
    const radius = Math.hypot(
      Math.max(origin.x, innerWidth - origin.x),
      Math.max(origin.y, innerHeight - origin.y),
    );
    transition.ready
      .then(() => {
        document.documentElement.animate(
          {
            clipPath: [
              `circle(0px at ${origin.x}px ${origin.y}px)`,
              `circle(${radius * 1.1}px at ${origin.x}px ${origin.y}px)`,
            ],
          },
          {
            duration: 720,
            easing: "cubic-bezier(0.16, 1, 0.3, 1)",
            pseudoElement: "::view-transition-new(root)",
          },
        );
      })
      .catch(() => {
        /* If the animation cannot run, the theme has already changed. */
      });
  }, []);
  return [theme, toggle];
}
