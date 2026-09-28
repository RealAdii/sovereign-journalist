# Test report

Generated 2026-09-28 on macOS (Darwin 25.3.0, aarch64), Node 22.14.0, Scarb 2.14.0, snforge 0.57.0. Updated the same day after the registry was deployed to Sepolia and benchmarked with a funded publisher. Still not run: live Reclaim proof end to end, Gemini interview, and the two-wallet bond linkage analysis (blocked by design).

## TypeScript unit and route tests (`npm test`)

```
> sovereign-journalist@0.1.0 test
> vitest run
 RUN  v3.2.7 /Users/adithya/sovereign-journalist-sepolia
 ✓ tests/gemini.test.ts (2 tests) 2ms
 ✓ tests/ollama.test.ts (7 tests) 6ms
 ✓ tests/reclaim.test.ts (9 tests) 5ms
 ✓ tests/session.test.ts (9 tests) 5ms
 ✓ tests/encoding.test.ts (9 tests) 4ms
 ✓ tests/render.test.tsx (1 test) 10ms
 ✓ tests/routes.test.ts (16 tests) 16ms
 Test Files  6 passed (6)
      Tests  53 passed (53)
```

What they cover:

- `encoding.test.ts`: 31-byte chunk round trip including leading NUL bytes, all-zero chunks, CJK and emoji across chunk boundaries; chunk-count formula equals the Cairo `(n + 30) / 31`; calldata argument order; digest determinism, width, NFC normalization; byte-limit errors with field, size, max.
- `session.test.ts`: verification record one-use and expiry; capability starts blocked; bond gate; publish single-use and release after a failed transaction; 30-call AI cap; recovery rotates the token; raw tokens never stored; rate-limit window.
- `reclaim.test.ts` (SDK 5.8.2): valid proof accepted with `verifyProof` called with the exact `{ providerId, providerVersion, allowedTags }`; signature or content-hash failure, request created for another provider, session for another provider or app, proof the session never produced, missing session, wrong verification id, wrong challenge, wrong session id, pinned provider hash mismatch, and wrong proof count all rejected. Fixtures use the SDK's trusted-data shape (`data[0].context` with `contextAddress`, `contextMessage`, `reclaimSessionId`, `providerHash`).
- `routes.test.ts`: `/api/verify/start` output carries no secret; unknown id 410; wrong challenge 401 then replay 410; forged proof 401 then replay 410; full happy path issues a capability with recovery code and disclosed field names only, and calls the Reclaim session endpoint; a valid proof that the session did not produce is rejected; per-IP rate limiting; `/api/bond` reports blocked with the dependency list and refuses receipts (401 without session, 503 with); interview, estimate, publish all 403 without a bond and 401 with a bad token; with the dev bypass, publish succeeds once, refuses a duplicate with 409, and a chain rejection releases the session; byte-limit error returns field-level 422; tips always 503 with nothing stored; recovery code validation; attestation never claims a TEE.
- `render.test.tsx`: `ArticleBody` renders a GFM table, inline code, bold, link, list, and heading as HTML with no leaked Markdown syntax.
- `gemini.test.ts`: draft parser strips fences, drops confidence scores and tags, rejects empty drafts.

## Cairo tests (`cd contracts && snforge test`)

```
[PASS] article_registry_integrationtest::test_article_registry::rejects_body_over_limit
[PASS] article_registry_integrationtest::test_article_registry::rejects_chunk_count_that_disagrees_with_byte_length
[PASS] article_registry_integrationtest::test_article_registry::only_owner_can_rotate_publisher
[PASS] article_registry_integrationtest::test_article_registry::rejects_unauthorized_publisher
[PASS] article_registry_integrationtest::test_article_registry::rejects_duplicate_article_id
[PASS] article_registry_integrationtest::test_article_registry::stores_and_reads_every_chunk
[PASS] article_registry_integrationtest::test_article_registry::paginates_body_chunks_and_rejects_out_of_range_index
Tests: 7 passed, 0 failed, 0 ignored, 0 filtered out
[PASS] tip_inbox_integrationtest::test_tip_inbox::rejects_oversized_ciphertext
[PASS] tip_inbox_integrationtest::test_tip_inbox::stores_ciphertext_only_when_called_by_the_pool
[PASS] tip_inbox_integrationtest::test_tip_inbox::read_of_missing_tip_fails
[PASS] tip_inbox_integrationtest::test_tip_inbox::rejects_direct_calls_from_a_wallet
[PASS] tip_inbox_integrationtest::test_tip_inbox::rejects_mismatched_chunk_count
Tests: 5 passed, 0 failed, 0 ignored, 0 filtered out
Tests summary: 12 passed, 0 failed, 0 ignored, 0 filtered out
```

