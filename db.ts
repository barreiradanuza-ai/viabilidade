import { Pool, type PoolClient } from 'pg';
import { env } from './env';

declare global {
  // eslint-disable-next-line no-var
  var __viabilidadePool: Pool | undefined;
}

/**
 * Um único pool por processo. O banco nunca é exposto ao frontend:
 * todo acesso passa por rotas de API no servidor.
 */
export function pool(): Pool {
  if (!global.__viabilidadePool) {
    global.__viabilidadePool = new Pool({
      connectionString: env.databaseUrl,
      max: Number(process.env.PGPOOL_MAX ?? 10),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      statement_timeout: Number(process.env.PG_STATEMENT_TIMEOUT_MS ?? 15_000),
    });
  }
  return global.__viabilidadePool;
}

/** Sempre com parâmetros ($1, $2...). Nunca concatene valores em SQL. */
export async function query<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const r = await pool().query(sql, params);
  return r.rows as T[];
}

export async function withClient<T>(
  fn: (c: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool().connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}
