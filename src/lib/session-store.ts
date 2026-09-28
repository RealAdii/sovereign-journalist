// Storage layer behind src/lib/session.ts. Keys are HMAC hashes computed by
// session.ts, so no plaintext token, recovery code or IP ever reaches a store.
// Two implementations: a JSON file for single-instance development, and Neon
// Postgres for hosted deployments where every serverless instance must see the
// same one-use records.

import { FileSessionStore } from "./session-store-file";
import { PostgresSessionStore } from "./session-store-postgres";

export interface StoredBase {
  type: string;
  expiresAt: number;
}

export interface SessionStore<T extends StoredBase = StoredBase> {
  /** Returns the live record or null when missing or expired. */
  get(key: string): Promise<T | null>;
  put(key: string, record: T): Promise<void>;
  remove(key: string): Promise<void>;
  /** Atomically removes and returns the live record, or null. Used for one-use records. */
  take(key: string): Promise<T | null>;
  /** Live records whose key starts with the prefix. */
  entries(prefix: string): Promise<Array<[string, T]>>;
  /** Drops every record. Tests only. */
  clear(): Promise<void>;
}

let active: SessionStore | null = null;

export function sessionStoreKind(): "postgres" | "file" {
  return process.env.SESSION_STORE_URL?.startsWith("postgres") ? "postgres" : "file";
}

export function getSessionStore(): SessionStore {
  if (active) return active;
  active =
    sessionStoreKind() === "postgres"
      ? new PostgresSessionStore(process.env.SESSION_STORE_URL!)
      : new FileSessionStore(process.env.SESSION_STORE_PATH);
  return active;
}

export function resetSessionStoreForTests() {
  active = null;
}
