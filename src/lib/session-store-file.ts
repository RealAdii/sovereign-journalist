import fs from "fs";
import path from "path";
import type { SessionStore, StoredBase } from "./session-store";

// Single-instance store: an in-memory map mirrored to one JSON file with
// atomic rename writes. Production requires SESSION_STORE_PATH or the
// Postgres store; without either, records live only in process memory.
export class FileSessionStore<T extends StoredBase = StoredBase> implements SessionStore<T> {
  private memory = new Map<string, T>();
  private loaded = false;
  private readonly file: string | null;

  constructor(configuredPath?: string) {
    this.file = configuredPath ? path.resolve(process.cwd(), configuredPath) : null;
  }

  private load() {
    if (this.loaded) return;
    this.loaded = true;
    if (!this.file || !fs.existsSync(this.file)) return;
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, "utf8")) as Record<string, T>;
      for (const [key, value] of Object.entries(parsed)) {
        if (value.expiresAt > Date.now()) this.memory.set(key, value);
      }
    } catch {
      throw new Error("Unable to read the configured session store");
    }
  }

  private persist() {
    if (!this.file) {
      if (process.env.NODE_ENV === "production") {
        throw new Error("SESSION_STORE_PATH or SESSION_STORE_URL is required in production");
      }
      return;
    }
    fs.mkdirSync(path.dirname(this.file), { recursive: true, mode: 0o700 });
    const live: Record<string, T> = {};
    for (const [key, value] of this.memory) {
      if (value.expiresAt > Date.now()) live[key] = value;
    }
    const temporary = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(live), { mode: 0o600 });
    fs.renameSync(temporary, this.file);
  }

  async get(key: string) {
    this.load();
    const record = this.memory.get(key);
    if (!record) return null;
    if (record.expiresAt <= Date.now()) {
      this.memory.delete(key);
      this.persist();
      return null;
    }
    return record;
  }

  async put(key: string, record: T) {
    this.load();
    this.memory.set(key, record);
    this.persist();
  }

  async remove(key: string) {
    this.load();
    this.memory.delete(key);
    this.persist();
  }

  // No await between the read and the delete: within one process this is atomic.
  async take(key: string) {
    this.load();
    const record = this.memory.get(key);
    if (!record) return null;
    this.memory.delete(key);
    this.persist();
    return record.expiresAt > Date.now() ? record : null;
  }

  async entries(prefix: string) {
    this.load();
    const now = Date.now();
    return [...this.memory].filter(([key, value]) => key.startsWith(prefix) && value.expiresAt > now);
  }

  async clear() {
    this.memory.clear();
    this.loaded = false;
  }
}
