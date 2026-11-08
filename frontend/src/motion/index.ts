/**
 * Small motion toolkit for the frontend. No external animation library.
 * Hooks here only touch presentation: they never read or change saved review data.
 */
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from "react";

/** Shared easing names. CSS uses the same curves (see styles/motion.css). */
export const ease = {
  gravitational: "cubic-bezier(0.16, 1, 0.3, 1)",
  orbital: "cubic-bezier(0.22, 0.8, 0.28, 1)",
  signal: "cubic-bezier(0.4, 0, 0.2, 1)",
  overshoot: "cubic-bezier(0.34, 1.56, 0.64, 1)",
} as const;

// One subscription per media query, shared by every component that asks about it.
function mediaStore(query: string) {
  const list = typeof window !== "undefined" ? matchMedia(query) : null;
  return {
    subscribe(callback: () => void) {
      list?.addEventListener("change", callback);
      return () => list?.removeEventListener("change", callback);
    },
    snapshot: () => list?.matches ?? false,
  };
}
const reducedMotionQuery = mediaStore("(prefers-reduced-motion: reduce)");
const finePointerQuery = mediaStore("(hover: hover) and (pointer: fine)");

/** True when the person asked the operating system for less motion. Every animation checks this. */
export function useReducedMotion() {
  return useSyncExternalStore(
    reducedMotionQuery.subscribe,
    reducedMotionQuery.snapshot,
    () => false,
  );
}

/** True on devices with a mouse or trackpad. Cursor and magnetic effects only run there. */
export function useFinePointer() {
  return useSyncExternalStore(
    finePointerQuery.subscribe,
    finePointerQuery.snapshot,
    () => false,
  );
}

/**
 * A section shares one "in view" signal with everything inside it.
 * That way a tall section never hides its own content while someone is still reading it.
 */
export const SectionRevealContext = createContext<boolean | null>(null);

/** Watch whether an element is on screen. Reveals replay in both scroll directions. */
export function useInView<T extends Element>(
  ref: RefObject<T | null>,
  options: { margin?: string; amount?: number } = {},
) {
  const [inView, setInView] = useState(false);
  const { margin = "0px 0px -10% 0px", amount = 0.12 } = options;
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) setInView(entry.isIntersecting);
      },
      { rootMargin: margin, threshold: amount },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, margin, amount]);
  return inView;
}

/** Read the enclosing section's reveal state, or null when the element is not inside a section. */
export function useSectionReveal() {
  return useContext(SectionRevealContext);
}

/**
 * Point a card toward the cursor and move a glare highlight with it.
 * Writes CSS variables directly on the element so React does not re-render on every pointer move.
 */
