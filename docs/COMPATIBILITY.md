# Sepolia compatibility report

Checked on 2026-09-28 from a machine with no project secrets. Every result below is reproducible with `npm run check:sepolia` or the curl commands shown. Nothing here was taken from a devnet.

## Toolchain pins

| Component | Version | Source |
| --- | --- | --- |
| Node.js | 22.14.0 | local, scripts use `--experimental-strip-types` (Node 22.6+) |
| Next.js | 14.2.35 | package.json |
| starknet.js | 10.4.0 (exact) | https://github.com/starknet-io/starknet.js, first release with `WalletAccountV6`, `strk20InvokeTransaction`, `STRK20_ACTION` |
| @starknet-io/types-js | 0.10.3 | Wallet API 0.10.3 types |
| @starknet-io/get-starknet-discovery, -wallet-standard | 6.0.3 | tested pair for starknet.js 10.4.0 |
| @reclaimprotocol/js-sdk | 5.8.2 (exact, released 2026-07-13) | https://docs.reclaimprotocol.org/manual/js-sdk/usage |
| Scarb | 2.14.0 | required by Starknet Foundry 0.57.0 (2.10.1 was rejected) |
| Starknet Foundry (snforge) | 0.57.0 | |
| Cairo edition | 2024_07 | contracts/Scarb.toml |
| Starknet RPC spec | 0.10.3 | reported by `starknet_specVersion` on Sepolia |

## Sepolia RPC endpoints

| Endpoint | `starknet_chainId` | `starknet_getClassHashAt` via curl | via starknet.js 10.4 |
| --- | --- | --- | --- |
| https://api.zan.top/public/starknet-sepolia | `0x534e5f5345504f4c4941` (SN_SEPOLIA) | works | works |
| https://starknet-sepolia.drpc.org | SN_SEPOLIA | works | returns `-32601 method does not exist` |
| https://starknet-sepolia.public.blastapi.io/rpc/v0_8 | error | "Blast API is no longer available" | unusable |
| https://free-rpc.nethermind.io/sepolia-juno/v0_8 | empty response | empty | unusable |
| https://rpc.starknet-testnet.lava.build | "endpoint has been discontinued" | unusable | unusable |

Default for scripts and the snforge fork profile is zan.top. Production should use a keyed provider such as Alchemy or Infura set in `STARKNET_SEPOLIA_RPC_URL`.

`https://sdk.starknet.io/` did not serve usable official documentation when the previous agent fetched it. All Starknet facts come from https://docs.starknet.io/ and the starknet.js type definitions installed in `node_modules`.

## STRK20 privacy pool on Sepolia

| Check | Result |
| --- | --- |
| Pool address (from the local strk20-privacy-sdk skill, v2.0) | `0x0254a6b2997ef52e9f830ce1f543f6b29768295e8d17e2267d672c552cfe0d91` |
| `starknet_getClassHashAt` (latest) | `0x6d163f2b27df0f53c5b0d019366261ba8034af1bef949dee920a60fe58bcf83` |
| `get_fee_amount()` | `0x1bc16d674ec80000` = 2,000,000,000,000,000,000 fri = **2 STRK per private operation** |
| Published in the official starknet-privacy repository files inspected on 2026-09-28 | No. The previous agent cloned https://github.com/starkware-libs/starknet-privacy and found no maintained public Sepolia pool address in the inspected files. The address above comes from a StarkWare-authored skill and was confirmed live by class-hash lookup, but its version and audit status must be confirmed with StarkWare before any user funds touch it. |

```bash
curl -s -X POST https://api.zan.top/public/starknet-sepolia -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"starknet_getClassHashAt","params":{"block_id":"latest","contract_address":"0x0254a6b2997ef52e9f830ce1f543f6b29768295e8d17e2267d672c552cfe0d91"}}'
```

### Live pool ABI inspection (class `0x6d163f...bcf83`, `starknet_getClass`, 2026-09-28)

