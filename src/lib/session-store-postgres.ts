import { Pool, neonConfig } from "@neondatabase/serverless";
import type { SessionStore, StoredBase } from "./session-store";

// Neon Postgres store for hosted deployments. One table, HMAC-hashed keys,
// JSON values, epoch-millisecond expiry. `take` is a single DELETE ... RETURNING
// so one-use records (verification requests) cannot be consumed twice across
// instances. Read-modify-write updates on capability records (AI counters,
// publish flag) are not transactional; a concurrent duplicate publish attempt
// is still caught by the contract's duplicate-article check.
//
// Local testing: point SESSION_STORE_URL at a plain Postgres behind Neon's
// wsproxy and set SESSION_STORE_WS_PROXY=host:port (see tests/session-store.test.ts).

const TABLE = "session_records";
const SWEEP_EVERY_MS = 60_000;

export class PostgresSessionStore<T extends StoredBase = StoredBase> implements SessionStore<T> {
  private readonly pool: Pool;
  private ready: Promise<void> | null = null;
  private lastSweep = 0;

  constructor(connectionString: string) {
    const proxy = process.env.SESSION_STORE_WS_PROXY;
    if (proxy) {
      neonConfig.wsProxy = () => `${proxy}/v1`;
      neonConfig.useSecureWebSocket = false;
      neonConfig.pipelineTLS = false;
      neonConfig.pipelineConnect = false;
    }
    this.pool = new Pool({ connectionString, max: 3 });
  }

  private ensure() {
    if (!this.ready) {
      this.ready = this.pool
        .query(
          `CREATE TABLE IF NOT EXISTS ${TABLE} (
             key text PRIMARY KEY,
             value jsonb NOT NULL,
             expires_at bigint NOT NULL
           )`,
        )
        .then(() => this.pool.query(`CREATE INDEX IF NOT EXISTS ${TABLE}_expires_idx ON ${TABLE} (expires_at)`))
        .then(() => undefined);
    }
    return this.ready;
  }

  private async sweep() {
    const now = Date.now();
    if (now - this.lastSweep < SWEEP_EVERY_MS) return;
    this.lastSweep = now;
    await this.pool.query(`DELETE FROM ${TABLE} WHERE expires_at <= $1`, [now]);
  }

  async get(key: string) {
    await this.ensure();
    await this.sweep();
    const { rows } = await this.pool.query(`SELECT value FROM ${TABLE} WHERE key = $1 AND expires_at > $2`, [
      key,
      Date.now(),
    ]);
    return rows.length ? (rows[0].value as T) : null;
  }

  async put(key: string, record: T) {
    await this.ensure();
    await this.pool.query(
      `INSERT INTO ${TABLE} (key, value, expires_at) VALUES ($1, $2::jsonb, $3)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, expires_at = EXCLUDED.expires_at`,
      [key, JSON.stringify(record), record.expiresAt],
    );
  }

  async remove(key: string) {
    await this.ensure();
    await this.pool.query(`DELETE FROM ${TABLE} WHERE key = $1`, [key]);
  }

  async take(key: string) {
    await this.ensure();
    const { rows } = await this.pool.query(`DELETE FROM ${TABLE} WHERE key = $1 AND expires_at > $2 RETURNING value`, [
      key,
      Date.now(),
    ]);
    return rows.length ? (rows[0].value as T) : null;
  }

  async entries(prefix: string) {
    await this.ensure();
    const { rows } = await this.pool.query(`SELECT key, value FROM ${TABLE} WHERE key LIKE $1 AND expires_at > $2`, [
      `${prefix.replace(/[%_\\]/g, "\\$&")}%`,
      Date.now(),
    ]);
    return rows.map((row) => [row.key as string, row.value as T] as [string, T]);
  }

  async clear() {
    await this.ensure();
    await this.pool.query(`DELETE FROM ${TABLE}`);
  }
}
