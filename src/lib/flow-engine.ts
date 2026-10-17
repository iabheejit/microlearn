// Channel-neutral engine for staff-built WhatsApp flows. Pure: no I/O, so every rule here is unit tested.
// The editor and the server share `validateGraph`; the runtime renders `runFlow` outputs and executes its
// actions. Course lesson → question progression stays in course-engine.ts; flows only hand over to it.
//
// Model: a published graph (React Flow nodes/edges) and a session that points at one node. A run walks
// from that node until it must wait (a reply or a delay) or ends. Waiting nodes are Message with options,
// Ask, Template with "wait for reply", and Delay; every loop must pass through one of them.

import { z } from "zod";

export const FLOW_KINDS = [
  "keyword",
  "fallback",
  "course_start",
  "course_complete",
  "broadcast",
] as const;
export type FlowKind = (typeof FLOW_KINDS)[number];

// Meta's interactive-message limits.
export const LIMITS = {
  text: 4096,
  interactiveBody: 1024,
  buttons: 3,
  buttonTitle: 20,
  listRows: 10,
  rowTitle: 24,
  rowDescription: 72,
  templateParams: 20,
  templateParam: 1024,
  nodes: 200,
  keyword: 32,
  keywords: 20,
} as const;
/** Nodes one run may visit; a guard on top of the no-loop-without-a-wait rule. */
export const MAX_STEPS = 25;
/** Longest gap since the learner's last reply before free-form messages need a template (minutes). */
export const WINDOW_MINUTES = 23 * 60;
export const MAX_DELAY_MINUTES = 30 * 24 * 60;
/** Words course progression understands (course-engine via interpretReply) or reserved for opt-out. */
export const RESERVED_KEYWORDS = [
  "next",
  "continue",
  "done",
  "pause",
  "resume",
  "start",
  "stop",
  "unsubscribe",
];
export const FLOW_BUTTON_PREFIX = "flow:";

const VARIABLE = /^[a-z][a-z0-9_]{0,31}$/;
const OPTION_ID = /^[a-z0-9_-]{1,32}$/i;
const id = z.string().min(1).max(64);
const position = z.object({ x: z.number(), y: z.number() });
const option = z.object({ id: z.string(), title: z.string() });

const nodeData = {
  trigger: z.object({}).passthrough(),
  message: z.object({
    text: z.string(),
    buttons: z.array(option).optional(),
    list: z
      .object({
        button: z.string(),
        rows: z.array(option.extend({ description: z.string().optional() })),
      })
      .optional(),
  }),
  ask: z.object({
    text: z.string(),
    variable: z.string(),
    validate: z.enum(["text", "number", "email", "regex"]).default("text"),
    pattern: z.string().max(200).optional(),
    retryText: z.string().optional(),
  }),
  condition: z.object({
    match: z.enum(["all", "any"]).default("all"),
    rules: z.array(
      z.discriminatedUnion("source", [
        z.object({
          source: z.literal("variable"),
          variable: z.string(),
          op: z.enum([
            "equals",
            "not_equals",
            "contains",
            "exists",
            "not_exists",
            "gt",
            "lt",
          ]),
          value: z.string().optional(),
        }),
        z.object({
          source: z.literal("enrollment"),
          op: z.enum(["active", "completed", "none"]),
        }),
        z.object({
          source: z.literal("window"),
          op: z.enum(["open", "closed"]),
        }),
      ]),
    ),
  }),
  delay: z.object({
    amount: z.number().int().positive(),
    unit: z.enum(["minutes", "hours", "days"]),
  }),
  template: z.object({
    name: z.string(),
    language: z.string(),
    params: z.array(z.string()).default([]),
    waitForReply: z.boolean().default(true),
    variable: z.string().optional(),
  }),
  enroll: z.object({ courseId: z.string() }),
  start_course: z.object({}).passthrough(),
  set_variable: z.object({ variable: z.string(), value: z.string() }),
  tag: z.object({ tag: z.string() }),
  handoff: z.object({ note: z.string().optional() }),
  goto_flow: z.object({ flowId: z.string() }),
  end: z.object({}).passthrough(),
};
export type NodeType = keyof typeof nodeData;
export const NODE_TYPES = Object.keys(nodeData) as NodeType[];