| Fact | Value |
| --- | --- |
| `get_version()` | `0x322e31` = "2.1" |
| `is_paused()` | false |
| `get_proof_validity_blocks()` | 450 |
| Auditor public key set | yes (`get_auditor_public_key` non-zero), so viewing keys are escrowed to an auditor key per the pool design |
| Screener public key set | yes; `apply_actions(actions, screening: Option<ScreeningAttestation>)` takes a deposit screening attestation |
| Client actions (enum `privacy::actions::ClientAction`) | SetViewingKey, OpenChannel, OpenSubchannel, CreateEncNote, CreateOpenNote, Deposit, UseNote, Withdraw, **InvokeExternal { contract_address, calldata: Span<felt252> }**, ComputeAndInvoke |
| Server actions | WriteOnce, Append, TransferFrom, TransferTo, Emit*, **Invoke { contract_address, calldata }**, InvokeWithComputation |
| Public event on an external invoke | `ExternalContractInvoked(contract_address: key, selector: key)`. The helper address and selector are public; the caller is the pool. |
| `compile_actions(user, key, [InvokeExternal])` (view, dummy user) | reverts `NO_REPLAY_PROTECTION` |
| `compile_actions(user, key, [Deposit])` | reverts `NO_REPLAY_PROTECTION` |
| `compile_actions(user, key, [UseNote(dummy), InvokeExternal])` | reverts `SUBCHANNEL_NOT_FOUND` (passes the replay check, fails on the fake note as expected) |

What this establishes:

- Arbitrary calldata to an external contract is a first-class pool action, and the ABI does not force a token or open-note leg inside `InvokeExternal`. The target selector is fixed by the pool (the `Invoke` server action carries no selector), consistent with the `privacy_invoke` convention the helper implements.
- Every action batch must include a `UseNote` (nullifier) for replay protection. So a tip is only possible for a source that already holds a shielded note, and each tip spends a note and pays the 2 STRK pool fee. A source with no shielded balance cannot send an encrypted tip through the pool at all.
- Deposits into the pool are subject to a screening attestation, which adds an off-chain party to the tip and bond threat model.
- Not established: that the fixed selector is `privacy_invoke` with the exact `(…) -> Span<OpenNoteDeposit>` return shape on Sepolia v2.1, and that the pool accepts an empty deposit span. That needs one live transaction from a registered test user with a shielded note.

### Consequence for the 1 STRK bond

The pool charges 2 STRK per private operation on Sepolia. A private 1 STRK bond would cost the source at least 2 STRK in pool fees to place and the operator at least 2 STRK to refund, so the source would pay more in unavoidable fees than the bond itself. This contradicts the product rule that the source pays only unavoidable network transaction fees, and the fee must be reconsidered before the private bond is designed.

## Anonymous bonded interview: BUILT, live proof pending

Design (2026-09-29, `src/lib/bond.ts`, `src/lib/privacy-sdk.ts`, `src/components/BondGate.tsx`):

- The source pays the bond as a STRK20 **private transfer** from their own privacy-enabled wallet (Wallet API `strk20InvokeTransaction`, transfer action) to the treasury `0x05f34969286cdc0bca4b2d0589418ad825faebea8c02497f89fd8599b5690bb7`. The amount is 1 STRK plus a per-session dust value (1 to 10^9 fri) that is unique among live sessions. Amounts inside the pool are encrypted, so the dust is the session binding and never appears in a public event.
- The server holds the treasury's keys and the privacy SDK (`@starkware-libs/starknet-privacy-sdk` 0.14.3-rc.8, built from the `starkware-libs/starknet-privacy` source at commit b40bf10 because the GitHub Packages registry needs a `read:packages` token). It confirms a bond by `discoverNotes` for the treasury at `head - 10` and matching a note with the session's exact amount (`POST /api/bond/status`, polled by the bond page). No chain data about the source is read.
- Refund is a private transfer of the same amount from the treasury to the recipient the source typed on the bond page (defaults to the connected account; must be a registered pool user, checked with `discoverRequirement`). Triggered by `POST /api/bond/refund`, and by a sweeper for confirmed sessions within 15 minutes of expiry. The refund transaction is submitted by the pool's relayer, so no public leg names either party.
- Fee floor (PATRON convention): quotes are refused when the live `get_fee_amount` reaches `BOND_POOL_FEE_CAP_FRI` (default 2.5 STRK). The bond page shows bond, pool fee, total, and refund before the wallet prompt.
- Services: `PROVING_SERVICE_URL=https://transaction-prover.alpha-sepolia.sw-dev.io`, `INDEXER_URL=https://discovery-service.alpha-sepolia.sw-dev.io` (the official Sepolia services used by hackathon projects such as XENIA).

