// A small in-memory stand-in for the PostgREST query builder of supabase-js, for the live read/write adapters.
// It applies filters, ordering (Postgres defaults: ASC puts NULLs last, DESC puts NULLs first), limit and
// maybeSingle to plain rows, so a test sees which row a query really selects. Optional unique checks return
// the 23505 error Postgres would. Only the builder methods the adapters use are implemented.
type Row = Record<string, unknown>;
type Result = { data: unknown; error: { code: string; message: string } | null };
type Unique = (row: Row, others: Row[]) => string | null;

const nil = (value: unknown) => value ?? null;

class Query implements PromiseLike<Result> {
  private filters: ((row: Row) => boolean)[] = [];
  private orders: { column: string; ascending: boolean; nullsFirst: boolean }[] = [];
  private max?: number;
  private single = false;
  private patch?: Row;
  private insertRow?: Row;

  constructor(private rows: Row[], private unique?: Unique) {}

  select() { return this; }
  eq(column: string, value: unknown) { this.filters.push(row => row[column] === value); return this; }
  is(column: string, value: null) { this.filters.push(row => nil(row[column]) === value); return this; }
  in(column: string, values: unknown[]) { this.filters.push(row => values.includes(row[column])); return this; }
  not(column: string, operator: string, value: null) {
    if (operator !== "is") throw new Error(`fake-postgrest: not.${operator} is not implemented`);
    this.filters.push(row => nil(row[column]) !== value);
    return this;
  }
  order(column: string, options: { ascending?: boolean; nullsFirst?: boolean } = {}) {
    const ascending = options.ascending ?? true;
    this.orders.push({ column, ascending, nullsFirst: options.nullsFirst ?? !ascending });
    return this;
  }
  limit(count: number) { this.max = count; return this; }
  maybeSingle() { this.single = true; return this; }
  insert(row: Row) { this.insertRow = row; return this; }
  update(patch: Row) { this.patch = patch; return this; }

  private run(): Result {
    if (this.insertRow) {
      const row = { id: crypto.randomUUID(), client_id: null, archived_at: null, ...this.insertRow };
      const conflict = this.unique?.(row, this.rows);
      if (conflict) return { data: null, error: { code: "23505", message: `duplicate key value violates unique constraint "${conflict}"` } };
      this.rows.push(row);
      return { data: null, error: null };
    }
    let rows = this.rows.filter(row => this.filters.every(filter => filter(row)));
    if (this.patch) {
      for (const row of rows) {
        const next = { ...row, ...this.patch };
        const conflict = this.unique?.(next, this.rows.filter(other => other !== row));
        if (conflict) return { data: null, error: { code: "23505", message: `duplicate key value violates unique constraint "${conflict}"` } };
        Object.assign(row, this.patch);
      }
      return { data: null, error: null };
    }
    rows = [...rows].sort((a, b) => {
      for (const { column, ascending, nullsFirst } of this.orders) {
        const x = nil(a[column]) as string | number | null;
        const y = nil(b[column]) as string | number | null;
        if (x === y) continue;
        if (x === null) return nullsFirst ? -1 : 1;
        if (y === null) return nullsFirst ? 1 : -1;
        return (x < y ? -1 : 1) * (ascending ? 1 : -1);
      }
      return 0;
    });
    if (this.max !== undefined) rows = rows.slice(0, this.max);
    if (!this.single) return { data: rows, error: null };
    if (rows.length > 1) return { data: null, error: { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" } };
    return { data: rows[0] ?? null, error: null };
  }

  then<A = Result, B = never>(resolve?: ((value: Result) => A | PromiseLike<A>) | null, reject?: ((reason: unknown) => B | PromiseLike<B>) | null) {
    return Promise.resolve(this.run()).then(resolve, reject);
  }
}

export function fakePostgrest(tables: Record<string, Row[]>, unique: Record<string, Unique> = {}) {
  return { from: (table: string) => new Query((tables[table] ??= []), unique[table]) };
}