const NodeSchema = z.discriminatedUnion(
  "type",
  NODE_TYPES.map((type) =>
    z
      .object({
        id,
        type: z.literal(type),
        position: position.optional(),
        data: nodeData[type],
      })
      .passthrough(),
  ) as unknown as [
    z.ZodDiscriminatedUnionOption<"type">,
    ...z.ZodDiscriminatedUnionOption<"type">[],
  ],
);
const EdgeSchema = z
  .object({
    id,
    source: id,
    target: id,
    sourceHandle: z.string().nullish(),
  })
  .passthrough();
export const GraphSchema = z.object({
  nodes: z.array(NodeSchema).max(LIMITS.nodes),
  edges: z.array(EdgeSchema),
});

type DataOf<T extends NodeType> = z.infer<(typeof nodeData)[T]>;
export type FlowNode = {
  [T in NodeType]: {
    id: string;
    type: T;
    position?: { x: number; y: number };
    data: DataOf<T>;
  };
}[NodeType];
export type NodeOf<T extends NodeType> = Extract<FlowNode, { type: T }>;
export type FlowEdge = z.infer<typeof EdgeSchema>;
export type FlowGraph = { nodes: FlowNode[]; edges: FlowEdge[] };
export type ConditionRule = DataOf<"condition">["rules"][number];

/** Edge handle used when a node has a single way out. */
export const DEFAULT_HANDLE = "next";
export const OTHER_HANDLE = "other";

const optionsOf = (node: NodeOf<"message">) =>
  node.data.buttons ?? node.data.list?.rows ?? [];
const hasOptions = (node: FlowNode): node is NodeOf<"message"> =>
  node.type === "message" && optionsOf(node).length > 0;

/** The edge handles a node may have, in the order the editor draws them. */
export function handlesOf(node: FlowNode): string[] {
  switch (node.type) {
    case "message":
      return hasOptions(node)
        ? [...optionsOf(node).map((item) => item.id), OTHER_HANDLE]
        : [DEFAULT_HANDLE];
    case "ask":
      return ["valid", "invalid"];
    case "condition":
      return ["true", "false"];
    case "enroll":
      return ["enrolled", "blocked"];
    case "start_course":
    case "handoff":
    case "goto_flow":
    case "end":
      return [];
    default:
      return [DEFAULT_HANDLE];
  }
}

/** Nodes after which the run stops until a reply or the scheduler resumes it. */
export const waits = (node: FlowNode) =>
  hasOptions(node) ||
  node.type === "ask" ||
  node.type === "delay" ||
  (node.type === "template" && node.data.waitForReply);

/** Nodes that send a free-form message, which WhatsApp only allows inside the 24-hour window. */
const sendsFreeForm = (node: FlowNode) =>
  node.type === "message" || node.type === "ask";

export const delayMinutes = (data: DataOf<"delay">) =>
  data.amount * (data.unit === "days" ? 1440 : data.unit === "hours" ? 60 : 1);

// ---------- Validation ----------

export type Issue = {
  severity: "error" | "warning";
  code: string;
  message: string;
  nodeId?: string;
  edgeId?: string;
};

export type ValidateOptions = {
  kind: FlowKind;
  /** This flow's id, so Go to flow cannot point at itself. */
  flowId?: string;
  /** When given, Template nodes must name one of these approved templates (with its language). */
  templates?: { name: string; language: string; variables: number }[];
  /** When given, Go to flow targets must be one of these published flows. */
  flowIds?: string[];
  /** When given, Enroll nodes must name one of these WhatsApp courses. */
  courseIds?: string[];
};

export type Validation = {
  ok: boolean;
  issues: Issue[];
  graph: FlowGraph | null;
};

const zodIssues = (error: z.ZodError, raw: unknown): Issue[] =>
  error.issues.map((issue) => {
    const [collection, index] = issue.path;
    const item =
      typeof index === "number" &&
      (collection === "nodes" || collection === "edges")
        ? (raw as Record<string, { id?: unknown }[]>)[collection]?.[index]
        : undefined;
    const ref = typeof item?.id === "string" ? item.id : undefined;
    return {
      severity: "error" as const,
      code: "invalid_shape",
      message: `${issue.path.join(".")}: ${issue.message}`,
      ...(collection === "nodes" && ref ? { nodeId: ref } : {}),
      ...(collection === "edges" && ref ? { edgeId: ref } : {}),
    };
  });