Cost on Sepolia today: the source spends 1 STRK + 2 STRK pool fee; the treasury spends 2 STRK on the refund and returns 1 STRK. The spec's "source pays only network fees" is not met because of the pool fee; the page says so.

| Requirement | Status | Evidence or missing dependency |
| --- | --- | --- |
| A live Sepolia pool | Verified | class hash above |
| Session-bound admission without a payer address | Built, unit tested | 13 tests in `tests/bond.test.ts` with the SDK mocked: unique amounts, exact-amount note matching, no confirmation from a wrong amount, refund once, unregistered recipient refused, sweeper |
| Treasury registered and funded | Not yet | `0x05f349...0bb7` is not deployed, holds 0 STRK, has no pool viewing key. Run `scripts/bond-setup.mts` with `BOND_TREASURY_PRIVATE_KEY` and `BOND_VIEWING_KEY` after funding it from the faucet; it registers and can shield refund liquidity (`--shield 5`) |
| Wallet API 0.10.3 on Sepolia in a browser wallet | Not verified | The bond page has a "Check wallet" probe that prints the Wallet API versions and STRK20 support; run it with Ready on Sepolia |
| Live bond and refund | Not run | Needs the treasury setup above plus a wallet with shielded STRK |
| Two-wallet linkage test | Script ready, not run | `scripts/bond-linkage-check.mts --from <block> --to <block> --wallets 0xA,0xB` pulls every pool event in the window and reports any event or sender naming either wallet; paste the JSON into docs/TEST_REPORT.md |
| IP address and timing analysis | Not run | The server still sees the source's IP at verification, bond confirmation and interview time. Not mitigated in this build. |

What the operator learns: the refund recipient address (a pool identity the source chose) and the timing of the note. What the chain shows: pool-internal events only. Until the live rows above are filled in, `/api/capabilities` reports the bond as configured but keeps the remaining proofs in `missing`.

Without the `BOND_*` environment the server behaves as before: `POST /api/bond` returns 503 with the missing list, and a public ERC-20 transfer is never accepted as a substitute. `ALLOW_DEV_WITHOUT_PRIVATE_BOND=true` remains a development-only bypass refused in production.

## Encrypted tips through the pool: BLOCKED

| Requirement | Status |
| --- | --- |
| `sendMessage` API in the STRK20 SDK or Wallet API | Does not exist. https://strk20.starknet.io/rfp/private-messaging is a request for proposals. |
| Helper contract that accepts ciphertext through `privacy_invoke` | Drafted at `contracts/tip_inbox`, 5 unit tests pass, not deployed. It pins the pool address and rejects direct calls. |
| Confirmation that the live pool forwards an `invoke` action with zero token movement and an empty `OpenNoteDeposit` span | Not verified against the live pool. The skill documents the pattern for DeFi helpers with an open note; a pure-message invoke with no open note has not been exercised on Sepolia. |
| Client-side encryption to an editorial key | Not implemented. Design: X25519 or Starknet-curve ECDH ephemeral key, XChaCha20-Poly1305, recipient tag derived from the editorial public key. `NEXT_PUBLIC_EDITORIAL_ENCRYPTION_PUBLIC_JWK` is reserved for it. |
| Recipient discovery and decryption client | Not implemented. Would read `EncryptedTipReceived` events by `recipient_tag` and decrypt with the editorial private key held offline. |
| Cost | Each tip is a private operation: 2 STRK pool fee plus calldata cost for up to 8192 ciphertext bytes. Not measured. |

Decision: `POST /api/tips` always returns 503 and stores nothing. The tip page has no form.

## AI backend

| Backend | Selection | Where the text goes | Status |
| --- | --- | --- | --- |
| Phala confidential inference, model `deepseek/deepseek-v3.2` (attested GPU TEE) | preferred whenever `PHALA_API_KEY` is set, or `AI_PROVIDER=phala` | Phala's gateway inside an Intel TDX VM with NVIDIA GPU enclaves; this server verifies the attestation before sending anything | verifier and receipts implemented 2026-09-29; attestation verified live without a key; inference needs a Phala Cloud key |
| OpenRouter pinned to provider `phala`, model `deepseek/deepseek-v3.2` | `AI_PROVIDER=openrouter` plus `OPENROUTER_API_KEY` | OpenRouter (in transit) and Phala's TEE | works live; no attestation or receipts pass through OpenRouter, so the UI says "per routing, not independently verified" |
| Ollama, model `qwen2.5:7b` (Apache-2.0 weights, 4.7 GB q4) | `OLLAMA_BASE_URL` set, or `AI_PROVIDER=ollama` | stays on the server that runs Ollama | installed on the dev machine on 2026-09-28 (`brew install ollama`, Apple M-series, 24 GB RAM) |
| Google Gemini `gemini-2.5-flash` | `AI_PROVIDER=gemini` plus `GEMINI_API_KEY` | Google | kept as an optional backend; no key available here |

