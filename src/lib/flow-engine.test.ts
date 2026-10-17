import { describe, expect, it } from "vitest";
import {
  acceptedAnswer,
  immediateGotoTargets,
  initialState,
  interpolate,
  MAX_STEPS,
  normalizeKeyword,
  optionReplyId,
  runFlow,
  validateGraph,
  validateKeywords,
  type FlowContext,
  type FlowEdge,
  type FlowGraph,
  type FlowInput,
  type FlowKind,
  type FlowNode,
  type FlowSessionState,
} from "./flow-engine";

const now = new Date("2026-10-17T09:00:00Z");
const open: FlowContext = { windowOpen: true, learnerName: "Asha" };

let edgeCount = 0;
const edge = (
  source: string,
  target: string,
  sourceHandle?: string,
): FlowEdge => ({
  id: `e${++edgeCount}`,
  source,
  target,
  ...(sourceHandle ? { sourceHandle } : {}),
});
const trigger: FlowNode = { id: "t", type: "trigger", data: {} };
const text = (id: string, body: string): FlowNode => ({
  id,
  type: "message",
  data: { text: body },
});
const menu: FlowNode = {
  id: "menu",
  type: "message",
  data: {
    text: "Hi {{name}}, pick one",
    buttons: [
      { id: "courses", title: "Courses" },
      { id: "help", title: "Talk to us" },
    ],
  },
};
const graph = (nodes: FlowNode[], edges: FlowEdge[]): FlowGraph => ({
  nodes: [trigger, ...nodes],
  edges,
});
const errors = (value: unknown, kind: FlowKind = "keyword") =>
  validateGraph(value, { kind })
    .issues.filter((issue) => issue.severity === "error")
    .map((issue) => issue.code);

const run = (
  g: FlowGraph,
  input: FlowInput,
  state: FlowSessionState = initialState(),
  context: FlowContext = open,
  at = now,
) => runFlow({ graph: g, state, input, now: at, context });