Registry: storage and read-back of every chunk, unauthorized publisher, duplicate id, body over limit, chunk count mismatch, owner-only publisher rotation, pagination over 200 chunks (two pages, empty page past the end). Tip inbox: pool-only caller, ciphertext storage and read, oversized ciphertext, chunk mismatch, missing tip. Refund tests do not exist because no bond or refund contract exists; that path is blocked (docs/COMPATIBILITY.md).

## Static checks

```
npm run typecheck   -> no errors
npm run lint        -> No ESLint warnings or errors
npm run build       -> compiled, 14 API routes, 7 pages
npm run check:dashes -> No em or en dashes found
scarb build         -> ok
```

## Sepolia read-only check (`npm run check:sepolia` with the pool address set)

```
{
  "rpc": "https://api.zan.top/public/starknet-sepolia",
  "checkedAt": "2026-09-28T10:25:30.837Z",
  "chainId": "0x534e5f5345504f4c4941",
  "specVersion": "0.9.0",
  "blockNumber": 15763850,
  "strkToken": {
    "label": "STRK token",
    "address": "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d",
    "classHash": "0x2e77ee61d4df3d988ee1f42ea5442e913862cc82c2584d212ecda76666498fc",
    "status": "deployed"
  },
  "strk20Pool": {
    "label": "STRK20 privacy pool",
    "address": "0x0254a6b2997ef52e9f830ce1f543f6b29768295e8d17e2267d672c552cfe0d91",
    "classHash": "0x6d163f2b27df0f53c5b0d019366261ba8034af1bef949dee920a60fe58bcf83",
    "status": "deployed"
  },
  "articleRegistry": {
    "label": "Article registry",
    "status": "not configured"
  },
  "tipInbox": {
    "label": "Tip inbox helper",
    "status": "not configured"
  },
  "strk20PoolFee": [
    "0x1bc16d674ec80000"
  ],
  "publisher": {
    "status": "STARKNET_PUBLISHER_ADDRESS not set; deployment and publishing are blocked"
  },
  "blockers": [
    "STARKNET_SEPOLIA_RPC_URL unset (using a public RPC for this read-only check)",
    "Article registry not deployed: run scripts/deploy-sepolia.mts",
    "No publisher key: deployment, fee benchmark, and publishing cannot run",
    "Reclaim app credentials unset: live proof verification cannot run",
    "GEMINI_API_KEY unset: interview cannot run",
    "Anonymous bond: no verified private receipt path (see docs/COMPATIBILITY.md)",
    "Encrypted tips: pool invoke path not proven end to end (see docs/COMPATIBILITY.md)"
  ]
}
```

## Live Sepolia deployment (2026-09-28, 13:26 UTC)