export function useTilt<T extends HTMLElement>(
  ref: RefObject<T | null>,
  strength = 7,
) {
  const reduced = useReducedMotion();
  const fine = useFinePointer();
  useEffect(() => {
    const element = ref.current;
    if (!element || reduced || !fine) return;
    let frame = 0;
    let next: { x: number; y: number } | null = null;
    const apply = () => {
      frame = 0;
      if (!next) return;
      const rect = element.getBoundingClientRect();
      const px = Math.min(1, Math.max(0, (next.x - rect.left) / rect.width));
      const py = Math.min(1, Math.max(0, (next.y - rect.top) / rect.height));
      element.style.setProperty(
        "--rx",
        `${((0.5 - py) * strength * 2).toFixed(2)}deg`,
      );
      element.style.setProperty(
        "--ry",
        `${((px - 0.5) * strength * 2).toFixed(2)}deg`,
      );
      element.style.setProperty("--gx", `${(px * 100).toFixed(1)}%`);
      element.style.setProperty("--gy", `${(py * 100).toFixed(1)}%`);
    };
    const move = (event: PointerEvent) => {
      next = { x: event.clientX, y: event.clientY };
      if (!frame) frame = requestAnimationFrame(apply);
    };
    const leave = () => {
      next = null;
      element.style.setProperty("--rx", "0deg");
      element.style.setProperty("--ry", "0deg");
    };
    element.addEventListener("pointermove", move);
    element.addEventListener("pointerleave", leave);
    return () => {
      element.removeEventListener("pointermove", move);
      element.removeEventListener("pointerleave", leave);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [ref, strength, reduced, fine]);
}

// Every magnetic element shares one pointer listener and one animation frame.
const magnets = new Set<{
  element: HTMLElement;
  radius: number;
  strength: number;
  x: number;
  y: number;
}>();
let magnetFrame = 0;
let pointer = { x: -9999, y: -9999 };
function magnetTick() {
  magnetFrame = 0;
  let settling = false;
  for (const magnet of magnets) {
    const rect = magnet.element.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = pointer.x - cx;
    const dy = pointer.y - cy;
    const distance = Math.hypot(dx, dy);
    const targetX = distance < magnet.radius ? dx * magnet.strength : 0;
    const targetY = distance < magnet.radius ? dy * magnet.strength : 0;
    // Simple critically damped approach: feels like a spring without per-frame allocation.
    magnet.x += (targetX - magnet.x) * 0.18;
    magnet.y += (targetY - magnet.y) * 0.18;
    if (
      Math.abs(magnet.x - targetX) > 0.05 ||
      Math.abs(magnet.y - targetY) > 0.05
    )
      settling = true;
    magnet.element.style.setProperty("--mx", `${magnet.x.toFixed(2)}px`);
    magnet.element.style.setProperty("--my", `${magnet.y.toFixed(2)}px`);
  }
  if (settling) magnetFrame = requestAnimationFrame(magnetTick);
}
function onPointerMove(event: PointerEvent) {
  pointer = { x: event.clientX, y: event.clientY };
  if (!magnetFrame && magnets.size)
    magnetFrame = requestAnimationFrame(magnetTick);
}

/** Let a button drift toward the cursor when it comes close, then settle back. */
export function useMagnetic<T extends HTMLElement>(
  ref: RefObject<T | null>,
  options: { radius?: number; strength?: number } = {},
) {
  const reduced = useReducedMotion();
  const fine = useFinePointer();
  const { radius = 110, strength = 0.22 } = options;
  useEffect(() => {
    const element = ref.current;
    if (!element || reduced || !fine) return;
    const magnet = { element, radius, strength, x: 0, y: 0 };
    if (!magnets.size) window.addEventListener("pointermove", onPointerMove);
    magnets.add(magnet);
    element.classList.add("is-magnetic");
    return () => {
      magnets.delete(magnet);
      element.classList.remove("is-magnetic");
      element.style.removeProperty("--mx");
      element.style.removeProperty("--my");
      if (!magnets.size)
        window.removeEventListener("pointermove", onPointerMove);
    };
  }, [ref, radius, strength, reduced, fine]);
}

/** Animate a number toward its target with a spring, for counters that should feel physical. */
export function useSpringNumber(
  target: number,
  options = { stiffness: 120, damping: 18 },
) {
  const reduced = useReducedMotion();
  const [value, setValue] = useState(target);
  const state = useRef({ value: target, velocity: 0 });
  useEffect(() => {
    if (reduced) {
      state.current = { value: target, velocity: 0 };
      setValue(target);
      return;
    }
    let frame = 0;
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const s = state.current;
      const force =
        -options.stiffness * (s.value - target) - options.damping * s.velocity;
      s.velocity += force * dt;
      s.value += s.velocity * dt;
      if (Math.abs(s.value - target) < 0.01 && Math.abs(s.velocity) < 0.01) {
        s.value = target;
        s.velocity = 0;
        setValue(target);
        return;
      }
      setValue(s.value);
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, reduced, options.stiffness, options.damping]);
  return value;
}

/**
 * Page-wide signals let distant parts of the screen react to each other:
 * a successful approval makes the centerpiece flare, a copied link glints.
 * Signals describe what already happened; they never trigger saved changes.
 */
export const SIGNAL_EVENT = "legacydiff:signal";
export type Signal =
  "copied" | "published" | "approved" | "started" | "validated" | "error";
export function emitSignal(signal: Signal) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<Signal>(SIGNAL_EVENT, { detail: signal }),
  );
}
export function useSignal(handler: (signal: Signal) => void) {
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => {
    const listen = (event: Event) =>
      latest.current((event as CustomEvent<Signal>).detail);
    window.addEventListener(SIGNAL_EVENT, listen);
    return () => window.removeEventListener(SIGNAL_EVENT, listen);
  }, []);
}