describe("validateGraph", () => {
  it("accepts a menu flow", () => {
    const g = graph(
      [menu, text("a", "Our courses"), { id: "h", type: "handoff", data: {} }],
      [
        edge("t", "menu"),
        edge("menu", "a", "courses"),
        edge("menu", "h", "help"),
      ],
    );
    expect(validateGraph(g, { kind: "keyword" })).toMatchObject({
      ok: true,
      issues: [],
    });
  });

  it("reports malformed graphs against the offending node", () => {
    const result = validateGraph(
      { nodes: [{ id: "x", type: "message", data: {} }], edges: [] },
      { kind: "keyword" },
    );
    expect(result.ok).toBe(false);
    expect(result.issues[0]).toMatchObject({
      code: "invalid_shape",
      nodeId: "x",
    });
    expect(
      errors({ nodes: [{ id: "x", type: "rocket", data: {} }], edges: [] }),
    ).toContain("invalid_shape");
  });

  it("needs exactly one connected trigger", () => {
    expect(errors({ nodes: [text("a", "hi")], edges: [] })).toContain(
      "trigger_count",
    );
    expect(errors(graph([], []))).toContain("empty_flow");
    expect(
      errors({
        nodes: [trigger, { ...trigger, id: "t2" }, text("a", "x")],
        edges: [edge("t", "a"), edge("t2", "a")],
      }),
    ).toContain("trigger_count");
  });

  it("rejects unreachable steps, dangling edges and reused outputs", () => {
    expect(
      errors(graph([text("a", "x"), text("b", "y")], [edge("t", "a")])),
    ).toContain("unreachable");
    expect(
      errors(graph([text("a", "x")], [edge("t", "a"), edge("a", "zz")])),
    ).toContain("dangling_edge");
    expect(
      errors(
        graph(
          [text("a", "x"), text("b", "y")],
          [edge("t", "a"), edge("t", "b")],
        ),
      ),
    ).toContain("duplicate_handle");
    expect(
      errors(graph([text("a", "x")], [edge("t", "a"), edge("a", "t")])),
    ).toContain("edge_into_trigger");
    expect(
      errors(
        graph([text("a", "x")], [edge("t", "a"), edge("a", "a", "courses")]),
      ),
    ).toContain("invalid_handle");
  });

  it("enforces WhatsApp button and list limits", () => {
    const buttons = (titles: string[]): FlowNode => ({
      id: "m",
      type: "message",
      data: {
        text: "Pick",
        buttons: titles.map((title, index) => ({ id: `b${index}`, title })),
      },
    });
    const g = (node: FlowNode) => graph([node], [edge("t", node.id)]);
    expect(errors(g(buttons(["a", "b", "c", "d"])))).toContain(
      "too_many_buttons",
    );
    expect(errors(g(buttons(["This title is far too long"])))).toContain(
      "invalid_option_title",
    );
    expect(errors(g(buttons(["Yes", "yes"])))).toContain("duplicate_option");
    const rows = Array.from({ length: 11 }, (_, index) => ({
      id: `r${index}`,
      title: `Row ${index}`,
    }));
    expect(
      errors(
        g({
          id: "m",
          type: "message",
          data: { text: "Pick", list: { button: "Open", rows } },
        }),
      ),
    ).toContain("too_many_rows");
    expect(
      errors(
        g({
          id: "m",
          type: "message",
          data: { text: "Pick", list: { button: "", rows: rows.slice(0, 2) } },
        }),
      ),
    ).toContain("invalid_list_button");
    expect(
      errors(g({ id: "m", type: "message", data: { text: " " } })),
    ).toContain("empty_text");
  });

  it("warns when an option leads nowhere", () => {
    const result = validateGraph(
      graph(
        [menu, text("a", "x")],
        [edge("t", "menu"), edge("menu", "a", "courses")],
      ),
      { kind: "keyword" },
    );
    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([
      expect.objectContaining({
        severity: "warning",
        code: "unconnected_option",
        nodeId: "menu",
      }),
    ]);
  });

  it("rejects loops that never wait", () => {
    const loop = graph(
      [
        text("a", "x"),
        { id: "s", type: "set_variable", data: { variable: "n", value: "1" } },
      ],
      [edge("t", "a"), edge("a", "s"), edge("s", "a")],
    );
    expect(errors(loop)).toContain("loop_without_wait");
    const waiting = graph(
      [menu, text("a", "x")],
      [edge("t", "menu"), edge("menu", "a", "courses"), edge("a", "menu")],
    );
    expect(errors(waiting)).toEqual([]);
  });

  it("requires a template after delays that may outlast the window", () => {
    const delay = (
      id: string,
      amount: number,
      unit: "hours" | "days",
    ): FlowNode => ({ id, type: "delay", data: { amount, unit } });
    const tpl: FlowNode = {
      id: "tpl",
      type: "template",
      data: {
        name: "nudge",
        language: "en",
        params: ["{{name}}"],
        waitForReply: true,
      },
    };
    expect(
      errors(
        graph(
          [delay("d", 2, "hours"), text("a", "x")],
          [edge("t", "d"), edge("d", "a")],
        ),
      ),
    ).toEqual([]);
    expect(
      errors(
        graph(
          [delay("d", 1, "days"), text("a", "x")],
          [edge("t", "d"), edge("d", "a")],
        ),
      ),
    ).toContain("needs_template");
    expect(
      errors(
        graph(
          [delay("d1", 12, "hours"), delay("d2", 12, "hours"), text("a", "x")],
          [edge("t", "d1"), edge("d1", "d2"), edge("d2", "a")],
        ),
      ),
    ).toContain("needs_template");
    expect(
      errors(
        graph(
          [delay("d", 2, "days"), tpl, text("a", "x")],
          [edge("t", "d"), edge("d", "tpl"), edge("tpl", "a")],
        ),
      ),
    ).toEqual([]);
    const noWait = {
      ...tpl,
      data: { ...tpl.data, waitForReply: false },
    } as FlowNode;
    expect(
      errors(
        graph(
          [delay("d", 2, "days"), noWait, text("a", "x")],
          [edge("t", "d"), edge("d", "tpl"), edge("tpl", "a")],
        ),
      ),
    ).toContain("needs_template");
    // A reply resets the window clock.
    expect(
      errors(
        graph(
          [
            delay("d", 20, "hours"),
            menu,
            delay("d2", 20, "hours"),
            text("a", "x"),
          ],
          [
            edge("t", "d"),
            edge("d", "menu"),
            edge("menu", "d2", "courses"),
            edge("d2", "a"),
          ],
        ),
      ),
    ).toEqual([]);
  });

  it("makes broadcasts open with a template", () => {
    const tpl: FlowNode = {
      id: "tpl",
      type: "template",
      data: { name: "promo", language: "en", params: [], waitForReply: true },
    };
    expect(
      errors(graph([text("a", "x")], [edge("t", "a")]), "broadcast"),
    ).toContain("needs_template");
    expect(
      errors(
        graph([tpl, text("a", "x")], [edge("t", "tpl"), edge("tpl", "a")]),
        "broadcast",
      ),
    ).toEqual([]);
  });

  it("checks templates, flows and courses against the server's lists", () => {
    const tpl: FlowNode = {
      id: "tpl",
      type: "template",
      data: {
        name: "promo",
        language: "en",
        params: ["x"],
        waitForReply: false,
      },
    };
    const g = graph([tpl], [edge("t", "tpl")]);
    const codes = (
      templates: { name: string; language: string; variables: number }[],
    ) =>
      validateGraph(g, { kind: "keyword", templates }).issues.map(
        (issue) => issue.code,
      );
    expect(codes([])).toContain("template_not_approved");
    expect(
      codes([{ name: "promo", language: "en_US", variables: 1 }]),
    ).toContain("template_not_approved");
    expect(codes([{ name: "promo", language: "en", variables: 2 }])).toContain(
      "template_params_mismatch",
    );
    expect(codes([{ name: "promo", language: "en", variables: 1 }])).toEqual(
      [],
    );

    const goto = graph(
      [{ id: "g", type: "goto_flow", data: { flowId: "f1" } }],
      [edge("t", "g")],
    );
    expect(
      validateGraph(goto, { kind: "keyword", flowId: "f1" }).issues.map(
        (issue) => issue.code,
      ),
    ).toContain("goto_self");
    expect(
      validateGraph(goto, { kind: "keyword", flowIds: ["f2"] }).issues.map(
        (issue) => issue.code,
      ),
    ).toContain("unknown_flow");

    const enroll = graph(
      [{ id: "en", type: "enroll", data: { courseId: "c1" } }],
      [edge("t", "en")],
    );
    expect(
      validateGraph(enroll, { kind: "keyword", courseIds: ["c2"] }).issues.map(
        (issue) => issue.code,
      ),
    ).toContain("unknown_course");
  });

  it("checks variable names and ask patterns", () => {
    const ask = (data: Record<string, unknown>): FlowNode =>
      ({
        id: "q",
        type: "ask",
        data: {
          text: "Your email?",
          variable: "email",
          validate: "text",
          ...data,
        },
      }) as FlowNode;
    const g = (node: FlowNode) => graph([node], [edge("t", node.id)]);
    expect(errors(g(ask({ variable: "Email Address" })))).toContain(
      "invalid_variable",
    );
    // Free regular expressions are not accepted (they could block the webhook).
    expect(errors(g(ask({ validate: "regex", pattern: "^(a+)+$" })))).toContain(
      "invalid_shape",
    );
    expect(errors(g(ask({ validate: "one_of" })))).toContain("invalid_choices");
    expect(errors(g(ask({ minLength: 5, maxLength: 2 })))).toContain(
      "invalid_length",
    );
    expect(
      errors(g(ask({ validate: "one_of", choices: ["Yes", "No"] }))),
    ).toEqual([]);
  });

  it("validates list rows when buttons is an empty array", () => {
    const node: FlowNode = {
      id: "m",
      type: "message",
      data: {
        text: "Pick",
        buttons: [],
        list: { button: "Open", rows: [{ id: "r1", title: "x".repeat(40) }] },
      },
    };
    const result = validateGraph(
      graph([node, text("a", "x")], [edge("t", "m"), edge("m", "a")]),
      { kind: "keyword" },
    );
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["invalid_option_title", "invalid_handle"]),
    );
    const sent = run(graph([node], [edge("t", "m")]), { kind: "start" });
    expect(sent).toMatchObject({
      outcome: "waiting_reply",
      outputs: [{ kind: "list" }],
    });
  });

  it("refuses chains longer than one run may go", () => {
    const nodes: FlowNode[] = Array.from(
      { length: MAX_STEPS + 1 },
      (_, index) => ({
        id: `s${index}`,
        type: "set_variable",
        data: { variable: "n", value: String(index) },
      }),
    );
    const chain = (count: number) =>
      graph(nodes.slice(0, count), [
        edge("t", "s0"),
        ...nodes
          .slice(1, count)
          .map((node, index) => edge(`s${index}`, node.id)),
      ]);
    expect(errors(chain(MAX_STEPS))).toEqual([]);
    expect(errors(chain(MAX_STEPS + 1))).toContain("run_too_long");
  });

  it("needs defaults for variables in template values", () => {
    const tpl = (param: string): FlowNode => ({
      id: "tpl",
      type: "template",
      data: {
        name: "promo",
        language: "en",
        params: [param],
        waitForReply: false,
      },
    });
    const g = (param: string) => graph([tpl(param)], [edge("t", "tpl")]);
    expect(errors(g("{{var.city}}"))).toContain("template_param_needs_default");
    expect(errors(g("{{var.city|your city}}"))).toEqual([]);
  });

  it("refuses flows that hand over to each other without waiting", () => {
    const goto = graph(
      [{ id: "g", type: "goto_flow", data: { flowId: "f2" } }],
      [edge("t", "g")],
    );
    const codes = (gotoTargets: Record<string, string[]>) =>
      validateGraph(goto, {
        kind: "keyword",
        flowId: "f1",
        gotoTargets,
      }).issues.map((issue) => issue.code);
    expect(codes({ f2: ["f3"], f3: ["f1"] })).toContain("goto_loop");
    expect(codes({ f2: ["f3"], f3: [] })).toEqual([]);
    // A wait before the hand-over breaks the loop.
    const waiting = graph(
      [menu, { id: "g", type: "goto_flow", data: { flowId: "f2" } }],
      [edge("t", "menu"), edge("menu", "g", "courses")],
    );
    expect(immediateGotoTargets(waiting)).toEqual([]);
    expect(immediateGotoTargets(goto)).toEqual(["f2"]);
  });
});