function checkNode(node: FlowNode, options: ValidateOptions): Issue[] {
  const issues: Issue[] = [];
  const error = (code: string, message: string) =>
    issues.push({ severity: "error", code, message, nodeId: node.id });
  const checkText = (text: string, max: number) => {
    if (!text.trim()) error("empty_text", "Enter the message text.");
    else if (text.length > max)
      error("text_too_long", `Message text is limited to ${max} characters.`);
  };
  const checkVariable = (name: string | undefined) => {
    if (name !== undefined && !VARIABLE.test(name))
      error(
        "invalid_variable",
        "Variable names use lowercase letters, digits and _ (up to 32, starting with a letter).",
      );
  };

  switch (node.type) {
    case "message": {
      const { buttons, list } = node.data;
      if (buttons?.length && list)
        error("buttons_and_list", "Use buttons or a list, not both.");
      checkText(
        node.data.text,
        buttons?.length || list ? LIMITS.interactiveBody : LIMITS.text,
      );
      const items = buttons ?? list?.rows ?? [];
      if (buttons && buttons.length > LIMITS.buttons)
        error(
          "too_many_buttons",
          `WhatsApp allows at most ${LIMITS.buttons} buttons.`,
        );
      if (list) {
        if (!list.rows.length)
          error("empty_list", "Add at least one list row.");
        if (list.rows.length > LIMITS.listRows)
          error(
            "too_many_rows",
            `WhatsApp lists allow at most ${LIMITS.listRows} rows.`,
          );
        if (!list.button.trim() || list.button.length > LIMITS.buttonTitle)
          error(
            "invalid_list_button",
            `The list button label needs 1–${LIMITS.buttonTitle} characters.`,
          );
        for (const row of list.rows)
          if ((row.description ?? "").length > LIMITS.rowDescription)
            error(
              "description_too_long",
              `Row descriptions are limited to ${LIMITS.rowDescription} characters.`,
            );
      }
      const max = buttons ? LIMITS.buttonTitle : LIMITS.rowTitle;
      const seenIds = new Set<string>();
      const seenTitles = new Set<string>();
      for (const item of items) {
        if (!item.title.trim() || item.title.length > max)
          error(
            "invalid_option_title",
            `Option titles need 1–${max} characters.`,
          );
        if (!OPTION_ID.test(item.id) || item.id === OTHER_HANDLE)
          error("invalid_option_id", `Option id "${item.id}" is not allowed.`);
        const title = item.title.trim().toLowerCase();
        if (seenIds.has(item.id) || seenTitles.has(title))
          error("duplicate_option", "Each option needs its own id and title.");
        seenIds.add(item.id);
        seenTitles.add(title);
      }
      break;
    }
    case "ask":
      checkText(node.data.text, LIMITS.text);
      checkVariable(node.data.variable);
      if (node.data.validate === "regex") {
        try {
          new RegExp(node.data.pattern ?? "");
          if (!node.data.pattern) throw new Error("empty");
        } catch {
          error(
            "invalid_pattern",
            "Enter a valid pattern to check replies against.",
          );
        }
      }
      break;
    case "condition":
      if (!node.data.rules.length)
        error("no_rules", "Add at least one condition.");
      for (const rule of node.data.rules)
        if (rule.source === "variable") {
          checkVariable(rule.variable);
          if (
            !["exists", "not_exists"].includes(rule.op) &&
            rule.value === undefined
          )
            error("missing_value", "Enter a value to compare with.");
        }
      break;
    case "delay":
      if (delayMinutes(node.data) > MAX_DELAY_MINUTES)
        error("delay_too_long", "Delays are limited to 30 days.");
      break;
    case "template": {
      const { name, language, params } = node.data;
      if (!name.trim() || !language.trim())
        error("missing_template", "Choose an approved template.");
      checkVariable(node.data.variable);
      if (
        params.length > LIMITS.templateParams ||
        params.some(
          (value) => !value.trim() || value.length > LIMITS.templateParam,
        )
      )
        error("invalid_template_params", "Fill in every template value.");
      if (options.templates && name.trim()) {
        const approved = options.templates.find(
          (item) => item.name === name && item.language === language,
        );
        if (!approved)
          error(
            "template_not_approved",
            `Template "${name}" (${language}) is not approved on the linked WhatsApp account.`,
          );
        else if (approved.variables !== params.length)
          error(
            "template_params_mismatch",
            `Template "${name}" needs ${approved.variables} value(s).`,
          );
      }
      break;
    }
    case "enroll":
      if (!node.data.courseId) error("missing_course", "Choose a course.");
      else if (
        options.courseIds &&
        !options.courseIds.includes(node.data.courseId)
      )
        error(
          "unknown_course",
          "The course no longer exists or is not delivered on WhatsApp.",
        );
      break;
    case "set_variable":
      checkVariable(node.data.variable);
      break;
    case "tag":
      if (!/^[a-z0-9][a-z0-9_-]{0,31}$/i.test(node.data.tag))
        error("invalid_tag", "Tags use letters, digits, _ and - (up to 32).");
      break;
    case "goto_flow":
      if (!node.data.flowId) error("missing_flow", "Choose a flow.");
      else if (node.data.flowId === options.flowId)
        error("goto_self", "A flow cannot go to itself.");
      else if (options.flowIds && !options.flowIds.includes(node.data.flowId))
        error("unknown_flow", "The target flow is not published.");
      break;
  }
  return issues;
}

