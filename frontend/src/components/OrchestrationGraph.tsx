/**
 * The wiring diagram of the AI team: one orchestrator, three specialists, their narrow tools,
 * and the human decision at the end. In live mode it reflects recorded trace activity only;
 * in illustrative mode it explains the fixed shape of the team and is labeled as such.
 */
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useInView, useReducedMotion } from "../motion";
import "../styles/orchestration.css";

export type GraphRole = "orchestrator" | "behavior" | "policy" | "regression";
export type GraphNodeState =
  "idle" | "queued" | "running" | "completed" | "failed" | "stopped";
export interface GraphActivity {
  state: GraphNodeState;
  modelCalls: number;
  toolCalls: number;
}
type ToolId = "read_artifact" | "run_comparison" | "propose_review";

const roleMeta: Record<
  GraphRole,
  { name: string; purpose: string; mark: string }
> = {
  orchestrator: {
    name: "Orchestrator",
    purpose: "Assigns bounded work, then synthesizes",
    mark: "01",
  },
  behavior: {
    name: "Behavior",
    purpose: "Traces what changed between versions",
    mark: "02",
  },
  policy: {
    name: "Policy",
    purpose: "Cites conflicting intended-rule evidence",
    mark: "03",
  },
  regression: {
    name: "Regression",
    purpose: "Proposes boundary and control cases",
    mark: "04",
  },
};
const toolMeta: Record<ToolId, { name: string; used: GraphRole[] }> = {
  read_artifact: { name: "read_artifact", used: ["behavior", "policy"] },
  run_comparison: { name: "run_comparison", used: ["behavior", "regression"] },
  propose_review: { name: "propose_review", used: ["orchestrator"] },
};
const specialists: GraphRole[] = ["behavior", "policy", "regression"];

interface Point {
  x: number;
  y: number;
}
interface Layout {
  width: number;
  height: number;
  node: { w: number; h: number };
  tool: { w: number; h: number };
  input: Point;
  orchestrator: Point;
  specialist: Record<string, Point>;
  tool_: Record<ToolId, Point>;
  human: Point;
  vertical: boolean;
}

// Geometry is computed from a few anchor points so edges always end exactly on node borders.
function layout(vertical: boolean): Layout {
  if (vertical) {
    const node = { w: 230, h: 86 };
    const tool = { w: 140, h: 34 };
    return {
      width: 440,
      height: 790,
      node,
      tool,
      vertical,
      input: { x: 190, y: 46 },
      orchestrator: { x: 190, y: 150 },
      specialist: {
        behavior: { x: 190, y: 300 },
        policy: { x: 190, y: 420 },
        regression: { x: 190, y: 540 },
      },
      tool_: {
        read_artifact: { x: 110, y: 650 },
        run_comparison: { x: 270, y: 650 },
        propose_review: { x: 345, y: 225 },
      },
      human: { x: 190, y: 742 },
    };
  }
  const node = { w: 236, h: 92 };
  const tool = { w: 156, h: 36 };
  return {
    width: 1040,
    height: 470,
    node,
    tool,
    vertical,
    input: { x: 118, y: 92 },
    orchestrator: { x: 520, y: 92 },
    specialist: {
      behavior: { x: 240, y: 262 },
      policy: { x: 520, y: 262 },
      regression: { x: 800, y: 262 },
    },
    tool_: {
      read_artifact: { x: 240, y: 404 },
      run_comparison: { x: 520, y: 404 },
      propose_review: { x: 800, y: 404 },
    },
    human: { x: 922, y: 92 },
  };
}

// A smooth connector that leaves its source vertically and arrives at its target vertically.
function connector(from: Point, to: Point, fromHalf: number, toHalf: number) {
  const start = { x: from.x, y: from.y + fromHalf };
  const end = { x: to.x, y: to.y - toHalf };
  const bend = (end.y - start.y) * 0.55;
  return `M ${start.x} ${start.y} C ${start.x} ${start.y + bend}, ${end.x} ${end.y - bend}, ${end.x} ${end.y}`;
}
// A horizontal connector between two nodes on the same row.
function sideConnector(from: Point, to: Point, half: number) {
  const start = { x: from.x + half, y: from.y };
  const end = { x: to.x - half, y: to.y };
  const bend = (end.x - start.x) * 0.5;
  return `M ${start.x} ${start.y} C ${start.x + bend} ${start.y}, ${end.x - bend} ${end.y}, ${end.x} ${end.y}`;
}