describe("validateKeywords", () => {
  it("normalizes, dedupes and rejects reserved words", () => {
    expect(normalizeKeyword("  Hello   World ")).toBe("hello world");
    expect(validateKeywords(["Menu", "menu ", "INFO"])).toEqual({
      keywords: ["menu", "info"],
      issues: [],
    });
    const codes = (values: string[]) =>
      validateKeywords(values).issues.map((issue) => issue.code);
    expect(codes([])).toContain("no_keywords");
    expect(codes(["STOP"])).toContain("reserved_keyword");
    expect(codes(["Next"])).toContain("reserved_keyword");
    expect(codes(["course:next"])).toContain("reserved_keyword");
    expect(codes(["help:menu"])).toContain("reserved_keyword");
    expect(codes(["x".repeat(33)])).toContain("keyword_too_long");
  });
});

describe("runFlow", () => {
  const menuFlow = graph(
    [
      menu,
      text("a", "Courses: {{var.topic}}"),
      { id: "h", type: "handoff", data: { note: "Wants a human" } },
    ],
    [
      edge("t", "menu"),
      edge("menu", "a", "courses"),
      edge("menu", "h", "help"),
    ],
  );

  it("starts at the trigger and waits on a menu", () => {
    const result = run(menuFlow, { kind: "start" });
    expect(result.outcome).toBe("waiting_reply");
    expect(result.state).toMatchObject({
      status: "waiting_reply",
      currentNodeId: "menu",
    });
    expect(result.outputs).toEqual([
      {
        kind: "buttons",
        text: "Hi Asha, pick one",
        buttons: [
          { id: "flow:menu:courses", title: "Courses" },
          { id: "flow:menu:help", title: "Talk to us" },
        ],
      },
    ]);
  });

  it("follows the tapped button or a typed title", () => {
    const waiting = run(menuFlow, { kind: "start" }).state;
    const tapped = run(
      menuFlow,
      {
        kind: "reply",
        text: "Courses",
        replyId: optionReplyId("menu", "courses"),
      },
      waiting,
    );
    expect(tapped).toMatchObject({
      outcome: "completed",
      state: { status: "completed", currentNodeId: null },
    });
    expect(tapped.outputs).toEqual([{ kind: "text", text: "Courses: " }]);
    const typed = run(
      menuFlow,
      { kind: "reply", text: "  talk TO us " },
      waiting,
    );
    expect(typed).toMatchObject({
      outcome: "handed_off",
      state: { status: "handed_off" },
      actions: [{ kind: "handoff", note: "Wants a human" }],
    });
  });

  it("asks again on an unmatched reply unless an other path exists", () => {
    const waiting = run(menuFlow, { kind: "start" }).state;
    const again = run(menuFlow, { kind: "reply", text: "banana" }, waiting);
    expect(again).toMatchObject({
      outcome: "waiting_reply",
      state: { currentNodeId: "menu" },
    });
    expect(again.outputs[0]).toMatchObject({ kind: "buttons" });

    const withOther = {
      ...menuFlow,
      edges: [...menuFlow.edges, edge("menu", "a", "other")],
    };
    expect(
      run(withOther, { kind: "reply", text: "banana" }, waiting).outcome,
    ).toBe("completed");
  });

  it("ignores button taps meant for another node", () => {
    const waiting = run(menuFlow, { kind: "start" }).state;
    const result = run(
      menuFlow,
      { kind: "reply", text: "x", replyId: optionReplyId("other", "courses") },
      waiting,
    );
    expect(result.state.currentNodeId).toBe("menu");
  });

  it("saves validated answers and re-asks invalid ones", () => {
    const g = graph(
      [
        {
          id: "q",
          type: "ask",
          data: {
            text: "Age?",
            variable: "age",
            validate: "number",
            retryText: "Numbers only please",
          },
        },
        text("a", "You are {{var.age}}"),
      ],
      [edge("t", "q"), edge("q", "a", "valid")],
    );
    const waiting = run(g, { kind: "start" });
    expect(waiting.outputs).toEqual([{ kind: "text", text: "Age?" }]);
    const bad = run(g, { kind: "reply", text: "old" }, waiting.state);
    expect(bad).toMatchObject({
      outcome: "waiting_reply",
      outputs: [{ kind: "text", text: "Numbers only please" }],
    });
    const good = run(g, { kind: "reply", text: " 31 " }, bad.state);
    expect(good.outputs).toEqual([{ kind: "text", text: "You are 31" }]);
    expect(good.state.variables).toEqual({ age: "31" });
  });

  it("branches on variables, enrollment and window", () => {
    const g = graph(
      [
        {
          id: "c",
          type: "condition",
          data: {
            match: "all",
            rules: [
              {
                source: "variable",
                variable: "plan",
                op: "equals",
                value: "PRO",
              },
              { source: "enrollment", op: "none" },
            ],
          },
        },
        text("yes", "yes"),
        text("no", "no"),
      ],
      [edge("t", "c"), edge("c", "yes", "true"), edge("c", "no", "false")],
    );
    const state = { ...initialState(), variables: { plan: "pro" } };
    expect(run(g, { kind: "start" }, state).outputs).toEqual([
      { kind: "text", text: "yes" },
    ]);
    expect(
      run(g, { kind: "start" }, state, {
        ...open,
        enrollment: { courseId: "c", status: "active" },
      }).outputs,
    ).toEqual([{ kind: "text", text: "no" }]);
  });

  it("treats empty numbers as missing and sees a new enrollment", () => {
    const cond = (rules: unknown[]): FlowNode =>
      ({
        id: "c",
        type: "condition",
        data: { match: "all", rules },
      }) as FlowNode;
    const g = (node: FlowNode, before: FlowNode[] = [], first = "c") =>
      graph(
        [...before, node, text("yes", "yes"), text("no", "no")],
        [
          edge("t", first),
          ...(before.length ? [edge(before[0].id, "c", "enrolled")] : []),
          edge("c", "yes", "true"),
          edge("c", "no", "false"),
        ],
      );
    const lt = cond([
      { source: "variable", variable: "score", op: "lt", value: "5" },
    ]);
    expect(
      run(
        g(lt),
        { kind: "start" },
        { ...initialState(), variables: { score: "" } },
      ).outputs,
    ).toEqual([{ kind: "text", text: "no" }]);
    const enrolled = g(
      cond([{ source: "enrollment", op: "active" }]),
      [{ id: "en", type: "enroll", data: { courseId: "c1" } }],
      "en",
    );
    expect(run(enrolled, { kind: "start" }).outputs).toEqual([
      { kind: "text", text: "yes" },
    ]);
  });

  it("stops instead of sending a template with an empty value", () => {
    const g = graph(
      [
        {
          id: "tpl",
          type: "template",
          data: {
            name: "promo",
            language: "en",
            params: ["{{name}}"],
            waitForReply: false,
          },
        },
      ],
      [edge("t", "tpl")],
    );
    expect(
      run(g, { kind: "start" }, initialState(), { windowOpen: false }),
    ).toMatchObject({ outcome: "template_param_empty", outputs: [] });
  });

  it("waits on delays and resumes only once due", () => {
    const g = graph(
      [
        text("a", "first"),
        { id: "d", type: "delay", data: { amount: 2, unit: "hours" } },
        text("b", "second"),
      ],
      [edge("t", "a"), edge("a", "d"), edge("d", "b")],
    );
    const waiting = run(g, { kind: "start" });
    expect(waiting).toMatchObject({
      outcome: "waiting_delay",
      state: {
        status: "waiting_delay",
        currentNodeId: "d",
        waitUntil: "2026-10-17T11:00:00.000Z",
      },
    });
    expect(run(g, { kind: "resume" }, waiting.state).outcome).toBe("ignored");
    expect(run(g, { kind: "reply", text: "hi" }, waiting.state).outcome).toBe(
      "ignored",
    );
    const resumed = run(
      g,
      { kind: "resume" },
      waiting.state,
      open,
      new Date("2026-10-17T11:05:00Z"),
    );
    expect(resumed).toMatchObject({
      outcome: "completed",
      outputs: [{ kind: "text", text: "second" }],
    });
    const late = run(
      g,
      { kind: "resume" },
      waiting.state,
      { windowOpen: false },
      new Date("2026-10-18T11:05:00Z"),
    );
    expect(late).toMatchObject({
      outcome: "window_closed",
      state: { status: "expired" },
      outputs: [],
    });
  });

  it("sends templates outside the window and waits for the reply", () => {
    const g = graph(
      [
        {
          id: "tpl",
          type: "template",
          data: {
            name: "promo",
            language: "en",
            params: ["{{name}}"],
            waitForReply: true,
            variable: "answer",
          },
        },
        text("a", "Thanks, you said {{var.answer}}"),
      ],
      [edge("t", "tpl"), edge("tpl", "a")],
    );
    const closed = { windowOpen: false, learnerName: "Asha" };
    const sent = run(g, { kind: "start" }, initialState(), closed);
    expect(sent).toMatchObject({
      outcome: "waiting_reply",
      outputs: [
        { kind: "template", name: "promo", language: "en", params: ["Asha"] },
      ],
    });
    expect(run(g, { kind: "reply", text: "Yes" }, sent.state).outputs).toEqual([
      { kind: "text", text: "Thanks, you said Yes" },
    ]);
  });

  it("enrolls only learners without an active course", () => {
    const g = graph(
      [
        { id: "en", type: "enroll", data: { courseId: "c1" } },
        { id: "go", type: "start_course", data: {} },
        text("busy", "Finish your current course first"),
      ],
      [
        edge("t", "en"),
        edge("en", "go", "enrolled"),
        edge("en", "busy", "blocked"),
      ],
    );
    expect(run(g, { kind: "start" })).toMatchObject({
      outcome: "start_course",
      actions: [{ kind: "enroll", courseId: "c1" }, { kind: "start_course" }],
    });
    const busy = run(g, { kind: "start" }, initialState(), {
      ...open,
      enrollment: { courseId: "c9", status: "paused" },
    });
    expect(busy).toMatchObject({
      outcome: "completed",
      actions: [],
      outputs: [{ kind: "text", text: "Finish your current course first" }],
    });
    expect(
      run(g, { kind: "start" }, initialState(), {
        ...open,
        enrollment: { courseId: "c9", status: "completed" },
      }).outcome,
    ).toBe("start_course");
  });

  it("sets variables, tags and hands over to another flow", () => {
    const g = graph(
      [
        {
          id: "s",
          type: "set_variable",
          data: { variable: "src", value: "menu-{{name}}" },
        },
        { id: "tag", type: "tag", data: { tag: "lead" } },
        { id: "g", type: "goto_flow", data: { flowId: "f2" } },
      ],
      [edge("t", "s"), edge("s", "tag"), edge("tag", "g")],
    );
    expect(run(g, { kind: "start" })).toMatchObject({
      outcome: "goto_flow",
      state: { status: "completed", variables: { src: "menu-Asha" } },
      actions: [
        { kind: "tag", tag: "lead" },
        { kind: "goto_flow", flowId: "f2" },
      ],
    });
  });

  it("stops runaway runs and missing nodes", () => {
    const nodes: FlowNode[] = Array.from(
      { length: MAX_STEPS + 2 },
      (_, index) => ({
        id: `s${index}`,
        type: "set_variable",
        data: { variable: "n", value: String(index) },
      }),
    );
    const chain = graph(nodes, [
      edge("t", "s0"),
      ...nodes.slice(1).map((node, index) => edge(`s${index}`, node.id)),
    ]);
    expect(run(chain, { kind: "start" })).toMatchObject({
      outcome: "step_limit",
      state: { status: "expired" },
    });
    const stale = { ...initialState(), currentNodeId: "gone" };
    expect(run(menuFlow, { kind: "reply", text: "x" }, stale)).toMatchObject({
      outcome: "missing_node",
      state: { status: "expired" },
    });
  });

  it("ignores input for finished or handed-off sessions", () => {
    for (const status of ["completed", "expired", "handed_off"] as const)
      expect(
        run(
          menuFlow,
          { kind: "reply", text: "x" },
          { ...initialState(), status, currentNodeId: "menu" },
        ).outcome,
      ).toBe("ignored");
  });
});

