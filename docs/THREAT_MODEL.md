# Threat model (Sepolia build)

Scope: the Next.js server, the Starknet Sepolia article registry, the Reclaim verification flow, the Gemini interview, and the browser. Out of scope: the source's device security and the Reclaim attestor network's own security.

## Assets

1. The source's identity and the link between identity and a published article.
2. Interview text before the source approves a public article.
3. Reclaim credential parameter values.
4. Server secrets: Reclaim app secret, publisher private key, session secrets, Gemini key.
5. Integrity of published articles.

## Parties and what each one sees

| Party | Sees | Does not see | Controls |
| --- | --- | --- | --- |
| Source's browser | everything the source types, session token, recovery code | server secrets | what is submitted |
| This server and its operator | IP address, timing, Reclaim proof and disclosed parameter values (in memory and in the session store for up to 2 hours), interview text in transit, approved article | nothing is hidden from the operator in this build | publishing key, rate limits |
| Reclaim attestors and app backend | that a session for this app id happened, provider id, the proof; the source's IP during proof generation | interview text | whether a proof is issued |
| Google (Gemini API) | every interview message, the provider name, the draft article | credential parameter values, session tokens, IP of the source (requests come from the server) | model output |
| Starknet Sepolia (public) | full article text, article id, approved digest, publish timestamp, publisher account address, fee paid | interview, credential, source IP, source wallet (never involved) | nothing |
| Any reader | the same as Starknet plus this site's pages | | |

## Threats and mitigations

### T1. Source identity linked through the publishing transaction
The transaction is signed by the server's publisher account. The source never signs, never connects a wallet, and never pays. Mitigated. Residual: the operator knows which session produced which article for the lifetime of the session record (2 hours max) and can correlate by time. The article id is not derived from anything session-specific.

### T2. Source identity linked through a bond payment
A public STRK transfer from the source would appear onchain next to the publication time. Not mitigated; therefore the bond is blocked and no receipt is accepted. See docs/COMPATIBILITY.md.

### T3. Reclaim disclosure reveals more than the source expects
Provider templates decide what parameters are extracted. Mitigation: the UI warns before verification and shows the disclosed field names after. Parameter values are stored only in the server session record, never sent to Gemini, never written onchain, never logged. Residual: the operator can read them for the session lifetime. Choose a provider template that extracts only the minimum field.

### T4. Replayed or forged proof
Mitigation: server-initiated request with a fresh `verificationId` and random challenge in the signed context; `verifyProof` checks attestor signatures; provider id must match; the verification record is deleted before the proof is checked so any second submission fails; the capability token is random, HMAC-hashed at rest, expires in 2 hours, and publish is single-use. Tested in `tests/reclaim.test.ts` and `tests/routes.test.ts`.

### T5. Repeated AI usage without a bond
Mitigation: per-session cap of 30 AI calls, per-IP rate limits on every route, publish limited to one per session. Residual: without a working bond, an attacker with many Reclaim-capable accounts can still run 30 calls per verification. The bond remains a requirement for production.

### T6. Interview text exposed to Google
Not mitigated technically. Mitigation is disclosure: a gate screen before the interview says Google receives everything, lets the source decline, and links to the (currently blocked) encrypted path. The prompt instructs the model not to elicit identifying details, which is advisory only.

### T7. Operator or host reads interview text
Not mitigated. No attestation, no TEE. The attestation endpoint says so. Server logs contain no request bodies; route handlers never log source text, credential values, tokens, or proofs.

### T8. Session store leakage
The store holds HMAC hashes of tokens and recovery codes, credential parameter values, and counters. It is written with mode 0600 to `SESSION_STORE_PATH` and expired records are dropped on read. Residual: it is a plaintext JSON file on the server. Production must put it on an encrypted volume or replace it with a store that supports encryption at rest; it is also single-instance only.

### T9. Publishing something the source did not approve
Mitigation: the article id is the SHA-256 (31 bytes) of the canonical approved text; the fee estimate returns it; publish requires the same digest and recomputes it server-side; the contract stores the digest and rejects duplicates; after confirmation the server reads every chunk back and compares byte for byte before showing "Published". Any edit invalidates the estimate in the UI.

### T10. Unauthorized or duplicate publication
Contract: only the configured publisher can call `publish_article`; duplicate ids are rejected; sizes are bounded; chunk counts must match byte lengths. Owner can rotate the publisher. Tested with snforge.

### T11. Secrets in the browser bundle
All Reclaim and chain secrets are server-only. No `NEXT_PUBLIC_*` variable holds a secret. The Dockerfile takes no build arguments. The previously exposed `NEXT_PUBLIC_RECLAIM_APP_SECRET` must be rotated in the Reclaim dashboard before any deployment (see docs/MIGRATION.md).

### T12. IP and timing metadata
The server, Reclaim, and the RPC provider see the server's requests; the source's IP reaches this server and Reclaim. Not mitigated in this build. Recommended: publish through a Tor onion service, avoid third-party analytics (none are included), and delay publication by a random interval so the block timestamp does not equal the interview end time.

### T13. AI output presented as fact
Mitigation: no confidence score; the article page labels "credential proven", "allegation reported", and "not independently corroborated"; the prompt requires a "What has not been independently corroborated" section; the source edits the text and must tick an irreversibility acknowledgement.

## Explicit non-claims

- This build does not claim that the operator cannot read source data.
- This build does not claim that Google cannot read interview data.
- This build does not claim anonymity for any bond or tip path, because none is live.
- A Reclaim proof does not prove that any allegation is true.