### Attested confidential inference (Phala ACI), verified 2026-09-29

Verifier: `@phala/aci-verifier` 0.7.2 (`connectAci` from `/runtime`), which verifies the Intel TDX quote locally with `@phala/dcap-qvl` 0.6.x using collateral from the Phala PCCS. Live result against `https://inference.phala.com` with no API key, pinned Node transport:

```
VERIFIED (6 pass, 1 skipped: custody policy not implemented)
pass id-1 hardware quote verifies to the TEE vendor root and binds report_data (TCB UpToDate)
pass id-2 keyset JCS -> digest -> statement -> report_data recomputed for our nonce
pass id-3 keyset not expired (valid until 2026-10-17T15:25:55Z)
pass id-4 the running compose is measured into the quote, compose-hash 0637b3d506c80c0328c84697c290f5fb7eef811c8d022124e04ee9b0f5f99567
pass policy-os RTMR3 os-image-hash satisfies the production allowlist
skip id-5 private-key custody appraisal (not implemented in the library)
pass id-6 the TLS channel actually used is bound to the attested keyset (SPKI pinned)
source provenance: https://github.com/Dstack-TEE/private-ai-gateway.git @ 8d0a666a2418898a8c823a9af49a634edd122a64
receipt signing key: dstack-kms-receipt-ed25519-v1 (ed25519)
```

How the app uses it (`src/lib/attestation.ts`, `src/lib/phala.ts`):

- The server opens one SPKI-pinned connection per process, re-verifies every 10 minutes, and refuses to send any text when any check fails (`tee: false`, provider disabled, UI says so).
- Every chat call goes through the pinned `fetch`; the gateway returns an `x-receipt-id`. Receipt ids (never text) are kept in memory per session. `POST /api/attestation { token }` audits them: Ed25519 signature under the attested keyset, request and response body hashes, model, served time. `GET /api/attestation` returns the transcript, compose hash, provenance, and keys.
- `PHALA_ACCEPTED_COMPOSE_HASHES` pins reviewed release hashes; empty means measured and reported, not release-pinned. The library does not reconstruct MRTD/RTMR0-2 from the dstack image and does not implement the KMS custody check; both are stated in the transcript and in the UI copy as limits.
- Models on the gateway (`GET /v1/models`, public): `deepseek/deepseek-v3.2` (default), `qwen/qwen3.8-27b`, `openai/gpt-oss-120b`, `moonshotai/kimi-k2.6`, `z-ai/glm-5.3` (mandatory reasoning, exhausts the token budget before content, so not used).
- Still needed to run inference: a Phala Cloud API key (`PHALA_API_KEY`). No free tier is documented; DeepSeek V3.2 is $1.00 per million tokens in and out.

What this proves and does not prove: the gateway software measured into the quote is the open-source private-ai-gateway at the commit above, running on genuine TDX hardware, and each reply is signed by a key that only that measured workload holds. It does not prove that this server's operator cannot read the text, because the request is built here and the reply is streamed through here in the clear.

Wire format used for Ollama: `POST /api/chat` with `stream: true` returns NDJSON lines `{ message: { role, content }, done }`; article drafting uses `stream: false, format: "json"`. Context window is set to 16384 tokens and replies are capped (700 tokens interview, 4096 article) so a 60-message transcript still fits. Docker deployments reach a host Ollama at `http://host.docker.internal:11434`.

## Confidential compute: not available

