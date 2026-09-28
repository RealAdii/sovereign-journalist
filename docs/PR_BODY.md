## What this does

Replaces the IPFS/Pinata publication path with an append-only Cairo `ArticleRegistry` on Starknet Sepolia. The server-held publisher account writes the full approved article, waits for `ACCEPTED_ON_L2`, and reads it back byte for byte before showing "Published". Reclaim requests are created and signed on the server, bound to a fresh challenge, verified with `verifyProof` plus the Reclaim session lookup, and consumed once. Sessions are opaque one-use tokens with recovery codes. Gemini receives only the provider name and field names, never credential values, and the UI discloses external AI processing before the interview.

Removed: `NEXT_PUBLIC_RECLAIM_APP_SECRET` in the bundle, the `dev-secret` fallback, the env-var-only `tee: true` claim, the LLM confidence score, Pinata, and the EigenCompute deploy workflow.

Blocked by design, with dependency lists in the UI, `/api/capabilities`, and `docs/COMPATIBILITY.md`: the anonymous 1 STRK bond and encrypted STRK20 tips. Public transfers are refused as a substitute. The live pool charges 2 STRK per private operation and requires a `UseNote` in every batch, which are recorded findings.

## Tests

- 43 vitest unit and route tests (encoding round trips, digest, one-use sessions, forged and replayed proofs, blocked bond, duplicate publish, rendered Markdown)
- 12 snforge tests (registry and tip_inbox)
- 12 Playwright browser flow tests with a mocked backend
- typecheck, lint, build, em dash scan, read-only Sepolia check in CI

## Not run (needs secrets)

Registry deployment, fee benchmark for three article sizes, live read-back proof, live Reclaim proof, Gemini interview, two-wallet linkage analysis. Scripts are ready: `deploy:sepolia`, `benchmark:sepolia`, `readback:sepolia`. See `docs/TEST_REPORT.md`.

## Before deploying

Rotate the Reclaim app secret (it was inlined into every previous bundle and image), see `docs/MIGRATION.md`. Mainnet remains unconfigured and refused; see `docs/MAINNET_CHECKLIST.md`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