export function OrchestrationGraph({
  mode,
  activity,
  selected,
  onSelect,
  caption,
}: {
  mode: "illustrative" | "live";
  activity?: Partial<Record<GraphRole, GraphActivity>>;
  selected?: GraphRole;
  onSelect?: (role: GraphRole) => void;
  caption?: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [vertical, setVertical] = useState(false);
  const [hovered, setHovered] = useState<GraphRole | "human" | "input" | null>(
    null,
  );
  const inView = useInView(container, { amount: 0.2 });
  const reduced = useReducedMotion();
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setVertical(entry.contentRect.width < 640);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const L = layout(vertical);
  const half = L.node.h / 2;
  const halfW = L.node.w / 2;
  const toolHalf = L.tool.h / 2;
  const roleState = (role: GraphRole): GraphNodeState =>
    activity?.[role]?.state ?? "idle";
  const anyRunning = specialists
    .concat("orchestrator")
    .some((role) => roleState(role) === "running");
  const focus = hovered ?? selected ?? null;
  // Edges are described once so hover, packets and dimming all agree.
  const toolSource = (tool: ToolId, role: GraphRole) =>
    role === "orchestrator" ? L.orchestrator : L.specialist[role]!;
  const edges: Array<{
    id: string;
    d: string;
    ends: Array<GraphRole | "human" | "input">;
    tool?: ToolId;
    active: boolean;
  }> = [
    {
      id: "input",
      d: L.vertical
        ? connector(L.input, L.orchestrator, 20, half)
        : sideConnector(L.input, L.orchestrator, halfW),
      ends: ["input", "orchestrator"],
      active: mode === "illustrative" || roleState("orchestrator") !== "idle",
    },
    ...specialists.map((role, index) => ({
      id: `dispatch-${role}`,
      d: L.vertical
        ? connector(
            index === 0
              ? L.orchestrator
              : L.specialist[specialists[index - 1]!]!,
            L.specialist[role]!,
            half,
            half,
          )
        : connector(L.orchestrator, L.specialist[role]!, half, half),
      ends: ["orchestrator", role] as Array<GraphRole>,
      // Show the direction of delegation even when the recorded work is finished.
      // Motion is decorative; the node labels remain the source of status.
      active: true,
    })),
    ...(Object.keys(toolMeta) as ToolId[]).flatMap((tool) =>
      toolMeta[tool].used.map((role) => ({
        id: `${tool}-${role}`,
        d:
          L.vertical && tool === "propose_review"
            ? `M ${L.orchestrator.x + halfW} ${L.orchestrator.y + 18} C ${L.orchestrator.x + halfW + 40} ${L.orchestrator.y + 18}, ${L.tool_[tool].x} ${L.tool_[tool].y - 60}, ${L.tool_[tool].x} ${L.tool_[tool].y - toolHalf}`
            : connector(toolSource(tool, role), L.tool_[tool], half, toolHalf),
        ends: [role] as Array<GraphRole>,
        tool,
        active:
          mode === "illustrative" ||
          (roleState(role) === "running" &&
            (activity?.[role]?.toolCalls ?? 0) > 0),
      })),
    ),
    {
      id: "human",
      d: L.vertical
        ? `M ${L.tool_.propose_review.x + 40} ${L.tool_.propose_review.y + toolHalf} C ${L.tool_.propose_review.x + 60} ${L.tool_.propose_review.y + 260}, ${L.human.x + 40} ${L.human.y - 160}, ${L.human.x + 40} ${L.human.y - 20}`
        : sideConnector(L.orchestrator, L.human, halfW),
      ends: ["orchestrator", "human"],
      active:
        mode === "illustrative" || roleState("orchestrator") === "completed",
    },
  ];
  const dimmed = (ends: Array<GraphRole | "human" | "input">) =>
    focus !== null && !ends.includes(focus);
  const animate = inView && !reduced;
  return (
    <div
      ref={container}
      className={`orchestration ${anyRunning ? "is-running" : ""} ${mode === "illustrative" ? "is-illustrative" : ""}`}
    >
      <svg
        viewBox={`0 0 ${L.width} ${L.height}`}
        className="orchestration-svg"
        role="img"
        aria-label={
          mode === "live"
            ? "Recorded AI team activity: orchestrator, three specialists, their tools, and the human decision"
            : "How the AI team is wired: orchestrator, three specialists, their tools, and the human decision"
        }
      >
        <defs>
          <filter id="orch-glow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <marker
            id="orch-arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" className="orch-arrowhead" />
          </marker>
        </defs>
        <g className="orch-edges">
          {edges.map((edge) => (
            <g
              key={edge.id}
              className={`orch-edge ${edge.active ? "is-active" : ""} ${dimmed(edge.ends) ? "is-dim" : ""} ${edge.tool ? "orch-edge--tool" : ""}`}
            >
              <path
                d={edge.d}
                className="orch-edge-base"
                markerEnd="url(#orch-arrow)"
              />
              <path d={edge.d} className="orch-edge-flow" />
              {animate && edge.active && (
                <circle r="3.2" className="orch-packet">
                  <animateMotion
                    dur={`${edge.tool ? 2.6 : 3.4}s`}
                    repeatCount="indefinite"
                    path={edge.d}
                    begin={`${(edge.id.length % 5) * 0.37}s`}
                  />
                </circle>
              )}
            </g>
          ))}
        </g>
        <GraphBox
          center={L.input}
          size={{ w: L.vertical ? 230 : 200, h: 40 }}
          className={`orch-input ${dimmed(["input", "orchestrator"]) ? "is-dim" : ""}`}
          onHover={(on) => setHovered(on ? "input" : null)}
        >
          <text className="orch-input-text" textAnchor="middle" dy="5">
            Measured comparison + evidence
          </text>
        </GraphBox>
        {(["orchestrator", ...specialists] as GraphRole[]).map((role) => {
          const center =
            role === "orchestrator" ? L.orchestrator : L.specialist[role]!;
          const state = roleState(role);
          const stats = activity?.[role];
          return (
            <GraphBox
              key={role}
              center={center}
              size={L.node}
              className={`orch-node orch-node--${role} orch-node--${state} ${selected === role ? "is-selected" : ""} ${dimmed([role, ...(role === "orchestrator" ? specialists : ["orchestrator" as GraphRole])]) ? "is-dim" : ""}`}
              onHover={(on) => setHovered(on ? role : null)}
              onClick={onSelect ? () => onSelect(role) : undefined}
              label={`${roleMeta[role].name}, ${mode === "live" ? state : "role"}`}
            >
              <text className="orch-mark" x={-halfW + 16} y={-half + 22}>
                {roleMeta[role].mark}
              </text>
              <text
                className="orch-state"
                x={halfW - 16}
                y={-half + 22}
                textAnchor="end"
              >
                {mode === "live" ? state : "role"}
              </text>
              <text className="orch-name" x={-halfW + 16} y={-half + 48}>
                {roleMeta[role].name}
              </text>
              <text className="orch-purpose" x={-halfW + 16} y={-half + 66}>
                {roleMeta[role].purpose}
              </text>
              <text className="orch-stats" x={-halfW + 16} y={-half + 83}>
                {mode === "live"
                  ? `${stats?.modelCalls ?? 0} model · ${stats?.toolCalls ?? 0} tool`
                  : "own context · bounded tools"}
              </text>
              {state === "running" && (
                <circle
                  className="orch-node-pulse"
                  cx={halfW - 10}
                  cy={half - 10}
                  r="4"
                />
              )}
            </GraphBox>
          );
        })}
        {(Object.keys(toolMeta) as ToolId[]).map((tool) => (
          <GraphBox
            key={tool}
            center={L.tool_[tool]}
            size={L.tool}
            className={`orch-tool ${focus && !toolMeta[tool].used.includes(focus as GraphRole) ? "is-dim" : ""}`}
          >
            <text className="orch-tool-text" textAnchor="middle" dy="4">
              {toolMeta[tool].name}()
            </text>
          </GraphBox>
        ))}
        <GraphBox
          center={L.human}
          size={{ w: L.vertical ? 230 : 200, h: 40 }}
          className={`orch-human ${dimmed(["human", "orchestrator"]) ? "is-dim" : ""}`}
          onHover={(on) => setHovered(on ? "human" : null)}
        >
          <text className="orch-human-text" textAnchor="middle" dy="5">
            Human reviews and approves
          </text>
        </GraphBox>
      </svg>
      <div className="orchestration-legend">
        <span>
          <i className="orch-legend-swatch orch-legend-swatch--edge" /> model
          handoff
        </span>
        <span>
          <i className="orch-legend-swatch orch-legend-swatch--tool" /> tool
          call
        </span>
        <span>
          <i className="orch-legend-swatch orch-legend-swatch--human" /> human
          decision
        </span>
        {caption && <span className="orchestration-caption">{caption}</span>}
      </div>
    </div>
  );
}

/** One box in the graph. Clickable boxes are buttons for the keyboard too. */
function GraphBox({
  center,
  size,
  className,
  children,
  onHover,
  onClick,
  label,
}: {
  center: Point;
  size: { w: number; h: number };
  className: string;
  children: ReactNode;
  onHover?: (on: boolean) => void;
  onClick?: () => void;
  label?: string;
}) {
  return (
    <g
      className={`${className} ${onClick ? "is-clickable" : ""}`}
      transform={`translate(${center.x} ${center.y})`}
      onPointerEnter={() => onHover?.(true)}
      onPointerLeave={() => onHover?.(false)}
      onClick={onClick}
      onKeyDown={(event) => {
        if (onClick && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          onClick();
        }
      }}
      tabIndex={onClick ? 0 : undefined}
      role={onClick ? "button" : undefined}
      aria-label={label}
      style={{ "--w": size.w, "--h": size.h } as CSSProperties}
    >
      <rect
        className="orch-box-glow"
        x={-size.w / 2}
        y={-size.h / 2}
        width={size.w}
        height={size.h}
        rx="12"
      />
      <rect
        className="orch-box"
        x={-size.w / 2}
        y={-size.h / 2}
        width={size.w}
        height={size.h}
        rx="12"
      />
      <rect
        className="orch-box-edge"
        x={-size.w / 2}
        y={-size.h / 2}
        width={size.w}
        height={size.h}
        rx="12"
      />
      {children}
    </g>
  );
}