describe("interpolate", () => {
  it("fills known values and blanks unknown ones", () => {
    expect(
      interpolate(
        "{{name}} / {{course}} / {{var.a}} / {{var.b}} / {{other}}",
        { a: "1" },
        { windowOpen: true, learnerName: "Asha", courseTitle: "Maths" },
      ),
    ).toBe("Asha / Maths / 1 /  / ");
    expect(
      interpolate(
        "{{var.city|your city}} {{name | friend}}",
        { city: " " },
        {
          windowOpen: true,
        },
      ),
    ).toBe("your city friend");
  });
});

describe("acceptedAnswer", () => {
  const ask = (data: Record<string, unknown>) =>
    ({ text: "?", variable: "a", validate: "text", ...data }) as Parameters<
      typeof acceptedAnswer
    >[0];
  it("checks fixed validators in linear time", () => {
    expect(acceptedAnswer(ask({ validate: "number" }), " 42 ")).toBe("42");
    expect(acceptedAnswer(ask({ validate: "number" }), "4 2")).toBeNull();
    expect(acceptedAnswer(ask({ validate: "email" }), "a@b.co")).toBe("a@b.co");
    expect(acceptedAnswer(ask({ validate: "email" }), "a@b")).toBeNull();
    expect(acceptedAnswer(ask({ validate: "phone" }), "+91 98000-00001")).toBe(
      "919800000001",
    );
    expect(acceptedAnswer(ask({ validate: "phone" }), "12")).toBeNull();
    expect(
      acceptedAnswer(
        ask({ validate: "one_of", choices: ["Yes", "No"] }),
        "yes",
      ),
    ).toBe("Yes");
    expect(acceptedAnswer(ask({ minLength: 3 }), "ab")).toBeNull();
    expect(acceptedAnswer(ask({ maxLength: 3 }), "abcd")).toBeNull();
    const started = Date.now();
    acceptedAnswer(ask({ validate: "email" }), `${"a.".repeat(500)}@`);
    expect(Date.now() - started).toBeLessThan(50);
  });
});
