import type { SupabaseClient } from "@supabase/supabase-js";

export type Row = Record<string, unknown>;
type RpcHandler = (args: Row) => {
  data?: unknown;
  error?: { code?: string; message: string } | null;
};

// Minimal in-memory stand-in for the Supabase query-builder calls server modules make.
// Supports select/insert/upsert/update with eq, in, order, single and maybeSingle, plus rpc and
// auth.admin.getUserById. It does not emulate RLS: those rules are verified against Postgres.
export function fakeSupabase(
  options: {
    rpc?: Record<string, RpcHandler>;
    users?: Record<string, string>;
  } = {},
) {
  const tables: Record<string, Row[]> = {};
  const rows = (table: string) => (tables[table] ||= []);
  let nextId = 1;

  const from = (table: string) => {
    let op: "select" | "insert" | "upsert" | "update" = "select";
    let values: Row = {};
    let upsertOptions: { onConflict?: string; ignoreDuplicates?: boolean } = {};
    const filters: Array<(row: Row) => boolean> = [];
    let sort: { column: string; ascending: boolean } | null = null;
    let mode: "many" | "single" | "maybeSingle" = "many";

    const run = () => {
      const matching = () =>
        rows(table).filter((row) => filters.every((filter) => filter(row)));
      if (op === "insert") {
        rows(table).push({ id: String(nextId++), ...values });
        return { data: null, error: null };
      }
      if (op === "upsert") {
        const keys = (upsertOptions.onConflict || "id").split(",");
        const existing = rows(table).find((row) =>
          keys.every((key) => row[key] === values[key]),
        );
        if (existing) {
          if (!upsertOptions.ignoreDuplicates) Object.assign(existing, values);
        } else {
          rows(table).push({ id: String(nextId++), ...values });
        }
        return { data: null, error: null };
      }
      if (op === "update") {
        matching().forEach((row) => Object.assign(row, values));
        return { data: null, error: null };
      }
      const found = matching();
      if (sort) {
        const { column, ascending } = sort;
        found.sort(
          (a, b) =>
            (a[column] === b[column]
              ? 0
              : (a[column] as never) < (b[column] as never)
                ? -1
                : 1) * (ascending ? 1 : -1),
        );
      }
      if (mode === "many") return { data: found, error: null };
      if (mode === "single" && found.length !== 1)
        return { data: null, error: { message: "expected one row" } };
      return { data: found[0] ?? null, error: null };
    };

    const builder = {
      select: () => builder,
      insert: (row: Row) => ((op = "insert"), (values = row), builder),
      upsert: (row: Row, opts = {}) => (
        (op = "upsert"),
        (values = row),
        (upsertOptions = opts),
        builder
      ),
      update: (row: Row) => ((op = "update"), (values = row), builder),
      eq: (column: string, value: unknown) => (
        filters.push((row) => row[column] === value),
        builder
      ),
      in: (column: string, list: unknown[]) => (
        filters.push((row) => list.includes(row[column])),
        builder
      ),
      order: (column: string, opts: { ascending?: boolean } = {}) => (
        (sort = { column, ascending: opts.ascending ?? true }),
        builder
      ),
      limit: () => builder,
      single: () => ((mode = "single"), builder),
      maybeSingle: () => ((mode = "maybeSingle"), builder),
      then: (
        resolve: (value: unknown) => unknown,
        reject?: (reason: unknown) => unknown,
      ) => Promise.resolve().then(run).then(resolve, reject),
    };
    return builder;
  };

  const rpc = async (name: string, args: Row) => {
    const handler = options.rpc?.[name];
    if (!handler)
      return { data: null, error: { message: `unknown rpc ${name}` } };
    const result = handler(args);
    return { data: result.data ?? null, error: result.error ?? null };
  };

  const auth = {
    admin: {
      getUserById: async (id: string) => ({
        data: {
          user: options.users?.[id] ? { id, email: options.users[id] } : null,
        },
        error: null,
      }),
    },
  };

  return { client: { from, rpc, auth } as unknown as SupabaseClient, rows };
}
