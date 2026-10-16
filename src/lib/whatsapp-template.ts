export type ReplyTemplate = { id: string; name: string; language: string; body: string; variables: string[] };

export function parseReplyTemplates(payload: unknown): ReplyTemplate[] {
  if (!payload || typeof payload !== "object" || !("data" in payload) || !Array.isArray(payload.data)) return [];
  return payload.data.flatMap((item: unknown) => {
    if (!item || typeof item !== "object") return [];
    const t = item as Record<string, unknown>;
    if (t.status !== "APPROVED" || typeof t.id !== "string" || typeof t.name !== "string" || typeof t.language !== "string" || !Array.isArray(t.components)) return [];
    const components = t.components as Record<string, unknown>[];
    const body = components.find((c) => c.type === "BODY");
    // The reply composer supports text-only templates; never silently omit required media/button parameters.
    if (!body || typeof body.text !== "string" || body.parameter_format === "NAMED" || t.parameter_format === "NAMED") return [];
    if (components.some((c) => c.type === "HEADER" && (c.format !== "TEXT" || /\{\{/.test(String(c.text))))) return [];
    if (components.some((c) => c.type === "BUTTONS" && Array.isArray(c.buttons) && c.buttons.some((b: Record<string, unknown>) => b.type !== "URL" || /\{\{/.test(String(b.url))))) return [];
    const variables = [...new Set([...body.text.matchAll(/\{\{(\d+)\}\}/g)].map((m) => m[1]))].sort((a, b) => Number(a) - Number(b));
    if (variables.some((v, i) => Number(v) !== i + 1)) return [];
    return [{ id: t.id, name: t.name, language: t.language, body: body.text, variables }];
  });
}

export function renderReplyTemplate(template: ReplyTemplate, parameters: string[]) {
  return template.body.replace(/\{\{(\d+)\}\}/g, (match, position) => parameters[Number(position) - 1] ?? match);
}