/** Validates a flow graph. Shared by the editor (live feedback) and the server (save and publish). */
export function validateGraph(
  raw: unknown,
  options: ValidateOptions,
): Validation {
  const parsed = GraphSchema.safeParse(raw);
  if (!parsed.success)
    return { ok: false, issues: zodIssues(parsed.error, raw), graph: null };
  const graph = parsed.data as FlowGraph;
  const issues: Issue[] = [];
  const nodes = new Map<string, FlowNode>();
  for (const node of graph.nodes) {
    if (nodes.has(node.id))
      issues.push({
        severity: "error",
        code: "duplicate_node",
        message: `Node id "${node.id}" is used twice.`,
        nodeId: node.id,
      });
    nodes.set(node.id, node);
    issues.push(...checkNode(node, options));
  }

  const triggers = graph.nodes.filter((node) => node.type === "trigger");
  if (triggers.length !== 1)
    issues.push({
      severity: "error",
      code: "trigger_count",
      message: "A flow needs exactly one trigger.",
    });

  const out = new Map<string, Map<string, string>>();
  const edgeIds = new Set<string>();
  for (const edge of graph.edges) {
    const fail = (code: string, message: string) =>
      issues.push({ severity: "error", code, message, edgeId: edge.id });
    if (edgeIds.has(edge.id))
      fail("duplicate_edge", `Edge id "${edge.id}" is used twice.`);
    edgeIds.add(edge.id);
    const source = nodes.get(edge.source);
    const target = nodes.get(edge.target);
    if (!source || !target) {
      fail("dangling_edge", "This connection points at a missing node.");
      continue;
    }
    if (target.type === "trigger")
      fail("edge_into_trigger", "Nothing can connect into the trigger.");
    const handle = edge.sourceHandle ?? DEFAULT_HANDLE;
    if (!handlesOf(source).includes(handle)) {
      fail(
        "invalid_handle",
        "This connection starts from an output the node does not have.",
      );
      continue;
    }
    const handles = out.get(source.id) ?? new Map<string, string>();
    if (handles.has(handle))
      fail("duplicate_handle", "Each output can connect to only one node.");
    handles.set(handle, target.id);
    out.set(source.id, handles);
  }

  const trigger = triggers[0];
  if (trigger) {
    if (!out.get(trigger.id)?.size)
      issues.push({
        severity: "error",
        code: "empty_flow",
        message: "Connect the trigger to the first step.",
        nodeId: trigger.id,
      });
    const reached = new Set([trigger.id]);
    const queue = [trigger.id];
    while (queue.length) {
      for (const next of out.get(queue.shift()!)?.values() ?? [])
        if (!reached.has(next)) {
          reached.add(next);
          queue.push(next);
        }
    }
    for (const node of graph.nodes)
      if (!reached.has(node.id))
        issues.push({
          severity: "error",
          code: "unreachable",
          message: "This step cannot be reached from the trigger.",
          nodeId: node.id,
        });
    issues.push(...checkWindow(graph, nodes, out, trigger, options.kind));
  }
  issues.push(...checkLoops(nodes, out));
  for (const node of graph.nodes) {
    if (!hasOptions(node)) continue;
    const handles = out.get(node.id);
    for (const item of optionsOf(node))
      if (!handles?.has(item.id))
        issues.push({
          severity: "warning",
          code: "unconnected_option",
          message: `Option "${item.title}" ends the flow.`,
          nodeId: node.id,
        });
  }
  return {
    ok: !issues.some((issue) => issue.severity === "error"),
    issues,
    graph,
  };
}

