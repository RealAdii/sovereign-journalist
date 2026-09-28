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
| @reclaimprotocol/js-sdk | 4.12.0 | https://docs.reclaimprotocol.org/manual/js-sdk/usage |
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

## Anonymous bonded interview: BLOCKED

The requirement is a 1 STRK Sepolia bond whose payment and refund cannot be linked to the source. What was verified and what was not:

| Requirement | Status | Evidence or missing dependency |
| --- | --- | --- |
| A live Sepolia pool | Verified | class hash above |
| Wallet API 0.10.3 on Sepolia in a browser wallet | Not verified | No wallet was installed or tested here. The strk20-wallet-api skill says to test with the Ready extension on a public network and that Xverse support was in progress as of 2026-08-16. Must be re-verified on the day of testing. |
| An admission receipt the server can verify without learning the payer | Not designed or verified | The pool's private transfer produces no public event naming the sender, but it also produces nothing the server can verify as "paid for session X" without either the recipient viewing key (which the operator would hold, linking nothing, but proving nothing session-specific) or an escrow helper contract called through `privacy_invoke` with a session commitment. The escrow helper pattern exists in the strk20-anonymizer-contracts skill as an unofficial, unaudited example. |
| Unlinkable refund | Not verified | A private transfer back requires the source to be a registered pool user and to supply a recipient that is not linkable to the deposit that funded the bond. The skill's privacy doctrine states that shielding must happen in a separate, earlier transaction. Whether Sepolia testers will have pre-shielded balances is a UX assumption, not a fact. |
| Two-wallet linkage test with RPC and explorer inspection | Not run | Needs two funded Sepolia wallets and a privacy-enabled wallet extension. |
| IP address and timing analysis | Not run | Even with perfect onchain unlinkability, the server sees the source's IP at verification, interview, and bond-confirmation time. Mitigations (Tor onion service, a separate bond-confirmation origin, delayed confirmation windows) are not implemented. |

Decision: the server refuses every bond receipt (`POST /api/bond` returns 503) and the UI shows the blocked state with this list. A public ERC-20 transfer is never accepted as a substitute. The only way to run the interview locally is `ALLOW_DEV_WITHOUT_PRIVATE_BOND=true`, which is refused when `NODE_ENV=production` and which the UI labels as making no anonymity claim.

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
| Ollama, model `qwen2.5:7b` (Apache-2.0 weights, 4.7 GB q4) | default when `OLLAMA_BASE_URL` is set, or `AI_PROVIDER=ollama` | stays on the server that runs Ollama | installed on the dev machine on 2026-09-28 (`brew install ollama`, Ollama from Homebrew, Apple M-series, 24 GB RAM) |
| Google Gemini `gemini-2.5-flash` | `AI_PROVIDER=gemini` plus `GEMINI_API_KEY` | Google | kept as an optional backend; no key available here |

Wire format used for Ollama: `POST /api/chat` with `stream: true` returns NDJSON lines `{ message: { role, content }, done }`; article drafting uses `stream: false, format: "json"`. Context window is set to 16384 tokens and replies are capped (700 tokens interview, 4096 article) so a 60-message transcript still fits. Docker deployments reach a host Ollama at `http://host.docker.internal:11434`.

## Confidential compute: not available

No hardware attestation is verified. `/api/attestation` returns `tee: false` and describes the real data flow. EigenCompute was removed. dstack (https://github.com/Dstack-TEE/dstack) is an open source framework but still requires TDX hardware hosting, which is not free; Intel Trust Authority is an attestation verifier, not compute. No zero-cost hardware TEE was identified, so the Sepolia milestone ships with disclosure instead.

## Reclaim

Field names were checked against the installed SDK source (`node_modules/@reclaimprotocol/js-sdk/dist/index.js`, 4.12.0), not against documentation from memory:

- `setContext(address, message)` stores `{ contextAddress, contextMessage }`; the attestor copies that into `proof.claimData.context` as a JSON string together with `extractedParameters` and `providerHash`. The server compares `contextAddress` to the `verificationId` and `contextMessage` to the challenge it generated.
- `proof.claimData.provider` is the provider type (for example `"http"`), not the dashboard provider id. It is therefore not used for binding. Instead the server fetches `https://api.reclaimprotocol.org/api/sdk/session/<sessionId>` for the session it created and requires `session.appId == RECLAIM_APP_ID`, `RECLAIM_PROVIDER_ID` in `session.httpProviderId`, and the submitted proof's `identifier` in `session.proofs`. This is a live dependency on Reclaim's backend; if it is unreachable the verification fails closed.
- Optional `RECLAIM_PROVIDER_HASH` pins the template hash found in the proof context.
- `verifyProof(proof, false)` checks attestor signatures over the claim. AI witnesses are rejected. The installed SDK does not expose the newer docs' provider-version overload.
- Live proof generation was not exercised: no Reclaim app credentials were available. The flow is unit tested with a mocked signature check and a stubbed session lookup, using fixtures in the SDK's field shapes.

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
