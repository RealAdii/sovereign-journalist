import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { FileSessionStore } from "@/lib/session-store-file";
import { PostgresSessionStore } from "@/lib/session-store-postgres";
import type { SessionStore, StoredBase } from "@/lib/session-store";

// The same contract runs against the file store always, and against Postgres
// when SESSION_STORE_TEST_URL is set. Local Postgres behind Neon's wsproxy:
//   docker run -d --name sj-pg -e POSTGRES_PASSWORD=test -e POSTGRES_USER=test -e POSTGRES_DB=sessions -p 5439:5432 postgres:16-alpine
//   docker run -d --name sj-wsproxy --link sj-pg -p 5488:80 -e APPEND_PORT=sj-pg:5432 -e ALLOW_ADDR_REGEX='.*' ghcr.io/neondatabase/wsproxy
//   SESSION_STORE_TEST_URL=postgres://test:test@sj-pg/sessions SESSION_STORE_WS_PROXY=localhost:5488 npm test

type Rec = StoredBase & { n?: number };

const stores: Array<[string, () => SessionStore<Rec>]> = [["file", () => new FileSessionStore<Rec>()]];
if (process.env.SESSION_STORE_TEST_URL) {
  stores.push(["postgres", () => new PostgresSessionStore<Rec>(process.env.SESSION_STORE_TEST_URL!)]);
}

describe.each(stores)("session store contract: %s", (_name, make) => {
  const store = make();
  beforeEach(() => store.clear());
  afterAll(() => store.clear());

  const live = (n = 1): Rec => ({ type: "t", expiresAt: Date.now() + 60_000, n });
  const dead = (): Rec => ({ type: "t", expiresAt: Date.now() - 1 });

  it("puts, gets, overwrites and removes", async () => {
    await store.put("a", live(1));
    expect(await store.get("a")).toMatchObject({ n: 1 });
    await store.put("a", live(2));
    expect(await store.get("a")).toMatchObject({ n: 2 });
    await store.remove("a");
    expect(await store.get("a")).toBeNull();
  });

  it("treats expired records as missing", async () => {
    await store.put("x", dead());
    expect(await store.get("x")).toBeNull();
    expect(await store.take("x")).toBeNull();
    expect(await store.entries("x")).toEqual([]);
  });

  it("take is one-use", async () => {
    await store.put("v", live(7));
    expect(await store.take("v")).toMatchObject({ n: 7 });
    expect(await store.take("v")).toBeNull();
    expect(await store.get("v")).toBeNull();
  });

  it("take resolves a race to exactly one winner", async () => {
    await store.put("race", live(1));
    const results = await Promise.all(Array.from({ length: 8 }, () => store.take("race")));
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("entries filters by prefix and liveness", async () => {
    await store.put("cap:1", live(1));
    await store.put("cap:2", live(2));
    await store.put("cap:3", dead());
    await store.put("verify:1", live(9));
    const keys = (await store.entries("cap:")).map(([k]) => k).sort();
    expect(keys).toEqual(["cap:1", "cap:2"]);
  });

  it("stores JSON values round trip including nested objects", async () => {
    const value: Rec & { nested: { a: string[]; b: number } } = { ...live(3), nested: { a: ["x", "y"], b: 2 } };
    await store.put("j", value);
    expect(await store.get("j")).toEqual(value);
  });
});