/** A loop made only of steps that never wait would run without the learner; each loop needs a wait. */
function checkLoops(
  nodes: Map<string, FlowNode>,
  out: Map<string, Map<string, string>>,
): Issue[] {
  const state = new Map<string, "visiting" | "done">();
  const issues: Issue[] = [];
  const visit = (nodeId: string) => {
    state.set(nodeId, "visiting");
    for (const next of out.get(nodeId)?.values() ?? []) {
      const node = nodes.get(next);
      if (!node || waits(node)) continue;
      if (state.get(next) === "visiting")
        issues.push({
          severity: "error",
          code: "loop_without_wait",
          message: "This loop never waits for the learner or a delay.",
          nodeId: next,
        });
      else if (!state.has(next)) visit(next);
    }
    state.set(nodeId, "done");
  };
  for (const [nodeId, node] of nodes)
    if (!state.has(nodeId) && !waits(node)) visit(nodeId);
  return issues;
}

/**
 * Free-form messages need the 24-hour window. Tracks, per node, the longest time that may have passed
 * since the learner's last reply (capped at the window); broadcasts start outside it.
 */
function checkWindow(
  graph: FlowGraph,
  nodes: Map<string, FlowNode>,
  out: Map<string, Map<string, string>>,
  trigger: FlowNode,
  kind: FlowKind,
): Issue[] {
  const since = new Map<string, number>([
    [trigger.id, kind === "broadcast" ? WINDOW_MINUTES : 0],
  ]);
  const queue = [trigger.id];
  while (queue.length) {
    const node = nodes.get(queue.shift()!)!;
    const before = since.get(node.id)!;
    // A reply reopens the window; a delay uses it up.
    const after =
      waits(node) && node.type !== "delay"
        ? 0
        : node.type === "delay"
          ? Math.min(WINDOW_MINUTES, before + delayMinutes(node.data))
          : before;
    for (const next of out.get(node.id)?.values() ?? []) {
      if ((since.get(next) ?? -1) >= after) continue;
      since.set(next, after);
      queue.push(next);
    }
  }
  return graph.nodes
    .filter(
      (node) =>
        sendsFreeForm(node) && (since.get(node.id) ?? 0) >= WINDOW_MINUTES,
    )
    .map((node) => ({
      severity: "error" as const,
      code: "needs_template",
      message:
        kind === "broadcast"
          ? "Broadcasts reach learners outside the 24-hour window; send an approved template that waits for a reply first."
          : "The 24-hour window may have closed here; send an approved template that waits for a reply first.",
      nodeId: node.id,
    }));
}

// ---------- Keywords ----------

export const normalizeKeyword = (value: string) =>
  value.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");

/** Normalizes and checks a keyword flow's keywords; uniqueness across flows is enforced by the database. */
export function validateKeywords(values: string[]): {
  keywords: string[];
  issues: Issue[];
} {
  const keywords = [...new Set(values.map(normalizeKeyword).filter(Boolean))];
  const issues: Issue[] = [];
  const error = (code: string, message: string) =>
    issues.push({ severity: "error", code, message });
  if (!keywords.length) error("no_keywords", "Add at least one keyword.");
  if (keywords.length > LIMITS.keywords)
    error("too_many_keywords", `Use at most ${LIMITS.keywords} keywords.`);
  for (const keyword of keywords) {
    if (keyword.length > LIMITS.keyword)
      error(
        "keyword_too_long",
        `"${keyword}" is longer than ${LIMITS.keyword} characters.`,
      );
    if (RESERVED_KEYWORDS.includes(keyword))
      error(
        "reserved_keyword",
        `"${keyword}" is reserved for courses and opt-out.`,
      );
    if (
      keyword.startsWith("course:") ||
      keyword.startsWith("quiz:") ||
      keyword.startsWith(FLOW_BUTTON_PREFIX)
    )
      error("reserved_keyword", `"${keyword}" looks like a button id.`);
  }
  return { keywords, issues };
}

