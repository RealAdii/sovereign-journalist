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

## Confidential compute: not available

No hardware attestation is verified. `/api/attestation` returns `tee: false` and describes the real data flow. EigenCompute was removed. dstack (https://github.com/Dstack-TEE/dstack) is an open source framework but still requires TDX hardware hosting, which is not free; Intel Trust Authority is an attestation verifier, not compute. No zero-cost hardware TEE was identified, so the Sepolia milestone ships with disclosure instead.

## Reclaim

- `verifyProof(proof, false)` from js-sdk 4.12.0 is used. AI witnesses are rejected.
- Provider id is compared to `RECLAIM_PROVIDER_ID`. The installed SDK does not expose the newer docs' provider-version overload, so the provider version is not checked. Pin the provider template version in the Reclaim dashboard.
- The proof context (`address`, `message`) is compared to the server-created `verificationId` and challenge, and `sessionId` when present.
- Live proof generation was not exercised: no Reclaim app credentials were available. The flow is unit tested with a mocked signature check.

## What can be run today without secrets

```bash
npm ci && npm run typecheck && npm run lint && npm test && npm run build
cd contracts && scarb build && snforge test
npm run check:sepolia
NEXT_PUBLIC_STRK20_POOL_ADDRESS=0x0254a6b2997ef52e9f830ce1f543f6b29768295e8d17e2267d672c552cfe0d91 npm run check:sepolia
```

## What needs secrets

| Step | Needs | Script |
| --- | --- | --- |
| Deploy registry | `STARKNET_SEPOLIA_RPC_URL`, funded `STARKNET_PUBLISHER_ADDRESS` and `STARKNET_PUBLISHER_PRIVATE_KEY` | `npm run deploy:sepolia` |
| Fee and latency benchmark for short, typical, long articles | same, plus `NEXT_PUBLIC_ARTICLE_REGISTRY_ADDRESS` | `npm run benchmark:sepolia` |
| Independent read-back proof | RPC and registry address only | `npm run readback:sepolia -- <articleId> [expected.json]` |
| Live Reclaim proof | `RECLAIM_APP_ID`, `RECLAIM_APP_SECRET`, `RECLAIM_PROVIDER_ID` | `npm run dev`, open /submit/verify |
| Interview | `GEMINI_API_KEY` | `npm run dev` |
