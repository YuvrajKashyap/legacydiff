/**
 * Reusable motion pieces: section reveals, tilt cards, magnetic buttons, count-up numbers,
 * click ripples and the custom cursor. They decorate real content and never invent data.
 */
import {
  useEffect,
  useRef,
  type CSSProperties,
  type ElementType,
  type ReactNode,
} from "react";
import {
  SectionRevealContext,
  useFinePointer,
  useInView,
  useMagnetic,
  useReducedMotion,
  useSectionReveal,
  useSpringNumber,
  useTilt,
} from "./index";

/** Names of entrance choreographies. Each page uses a different one per section. */
export type RevealEffect =
  | "deal-in"
  | "unseal"
  | "focus-pull"
  | "cascade"
  | "rise"
  | "curtain"
  | "blinds";

/** Wrap a section so all of its reveals share one on-screen signal. */
export function Section({
  children,
  className = "",
  as: Tag = "section",
  ...rest
}: {
  children: ReactNode;
  className?: string;
  as?: ElementType;
  [key: string]: unknown;
}) {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { margin: "0px 0px -8% 0px", amount: 0.08 });
  return (
    <Tag ref={ref} className={className} {...rest}>
      <SectionRevealContext.Provider value={inView}>
        {children}
      </SectionRevealContext.Provider>
    </Tag>
  );
}

/** Animate children in with a named effect. Replays when the section leaves and returns. */
export function Reveal({
  effect = "rise",
  delay = 0,
  children,
  className = "",
  as: Tag = "div",
  style,
  ...rest
}: {
  effect?: RevealEffect;
  delay?: number;
  children: ReactNode;
  className?: string;
  as?: ElementType;
  style?: CSSProperties;
  [key: string]: unknown;
}) {
  const ref = useRef<HTMLElement>(null);
  const section = useSectionReveal();
  const own = useInView(ref, { amount: 0.15 });
  const reduced = useReducedMotion();
  const visible = reduced || (section === null ? own : section);
  return (
    <Tag
      ref={ref}
      className={`reveal ${className}`}
      data-reveal={effect}
      data-in={visible ? "true" : "false"}
      style={{ ...style, "--reveal-delay": `${delay}ms` } as CSSProperties}
      {...rest}
    >
      {children}
    </Tag>
  );
}

/** Split a heading into letters that rise one after another. Screen readers get the whole phrase. */
export function Cascade({
  text,
  className = "",
  as: Tag = "span",
  delay = 0,
}: {
  text: string;
  className?: string;
  as?: ElementType;
  delay?: number;
}) {
  const words = text.split(" ");
  let index = 0;
  return (
    <Tag className={`cascade ${className}`} aria-label={text}>
      {words.map((word, wordIndex) => (
        <span
          className="cascade-word"
          key={`${word}-${wordIndex}`}
          aria-hidden="true"
        >
          {Array.from(word).map((letter, letterIndex) => {
            const position = index++;
            return (
              <span
                className="cascade-letter"
                key={letterIndex}
                style={
                  {
                    "--i": position,
                    "--reveal-delay": `${delay}ms`,
                  } as CSSProperties
                }
              >
                {letter}
              </span>
            );
          })}
        </span>
      ))}
    </Tag>
  );
}

/** A card that tips toward the cursor with a moving glare. */
export function TiltCard({
  children,
  className = "",
  strength = 6,
  as: Tag = "div",
  ...rest
}: {
  children: ReactNode;
  className?: string;
  strength?: number;
  as?: ElementType;
  [key: string]: unknown;
}) {
  const ref = useRef<HTMLElement>(null);
  useTilt(ref, strength);
  return (
    <Tag ref={ref} className={`tilt ${className}`} {...rest}>
      <span className="tilt-glare" aria-hidden="true" />
      {children}
    </Tag>
  );
}