// ---------- Runtime ----------

export type SessionStatus =
  "waiting_reply" | "waiting_delay" | "completed" | "expired" | "handed_off";

export type FlowSessionState = {
  status: SessionStatus;
  /** The node the session waits at (null once finished). */
  currentNodeId: string | null;
  variables: Record<string, string>;
  waitUntil: string | null;
};

export type FlowInput =
  | { kind: "start" }
  | { kind: "reply"; text: string; replyId?: string | null }
  | { kind: "resume" };

export type FlowContext = {
  /** Whether the learner replied within the window (computed by the server; it stays authoritative). */
  windowOpen: boolean;
  learnerName?: string | null;
  courseTitle?: string | null;
  /** The learner's WhatsApp course enrollment, if any (one-active-course rule). */
  enrollment?: {
    courseId: string;
    status: "active" | "paused" | "completed";
  } | null;
};

export type FlowOutput =
  | { kind: "text"; text: string }
  | { kind: "buttons"; text: string; buttons: { id: string; title: string }[] }
  | {
      kind: "list";
      text: string;
      button: string;
      rows: { id: string; title: string; description?: string }[];
    }
  | { kind: "template"; name: string; language: string; params: string[] };

export type FlowAction =
  | { kind: "enroll"; courseId: string }
  | { kind: "start_course" }
  | { kind: "tag"; tag: string }
  | { kind: "handoff"; note: string | null }
  | { kind: "goto_flow"; flowId: string };

export type FlowOutcome =
  | "waiting_reply"
  | "waiting_delay"
  | "completed"
  | "handed_off"
  | "start_course"
  | "goto_flow"
  /** A free-form message was due but the window is closed (or a delay resumed late). */
  | "window_closed"
  | "step_limit"
  /** The input does not apply to the session (finished, or a reply while a delay is pending). */
  | "ignored"
  | "missing_node";

export type FlowResult = {
  outcome: FlowOutcome;
  state: FlowSessionState;
  outputs: FlowOutput[];
  actions: FlowAction[];
};

export type RunArgs = {
  graph: FlowGraph;
  state: FlowSessionState;
  input: FlowInput;
  now: Date;
  context: FlowContext;
};

export const initialState = (): FlowSessionState => ({
  status: "waiting_reply",
  currentNodeId: null,
  variables: {},
  waitUntil: null,
});

/** Button and list-row ids sent to WhatsApp, so replies route back to the right node and option. */
export const optionReplyId = (nodeId: string, optionId: string) =>
  `${FLOW_BUTTON_PREFIX}${nodeId}:${optionId}`;

