# Test report

Generated 2026-09-28 on macOS (Darwin 25.3.0, aarch64), Node 22.14.0, Scarb 2.14.0, snforge 0.57.0. No project secrets were available, so everything below is local or read-only against public Sepolia RPC. Live Sepolia publication, fee benchmarks, live Reclaim proofs, Gemini calls, browser end-to-end tests, and the two-wallet linkage analysis were not run and are listed under "Not run".

## TypeScript unit and route tests (`npm test`)

```
> sovereign-journalist@0.1.0 test
> vitest run
 RUN  v3.2.7 /Users/adithya/sovereign-journalist-sepolia
 ✓ tests/gemini.test.ts (2 tests) 2ms
 ✓ tests/reclaim.test.ts (8 tests) 4ms
 ✓ tests/session.test.ts (9 tests) 5ms
 ✓ tests/encoding.test.ts (9 tests) 4ms
 ✓ tests/render.test.tsx (1 test) 10ms
 ✓ tests/routes.test.ts (14 tests) 14ms
 Test Files  6 passed (6)
      Tests  43 passed (43)
```

What they cover:

- `encoding.test.ts`: 31-byte chunk round trip including leading NUL bytes, all-zero chunks, CJK and emoji across chunk boundaries; chunk-count formula equals the Cairo `(n + 30) / 31`; calldata argument order; digest determinism, width, NFC normalization; byte-limit errors with field, size, max.
- `session.test.ts`: verification record one-use and expiry; capability starts blocked; bond gate; publish single-use and release after a failed transaction; 30-call AI cap; recovery rotates the token; raw tokens never stored; rate-limit window.
- `reclaim.test.ts`: valid bound proof accepted; forged signature, session for another provider or app, proof the session never produced, missing session, wrong verification id, wrong challenge, wrong session id, pinned provider hash mismatch, and wrong proof count all rejected (with `verifyProof` mocked and the session lookup injected). Fixtures use the SDK's real context field names (`contextAddress`, `contextMessage`, `providerHash`).
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
| Registry deployment (class hash, address, tx) | funded publisher account + RPC key | `npm run build:contracts && npm run deploy:sepolia`. starknet.js 10.4 fills the v3 `tip` from `getEstimateTip().recommendedTip` when it is omitted (checked in `dist/index.js`), so no tip is passed explicitly; if a provider rejects that, pass `{ tip: 0n }` in `execute`. |
| Fee and latency for short, typical, long articles | same + deployed registry | `npm run benchmark:sepolia`, results land in `docs/benchmarks/` |
| Byte-for-byte read-back from a fresh process without the server | deployed registry with at least one article | `npm run readback:sepolia -- <articleId> expected.json` |
| Product article size limit from real measurements | benchmark results | adjust `ARTICLE_LIMITS` and the Cairo constants together |
| Live Reclaim proof, replay attempt against a live attestor | Reclaim app id, secret, provider id | `npm run dev`, /submit/verify, then resubmit the same proof and expect 410 |
| Interview and drafting | `GEMINI_API_KEY` | `npm run dev` with `ALLOW_DEV_WITHOUT_PRIVATE_BOND=true` |
| Browser end-to-end against live Reclaim, Gemini, and Sepolia | all of the above | run `npm run test:e2e` after replacing the `page.route` mocks with real credentials; the mocked version passes today |
| Two-wallet bond linkage analysis | no private bond path exists | blocked by design, see docs/COMPATIBILITY.md |