No hardware attestation is verified. `/api/attestation` returns `tee: false` and describes the real data flow. EigenCompute was removed. dstack (https://github.com/Dstack-TEE/dstack) is an open source framework but still requires TDX hardware hosting, which is not free; Intel Trust Authority is an attestation verifier, not compute. No zero-cost hardware TEE was identified, so the Sepolia milestone ships with disclosure instead.

## Reclaim (SDK 5.8.2, current docs)

The first pass used js-sdk 4.12.0 with a custom iframe around the share page URL, which the user flagged as the discontinued app-clip era flow. Rewritten on 2026-09-28 against the current docs (https://docs.reclaimprotocol.org/manual/js-sdk/usage) and the 5.8.2 type definitions:

- Server: `ReclaimProofRequest.init(appId, secret, providerId, { acceptAiProviders: false })`, `setContext(verificationId, challenge)`, `getProviderVersion()` (stored with the verification record, resolved to `4.0.0` for the configured LinkedIn template), `toJsonString()` (carries the signature and context, never the secret; checked in `dist/index.js`).
- Browser: `fromJsonString`, then `triggerReclaimFlow({ target })`, which embeds Reclaim's portal (remote browser verification) in a near full-screen overlay, or uses the Reclaim browser extension on desktop when present. No app clip, QR code, or Reclaim mobile app is involved unless `verificationMode: "app"` is requested, which this app does not do. The browser never receives the proof: in the live test on 2026-09-28 the SDK's `startSession` `onSuccess` never fired even though Reclaim showed "Verification Completed" and its session endpoint held the proof, so completion is server-driven instead. The page polls `POST /api/verify/status` every 3 s; the server reads Reclaim's session endpoint, verifies the proof, and issues the capability.
- Server verification: `verifyProof(proof, { providerId, providerVersion, allowedTags })` returns `{ isVerified, data }`. It checks attestor signatures and that the proof's request hashes match the exact provider template version used in the session, so a proof from a different or edited template is rejected. Trusted `data[0].context` (`contextAddress`, `contextMessage`, `reclaimSessionId`, `providerHash`) is compared to the stored request, and `data[0].extractedParameters` becomes the credential. Raw `claimData.context` is not parsed by this app.
- Session binding: `GET https://api.reclaimprotocol.org/api/sdk/session/<id>` must show our `appId`, our `providerId`, and the proof identifier. Live dependency; fails closed.
- Optional: `RECLAIM_PROVIDER_HASH` pins the template hash; `setAppCallbackUrl` (proofs posted straight to the backend) is documented as the production option but needs a public URL, so the local build keeps client delivery through `startSession`.
- Verified live with the user's own Reclaim app (provider `f9f383fd-32d9-4c54-942f-5e9fda349762`, template version 2.0.1): a proof generated in the embedded portal was fetched from Reclaim's session endpoint and passed `verifyReclaimProofs` (signatures, template hashes, context binding, session binding). The template discloses one field, `email`. That value stays in the session record only and is never written onchain or given to the model.

## What can be run today without secrets

```bash
npm ci && npm run typecheck && npm run lint && npm test && npm run build
cd contracts && scarb build && snforge test
npm run check:sepolia
NEXT_PUBLIC_STRK20_POOL_ADDRESS=0x0254a6b2997ef52e9f830ce1f543f6b29768295e8d17e2267d672c552cfe0d91 npm run check:sepolia
```

## Deployed registry

`ArticleRegistry` is live on Sepolia at `0x2be142c378dbf4f9480196d484b9e22363887ef523ee3cde332a4fa2fe4f6f0` (class `0xb78be67c801a4735dd175bf55c7cc9c64cc620f6e37f3d921bad124c1dfd44`), owned and published by `0x070b9ebcc53df4db3b157a1b346c636f3547ed41553dcc58026126beb73d2764`. Measured fees and latency are in docs/TEST_REPORT.md; the body limit was set to 16384 bytes from them.

## What needs secrets

| Step | Needs | Script |
| --- | --- | --- |
| Deploy registry (done 2026-09-28) | `STARKNET_SEPOLIA_RPC_URL`, funded `STARKNET_PUBLISHER_ADDRESS` and `STARKNET_PUBLISHER_PRIVATE_KEY` | `npm run deploy:sepolia` |
| Fee and latency benchmark (done 2026-09-28) | same, plus `NEXT_PUBLIC_ARTICLE_REGISTRY_ADDRESS` | `npm run benchmark:sepolia` |
| Independent read-back proof | RPC and registry address only | `npm run readback:sepolia -- <articleId> [expected.json]` |
| Live Reclaim proof | `RECLAIM_APP_ID`, `RECLAIM_APP_SECRET`, `RECLAIM_PROVIDER_ID` | `npm run dev`, open /submit/verify |
| Interview | `GEMINI_API_KEY` | `npm run dev` |