| Item | Value |
| --- | --- |
| Network | SN_SEPOLIA via Alchemy (`starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_10/...`), spec 0.10.3-rc.0 |
| ArticleRegistry address | `0x2be142c378dbf4f9480196d484b9e22363887ef523ee3cde332a4fa2fe4f6f0` |
| Class hash | `0xb78be67c801a4735dd175bf55c7cc9c64cc620f6e37f3d921bad124c1dfd44` |
| Declare transaction | `0xa15203022d7f71f696cf1e695a910c5b8aee9b25fe6f342005649c1ac32d5f` |
| Deploy transaction | `0x7ad9a50e742fd313acc03b94a19972526fed35f2c0d286dbb05d0e5c4795c7b` |
| Publisher (owner and publisher) | `0x070b9ebcc53df4db3b157a1b346c636f3547ed41553dcc58026126beb73d2764` (the operator's Ready wallet; not a source wallet) |
| Deploy wall time | 66 s including declare and deploy confirmation |
| Explorer | https://sepolia.starkscan.co/contract/0x2be142c378dbf4f9480196d484b9e22363887ef523ee3cde332a4fa2fe4f6f0 (Starkscan answered 200; Voyager returns 403 to scripted requests but https://sepolia.voyager.online/contract/0x2be142c378dbf4f9480196d484b9e22363887ef523ee3cde332a4fa2fe4f6f0 works in a browser) |
| `check:sepolia` | registry deployed, `registryPublisherMatches: true`, publisher balance 107.3 STRK before the benchmark |

## Fee and latency benchmark (`npm run benchmark:sepolia`, `docs/benchmarks/sepolia-2026-09-28.json`)

| Article | UTF-8 bytes (title + subtitle + body) | Calldata felts | Estimated fee | Actual fee | Confirm (ACCEPTED_ON_L2) | Read back | Byte-for-byte match |
| --- | --- | --- | --- | --- | --- | --- | --- |
| short | 614 | 29 | 0.877 STRK | 0.395 STRK | 13.1 s | 1.3 s | yes |
| typical | 4158 | 143 | 3.666 STRK | 1.640 STRK | 15.5 s | 1.1 s | yes |
| long | 22187 | 725 | 18.004 STRK | 8.005 STRK | 19.8 s | 2.1 s | yes |

Transactions: short `0x24c263fe6ae1ce5dc70638666f237add225dbe395715bf4b0d880af0e9cb0e3`, typical `0x2021180a3b80c11903453caad2b545c8d782093857bcf6ccb19920022930033`, long `0x6d0bbad278c7b92378f97451c3e786fd4d38b8ed9b5001c96ed44adc79df43a`. Article ids: `0xaa9f9fb4e09ba4a12629b8dc0dead6b4b9df3b118e0568d764c49f37792461`, `0x8c1b7817ccc61c6a7e2626bb77407372344ce4f44de468875e23b0ca33590a`, `0x69e3465bb68a063c603f8ab660caf74402a7c985450536535c113368ee5d0d`.

Actual cost is close to linear at about 0.36 STRK per KB of article text on Sepolia (the estimate overshoots by roughly 2.2x, which is starknet.js's resource-bounds overhead). starknet.js logged "Insufficient transaction data" warnings while estimating a tip from recent blocks; it still submitted with the recommended tip and every transaction was accepted.

**Product limit set from these numbers:** body limit 16384 bytes in `ARTICLE_LIMITS` (the contract's hard cap stays 24576). At the measured rate a maximal article costs about 6 STRK and confirms in about 20 s. Title 180 and subtitle 420 are unchanged.

## Independent read-back proof (`npm run readback:sepolia`, fresh process, RPC only)

- The feed rebuilt from the contract alone lists the three benchmark articles, newest first.
- The long article read back with 22058 body bytes, 36 title bytes, 93 subtitle bytes; `approved_digest` equals the article id.
- The SHA-256 digest recomputed in Python over the decoded chain text (canonical JSON, first 31 bytes) equals the article id, so the stored text is exactly what was approved.
- A raw `starknet_call` to `get_article_meta` through a second, unrelated public RPC (zan.top) with curl returned `exists=1`, the digest, timestamp `0x6aba6b7b`, and byte lengths `0x24`, `0x5d`, `0x562a` with `0x2c8` = 712 body chunks. No server, database, or IPFS was involved.

## Rendered pages against the live registry

With the dev server pointed at the deployed registry, `/` lists the three articles, `/article/0x69e3...` renders three `<h2>` headings from the Markdown body with no leaked syntax, shows the registry address in the provenance panel, and an unknown id returns 404 (dev server).

## CI on PR #1 (https://github.com/RealAdii/sovereign-journalist/pull/1)

All jobs passed on both the push and the pull request runs: Typecheck, lint, test, build (1m21s); Cairo build and tests; Browser flow tests (mocked backend) (1m16s); Sepolia read-only compatibility check (24s).

## AI interview and drafting against the local open model (2026-09-28, 22:15)

Backend: Ollama (Homebrew service) serving `qwen2.5:7b` on an Apple M-series laptop with 24 GB RAM. Driven through the real app routes with a dev capability from `npm run dev:capability` (dev bypass on), not through the mocked e2e.

| Step | Result |
| --- | --- |
| `/api/capabilities` | `aiInterview: { provider: "ollama", model: "qwen2.5:7b", external: false, enabled: true }` with the local disclosure text |
| Interview turn 1 (streamed) | HTTP 200, first token after 3.5 s, complete reply in 4.4 s, 221 bytes: a single follow-up question, no request for identifying details |
| Article draft from a 6-message transcript | HTTP 200 in 7.6 s, 1242 body characters, valid JSON, contains the required "What has been proven" and "What has not been independently corroborated" sections, no confidence score, no em or en dashes |
| Raw wire format | `POST /api/chat` streamed NDJSON `{ message: { role, content }, done }` and `format: "json"` non-streamed reply confirmed with curl before the parser was trusted; about 50 tokens per second |

Caveat observed: the 7B model wrote "the source, who works in finance" from a transcript that only said "our finance team". Small models infer detail. The source-side editor and the identifying-details checklist before publication remain the control, and the prompt's "remove identifying details" rule is advisory only.

## Live Reclaim proof (2026-09-28, 22:40, SDK 5.8.2)

The user completed a verification in the embedded Reclaim portal with their own app and provider (`f9f383fd-32d9-4c54-942f-5e9fda349762`, template version 2.0.1). Reclaim's session endpoint reported `PROOF_SUBMITTED` with one proof whose context carried `contextAddress`, `contextMessage`, `reclaimSessionId`, `isPortalProof`, an attestation nonce, and `extractedParameters: { email }`. Running the server verifier against that proof with the stored challenge and provider version returned VERIFIED with parameter name `email` only. Because the SDK's browser-side `onSuccess` did not fire, completion is now server-driven (`POST /api/verify/status`), covered by two route tests: pending without a proof, issued once with a proof, 410 afterwards; 409 on a Reclaim error state; 401 then 410 on a proof that fails verification.

## Browser flow tests (`npm run test:e2e`, Playwright 1.55, Chromium)

These drive the real Next.js dev server with `ALLOW_DEV_WITHOUT_PRIVATE_BOND=true` and mock only the routes that need secrets or Sepolia (`/api/interview`, `/api/generate`, `/api/publish/estimate`, `/api/publish`, `/api/recover` where a fake code must succeed, `/api/bond` for the blocked variant). They are UI flow tests with a mocked backend, not a Sepolia publication.

```
  12 passed (13.8s)
```

- publish: disclosure gate before any input, three interview turns, draft, edit the title, estimate required before publish, fee and article id shown, preview renders a Markdown table and inline code, checkbox gates the publish button, published screen shows article id and transaction link, token removed from the browser.
- publish: editing after the estimate invalidates it; a 181-byte title disables the estimate with the byte-limit notice.
- failures: AI 502 shows the error and restores the message; RPC 502 on estimate shows the error inside the editor; publish 502 keeps the editor open, never shows Published, keeps the token; blocked bond redirects the interview to the bond page which lists the blockers and offers no continue button; the real `/api/bond` refuses a receipt; no session redirects to verification.
- tip: page shows blocked with the missing list and has no form; the real `/api/tips` returns 503 with "Nothing you typed was stored".
- recovery: valid code (mocked) issues a session and continues; a wrong code against the real route shows "No active session matches".
- overview and honesty: submit page states Google, permanence, and bond facts; `/api/capabilities` reports tips and confidential compute disabled; `/api/attestation` reports `tee: false`.

## Rendered page check (standalone build served locally)

Every page was fetched from `node .next/standalone/server.js` and the HTML was inspected after stripping tags: `/`, `/submit`, `/submit/verify`, `/submit/bond`, `/submit/interview`, `/submit/tip`, `/submit/recover`, `/article/<id>`, and every API route returned 200 (or the intended 503 for tips and bond). The submit page shows the Google disclosure, the blocked bond, and the blocked tip path from the live capability report; the tip page shows the live pool class hash. No leaked Markdown (`**`, `| ---`, `[text](url)`) appears in any rendered page.

Observed discrepancy: for an unknown article id, `next start` returns HTTP 404 with the not-found page, but the standalone server (`output: standalone`, used by the Dockerfile) returns the same not-found body with HTTP 200. Root cause not identified. Treat it as a known quirk until verified against a newer Next.js.

## Not run, and what each needs

| Item | Blocker | How to run once unblocked |
| --- | --- | --- |
| Interview and drafting through Google Gemini | `GEMINI_API_KEY` and `AI_PROVIDER=gemini` | optional; the local Ollama path is verified above |
| Browser end-to-end against live Reclaim, Gemini, and Sepolia | all of the above | run `npm run test:e2e` after replacing the `page.route` mocks with real credentials; the mocked version passes today |
| Two-wallet bond linkage analysis | no private bond path exists | blocked by design, see docs/COMPATIBILITY.md |