/** Fills {{name}}, {{course}} and {{var.x}}; unknown values become empty. */
export function interpolate(
  text: string,
  variables: Record<string, string>,
  context: FlowContext,
) {
  return text.replace(
    /\{\{\s*([a-z][a-z0-9_.]*)\s*\}\}/gi,
    (_, key: string) => {
      if (key === "name") return context.learnerName ?? "";
      if (key === "course") return context.courseTitle ?? "";
      if (key.startsWith("var.")) return variables[key.slice(4)] ?? "";
      return "";
    },
  );
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function acceptsAnswer(data: DataOf<"ask">, reply: string) {
  const value = reply.trim();
  if (!value) return false;
  switch (data.validate) {
    case "number":
      return /^-?\d+(\.\d+)?$/.test(value);
    case "email":
      return EMAIL.test(value);
    case "regex":
      try {
        // Staff-authored pattern; cap the input it runs on.
        return new RegExp(data.pattern ?? "").test(value.slice(0, 256));
      } catch {
        return false;
      }
    default:
      return true;
  }
}

function ruleHolds(
  rule: ConditionRule,
  variables: Record<string, string>,
  context: FlowContext,
) {
  switch (rule.source) {
    case "window":
      return context.windowOpen === (rule.op === "open");
    case "enrollment": {
      const status = context.enrollment?.status;
      if (rule.op === "none") return !status;
      if (rule.op === "completed") return status === "completed";
      return status === "active" || status === "paused";
    }
    case "variable": {
      const current = variables[rule.variable];
      const value = rule.value ?? "";
      switch (rule.op) {
        case "exists":
          return current !== undefined && current !== "";
        case "not_exists":
          return current === undefined || current === "";
        case "equals":
          return (
            (current ?? "").trim().toLowerCase() === value.trim().toLowerCase()
          );
        case "not_equals":
          return (
            (current ?? "").trim().toLowerCase() !== value.trim().toLowerCase()
          );
        case "contains":
          return (current ?? "").toLowerCase().includes(value.toLowerCase());
        case "gt":
        case "lt": {
          const a = Number(current);
          const b = Number(value);
          if (current === undefined || Number.isNaN(a) || Number.isNaN(b))
            return false;
          return rule.op === "gt" ? a > b : a < b;
        }
      }
    }
  }
}

/** Which option a reply picked: the button/row id first, then a typed title (case-insensitive). */
function pickedOption(
  node: NodeOf<"message">,
  input: Extract<FlowInput, { kind: "reply" }>,
) {
  const items = optionsOf(node);
  const prefix = `${FLOW_BUTTON_PREFIX}${node.id}:`;
  if (input.replyId?.startsWith(prefix)) {
    const found = items.find(
      (item) => item.id === input.replyId!.slice(prefix.length),
    );
    if (found) return found;
  }
  const typed = input.text.trim().toLowerCase();
  return (
    items.find((item) => item.title.trim().toLowerCase() === typed) ?? null
  );
}

/**
 * Advances a session by one input. Walks the graph from the waiting node (or the trigger on start)
 * until the next wait or the end, collecting messages to send and actions for the server to execute.
 */
export function runFlow({
  graph,
  state,
  input,
  now,
  context,
}: RunArgs): FlowResult {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const edges = new Map(
    graph.edges.map((edge) => [
      `${edge.source}\u0000${edge.sourceHandle ?? DEFAULT_HANDLE}`,
      edge.target,
    ]),
  );
  const nextOf = (nodeId: string, handle = DEFAULT_HANDLE) =>
    edges.get(`${nodeId}\u0000${handle}`) ?? null;
  const outputs: FlowOutput[] = [];
  const actions: FlowAction[] = [];
  const variables = { ...state.variables };
  const finish = (
    outcome: FlowOutcome,
    status: SessionStatus,
    nodeId: string | null = null,
    waitUntil: string | null = null,
  ): FlowResult => ({
    outcome,
    state: { status, currentNodeId: nodeId, variables, waitUntil },
    outputs,
    actions,
  });
  const unchanged = (outcome: FlowOutcome): FlowResult => ({
    outcome,
    state,
    outputs: [],
    actions: [],
  });
  const fill = (text: string) => interpolate(text, variables, context);

  let current: string | null;
  if (input.kind === "start") {
    const trigger = graph.nodes.find((node) => node.type === "trigger");
    if (!trigger) return finish("missing_node", "expired");
    current = nextOf(trigger.id);
  } else {
    const waiting = state.currentNodeId
      ? nodes.get(state.currentNodeId)
      : undefined;
    if (state.status === "waiting_reply" && input.kind === "reply") {
      if (!waiting) return finish("missing_node", "expired");
      if (hasOptions(waiting)) {
        const picked = pickedOption(waiting, input);
        // The chosen title is available to later steps as {{var.last_choice}}.
        if (picked) variables.last_choice = picked.title;
        const handle = picked ? picked.id : OTHER_HANDLE;
        current = nextOf(waiting.id, handle);
        // An unmatched reply with no "other" path asks again.
        if (!picked && !current) {
          outputs.push(messageOutput(waiting, fill));
          return finish("waiting_reply", "waiting_reply", waiting.id);
        }
      } else if (waiting.type === "ask") {
        if (acceptsAnswer(waiting.data, input.text)) {
          variables[waiting.data.variable] = input.text.trim();
          current = nextOf(waiting.id, "valid");
        } else {
          current = nextOf(waiting.id, "invalid");
          if (!current) {
            outputs.push({
              kind: "text",
              text: fill(waiting.data.retryText?.trim() || waiting.data.text),
            });
            return finish("waiting_reply", "waiting_reply", waiting.id);
          }
        }
      } else if (waiting.type === "template") {
        if (waiting.data.variable)
          variables[waiting.data.variable] = input.text.trim();
        current = nextOf(waiting.id);
      } else return unchanged("ignored");
    } else if (state.status === "waiting_delay" && input.kind === "resume") {
      if (!waiting) return finish("missing_node", "expired");
      if (
        state.waitUntil &&
        now.getTime() < new Date(state.waitUntil).getTime()
      )
        return unchanged("ignored");
      current = nextOf(waiting.id);
    } else return unchanged("ignored");
  }

  for (let steps = 0; current; steps++) {
    if (steps >= MAX_STEPS) return finish("step_limit", "expired", current);
    const node = nodes.get(current);
    if (!node) return finish("missing_node", "expired");
    if (sendsFreeForm(node) && !context.windowOpen)
      return finish("window_closed", "expired", node.id);
    switch (node.type) {
      case "trigger":
        return finish("missing_node", "expired");
      case "message":
        outputs.push(messageOutput(node, fill));
        if (optionsOf(node).length)
          return finish("waiting_reply", "waiting_reply", node.id);
        current = nextOf(node.id);
        break;
      case "ask":
        outputs.push({ kind: "text", text: fill(node.data.text) });
        return finish("waiting_reply", "waiting_reply", node.id);
      case "template":
        outputs.push({
          kind: "template",
          name: node.data.name,
          language: node.data.language,
          params: node.data.params.map(fill),
        });
        if (node.data.waitForReply && nextOf(node.id))
          return finish("waiting_reply", "waiting_reply", node.id);
        current = nextOf(node.id);
        break;
      case "delay":
        if (!nextOf(node.id)) return finish("completed", "completed");
        return finish(
          "waiting_delay",
          "waiting_delay",
          node.id,
          new Date(
            now.getTime() + delayMinutes(node.data) * 60_000,
          ).toISOString(),
        );
      case "condition": {
        const results = node.data.rules.map((rule) =>
          ruleHolds(rule, variables, context),
        );
        const holds =
          node.data.match === "any"
            ? results.some(Boolean)
            : results.every(Boolean);
        current = nextOf(node.id, holds ? "true" : "false");
        break;
      }
      case "enroll": {
        // One active course per learner (enrollLearner): an existing active or paused enrollment blocks.
        const enrollment = context.enrollment;
        const blocked = Boolean(
          enrollment && enrollment.status !== "completed",
        );
        if (!blocked)
          actions.push({ kind: "enroll", courseId: node.data.courseId });
        current = nextOf(node.id, blocked ? "blocked" : "enrolled");
        break;
      }
      case "set_variable":
        variables[node.data.variable] = fill(node.data.value);
        current = nextOf(node.id);
        break;
      case "tag":
        actions.push({ kind: "tag", tag: node.data.tag });
        current = nextOf(node.id);
        break;
      case "start_course":
        actions.push({ kind: "start_course" });
        return finish("start_course", "completed");
      case "handoff":
        actions.push({ kind: "handoff", note: node.data.note?.trim() || null });
        return finish("handed_off", "handed_off", node.id);
      case "goto_flow":
        actions.push({ kind: "goto_flow", flowId: node.data.flowId });
        return finish("goto_flow", "completed");
      case "end":
        return finish("completed", "completed");
    }
  }
  return finish("completed", "completed");
}

function messageOutput(
  node: NodeOf<"message">,
  fill: (text: string) => string,
): FlowOutput {
  const text = fill(node.data.text);
  if (node.data.buttons?.length)
    return {
      kind: "buttons",
      text,
      buttons: node.data.buttons.map((item) => ({
        id: optionReplyId(node.id, item.id),
        title: item.title,
      })),
    };
  if (node.data.list?.rows.length)
    return {
      kind: "list",
      text,
      button: node.data.list.button,
      rows: node.data.list.rows.map((row) => ({
        id: optionReplyId(node.id, row.id),
        title: row.title,
        ...(row.description ? { description: row.description } : {}),
      })),
    };
  return { kind: "text", text };
}
