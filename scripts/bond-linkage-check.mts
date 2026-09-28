// Two-wallet linkage analysis for the private bond. Given wallet addresses and a
// block window, it pulls every pool event in the window and reports whether any
// wallet appears in an event key, in event data, or as the sender of the
// transaction that emitted it. Expected result for a bond and refund leg: the
// wallets appear only in their own earlier public Deposit (shielding) events.
//   node --experimental-strip-types --env-file-if-exists=.env.local scripts/bond-linkage-check.mts \
//     --from <block> --to <block> --wallets 0xA,0xB [--out docs/benchmarks/linkage.json]
import fs from "fs";
import { hash } from "starknet";
import { assertSepolia, rpc, rpcUrl } from "./env.mts";

function arg(name: string, fallback?: string) {
  const index = process.argv.indexOf(`--${name}`);
  return index > -1 ? process.argv[index + 1] : fallback;
}
const from = Number(arg("from"));
const to = Number(arg("to"));
const wallets = (arg("wallets") || "").split(",").map((w) => w.trim()).filter(Boolean);
const out = arg("out");
const pool = process.env.NEXT_PUBLIC_STRK20_POOL_ADDRESS || "0x0254a6b2997ef52e9f830ce1f543f6b29768295e8d17e2267d672c552cfe0d91";
if (!from || !to || wallets.length === 0) {
  console.error("Usage: --from <block> --to <block> --wallets 0xA,0xB [--out file]");
  process.exit(2);
}

const provider = rpc();
await assertSepolia(provider);
const norm = (v: string) => BigInt(v);
const targets = wallets.map(norm);
const eventNames = ["Deposit", "Withdrawal", "OpenNoteCreated", "EncNoteCreated", "NoteUsed", "ExternalContractInvoked", "OpenNoteDeposited", "ViewingKeySet"];
const selectorToName = new Map(eventNames.map((n) => [BigInt(hash.getSelectorFromName(n)), n]));

const events: { block: number; tx: string; name: string; keys: string[]; data: string[] }[] = [];
let continuation: string | undefined;
do {
  const page = await provider.getEvents({
    address: pool,
    from_block: { block_number: from },
    to_block: { block_number: to },
    chunk_size: 500,
    continuation_token: continuation,
  });
  for (const e of page.events) {
    const name = selectorToName.get(BigInt(e.keys[0])) || e.keys[0];
    events.push({ block: e.block_number ?? 0, tx: e.transaction_hash, name, keys: e.keys, data: e.data });
  }
  continuation = page.continuation_token;
} while (continuation);

const txSenders = new Map<string, string>();
for (const tx of new Set(events.map((e) => e.tx))) {
  const t = (await provider.getTransactionByHash(tx)) as unknown as { sender_address?: string };
  txSenders.set(tx, t.sender_address || "");
}

const findings = events.map((e) => {
  const hits: string[] = [];
  for (const [i, w] of targets.entries()) {
    const label = wallets[i];
    if (e.keys.slice(1).some((k) => norm(k) === w)) hits.push(`${label} in event keys`);
    if (e.data.some((d) => { try { return norm(d) === w; } catch { return false; } })) hits.push(`${label} in event data`);
    const sender = txSenders.get(e.tx);
    if (sender && norm(sender) === w) hits.push(`${label} is the transaction sender`);
  }
  return { ...e, sender: txSenders.get(e.tx), hits };
});

const summary = {
  rpc: rpcUrl(),
  pool,
  window: { from, to },
  wallets,
  events: findings.length,
  eventsByName: findings.reduce<Record<string, number>>((acc, e) => ((acc[e.name] = (acc[e.name] || 0) + 1), acc), {}),
  linked: findings.filter((e) => e.hits.length > 0).map((e) => ({ block: e.block, tx: e.tx, name: e.name, hits: e.hits })),
  verdict: "",
};
const nonDepositLinks = summary.linked.filter((l) => l.name !== "Deposit" && l.name !== "ViewingKeySet");
summary.verdict = nonDepositLinks.length === 0
  ? "No wallet appears in any bond or refund leg. Only shielding Deposits and registration name a wallet, as expected."
  : `${nonDepositLinks.length} event(s) name a wallet outside shielding or registration; the flow is linkable.`;
const text = JSON.stringify(summary, null, 2);
if (out) fs.writeFileSync(out, text);
console.log(text);
process.exit(nonDepositLinks.length === 0 ? 0 : 1);