/** A button that leans toward the cursor as it approaches. Behavior is the plain button's. */
export function MagneticButton({
  children,
  className = "",
  ...rest
}: {
  children: ReactNode;
  className?: string;
  [key: string]: unknown;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  useMagnetic(ref);
  return (
    <button ref={ref} className={className} {...rest}>
      <span className="magnetic-label">{children}</span>
    </button>
  );
}

/** Count a measured number up with spring physics. The real value is always what is displayed at rest. */
export function Ticker({
  value,
  className = "",
  digits = 0,
}: {
  value: number;
  className?: string;
  digits?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { amount: 0.5 });
  const shown = useSpringNumber(inView ? value : 0);
  return (
    <span
      ref={ref}
      className={`ticker ${className}`}
      aria-label={String(value)}
    >
      <span aria-hidden="true">{shown.toFixed(digits)}</span>
    </span>
  );
}

/**
 * Ripples spread from the exact point of every click on a button.
 * One document listener handles all buttons; the ripple is removed when its animation ends.
 */
export function ClickRipples() {
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = (event.target as HTMLElement | null)?.closest(
        "button, .ripple-host",
      ) as HTMLElement | null;
      if (!target || target.hasAttribute("disabled")) return;
      const rect = target.getBoundingClientRect();
      const ripple = document.createElement("span");
      ripple.className = "ripple";
      const size = Math.max(rect.width, rect.height) * 2.2;
      ripple.style.width = ripple.style.height = `${size}px`;
      ripple.style.left = `${event.clientX - rect.left - size / 2}px`;
      ripple.style.top = `${event.clientY - rect.top - size / 2}px`;
      target.appendChild(ripple);
      ripple.addEventListener("animationend", () => ripple.remove(), {
        once: true,
      });
    };
    document.addEventListener("pointerdown", onPointerDown, { passive: true });
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [reduced]);
  return null;
}

/** A dot and trailing ring that follow the pointer and grow over interactive targets. Mouse devices only. */
export function Cursor() {
  const fine = useFinePointer();
  const reduced = useReducedMotion();
  const dot = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!fine || reduced) return;
    document.documentElement.classList.add("has-cursor");
    let frame = 0;
    const target = { x: innerWidth / 2, y: innerHeight / 2 };
    const trail = { x: target.x, y: target.y };
    let visible = false;
    const tick = () => {
      trail.x += (target.x - trail.x) * 0.22;
      trail.y += (target.y - trail.y) * 0.22;
      if (dot.current)
        dot.current.style.transform = `translate3d(${target.x}px, ${target.y}px, 0)`;
      if (ring.current)
        ring.current.style.transform = `translate3d(${trail.x}px, ${trail.y}px, 0)`;
      frame =
        Math.abs(trail.x - target.x) + Math.abs(trail.y - target.y) > 0.2
          ? requestAnimationFrame(tick)
          : 0;
    };
    const move = (event: PointerEvent) => {
      target.x = event.clientX;
      target.y = event.clientY;
      if (!visible) {
        visible = true;
        dot.current?.classList.add("is-visible");
        ring.current?.classList.add("is-visible");
      }
      const over = (event.target as HTMLElement | null)?.closest(
        "a, button, [role=button], [role=tab], summary, select, label, input[type=radio], input[type=checkbox]",
      );
      const typing = (event.target as HTMLElement | null)?.closest(
        "input:not([type=radio]):not([type=checkbox]), textarea",
      );
      ring.current?.classList.toggle("is-over", !!over);
      ring.current?.classList.toggle("is-typing", !!typing);
      if (!frame) frame = requestAnimationFrame(tick);
    };
    const leave = () => {
      visible = false;
      dot.current?.classList.remove("is-visible");
      ring.current?.classList.remove("is-visible");
    };
    window.addEventListener("pointermove", move, { passive: true });
    document.documentElement.addEventListener("pointerleave", leave);
    return () => {
      document.documentElement.classList.remove("has-cursor");
      window.removeEventListener("pointermove", move);
      document.documentElement.removeEventListener("pointerleave", leave);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [fine, reduced]);
  if (!fine || reduced) return null;
  return (
    <>
      <div ref={dot} className="cursor-dot" aria-hidden="true" />
      <div ref={ring} className="cursor-ring" aria-hidden="true" />
    </>
  );
}
