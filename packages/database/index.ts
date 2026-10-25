import pg from "pg";
export interface DB {
  query<T = Record<string, any>>(
    sql: string,
    params?: any[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
}
export function pool(url: string) {
  return new pg.Pool({ connectionString: url, max: 10 });
}
export async function tenant<T>(
  db: pg.Pool,
  org: string,
  fn: (client: DB) => Promise<T>,
): Promise<T> {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT set_config('app.org_id',$1,true)", [org]);
    const value = await fn(c);
    await c.query("COMMIT");
    return value;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
