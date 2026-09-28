# Migration notes: IPFS and EigenCompute to Starknet Sepolia

## What changed

| Area | Before | After |
| --- | --- | --- |
| Publication | `/api/publish` pinned JSON to Pinata, feed listed Pinata pins, article page fetched `/ipfs/[cid]` | `/api/publish` writes the full article to the `ArticleRegistry` contract on Sepolia, waits for `ACCEPTED_ON_L2`, reads it back, and only then returns. Feed and article page read from the contract. |
| Article URL | `/article/<cid>` | `/article/<articleId>` where the id is the 31-byte SHA-256 digest of the approved text. Legacy CIDs still resolve (see below). |
| Reclaim | Browser created the request with `NEXT_PUBLIC_RECLAIM_APP_SECRET`; `/api/verify` extracted parameters without `verifyProof` | Server creates and signs the request (`/api/verify/start`), binds a challenge, browser only runs the flow, `/api/verify` calls `verifyProof`, checks provider and context, consumes the one-use record, issues an opaque token plus recovery code |
| Sessions | HMAC-signed self-contained token with `SESSION_SECRET || "dev-secret"` fallback | Random token, HMAC hash at rest in a file store, 2 hour expiry, single publish, 30 AI calls, recovery codes, no fallback secret (server throws if secrets are shorter than 32 chars) |
| AI | Gemini only; full credential parameters could be included after a regex filter; confidence score in output | Provider facade (`src/lib/ai.ts`). Default is a local open model through Ollama, Gemini is opt-in. Only provider name and field names are sent; no confidence score; JSON output mode. Every disclosure in the UI reads the active backend. |
| TEE | `tee: true` when an env var was set; EigenCompute deploy workflow | `tee: false` always; workflow replaced by CI; Dockerfile has no build-time secrets |
| Bond | none | 1 STRK Sepolia bond designed, explicitly blocked, receipts refused |
| Tips | none | Encrypted tip design and helper contract, explicitly blocked |

## Legacy article links

Old links of the form `/article/Qm...` or `/article/bafy...` continue to work in read-only mode. The page fetches the JSON from `LEGACY_IPFS_GATEWAY` (default `https://gateway.pinata.cloud`), renders title, subtitle, and body, shows a "legacy article" notice, and hides the old confidence score. No Pinata API key is needed for reads. New articles cannot be written to IPFS.

If you want legacy articles in the Sepolia feed, republish each one through the publisher account with `scripts/benchmark-articles.mts` as a template. That creates a new article id and costs Sepolia STRK. The original CID can be mentioned in the subtitle if provenance matters.

## Environment variables

Removed: `NEXT_PUBLIC_RECLAIM_APP_ID`, `NEXT_PUBLIC_RECLAIM_APP_SECRET`, `NEXT_PUBLIC_RECLAIM_PROVIDER_ID`, `PINATA_API_KEY`, `PINATA_SECRET_KEY`, `NEXT_PUBLIC_PINATA_GATEWAY`, `EIGENCOMPUTE_ATTESTATION_URL`, `NEXT_PUBLIC_APP_URL`.

Added: see `.env.example`. AI: `AI_PROVIDER`, `OLLAMA_BASE_URL` (use `http://host.docker.internal:11434` from Docker), `OLLAMA_MODEL`. Server-only: `RECLAIM_APP_ID`, `RECLAIM_APP_SECRET`, `RECLAIM_PROVIDER_ID`, `STARKNET_SEPOLIA_RPC_URL`, `STARKNET_PUBLISHER_ADDRESS`, `STARKNET_PUBLISHER_PRIVATE_KEY`, `GEMINI_API_KEY`, `SESSION_SECRET`, `RATE_LIMIT_SECRET`, `SESSION_STORE_PATH`, `ALLOW_DEV_WITHOUT_PRIVATE_BOND`, `LEGACY_IPFS_GATEWAY`. Public: `NEXT_PUBLIC_STARKNET_NETWORK`, `NEXT_PUBLIC_STARKNET_CHAIN_ID`, `NEXT_PUBLIC_STARKNET_EXPLORER`, `NEXT_PUBLIC_ARTICLE_REGISTRY_ADDRESS`, `NEXT_PUBLIC_STRK20_POOL_ADDRESS`, `NEXT_PUBLIC_TIP_INBOX_ADDRESS`, `NEXT_PUBLIC_EDITORIAL_ENCRYPTION_PUBLIC_JWK`, `NEXT_PUBLIC_EDITORIAL_RECIPIENT_TAG`.

## Required before any deployment

1. **Rotate the Reclaim app secret.** The old one was inlined into every previous browser bundle and Docker image (`NEXT_PUBLIC_RECLAIM_APP_SECRET`). In the Reclaim developer dashboard create a new app secret, put it in `RECLAIM_APP_SECRET` on the server only, and delete the old one. Old images on ghcr.io still contain it; delete them.
2. Generate `SESSION_SECRET` and `RATE_LIMIT_SECRET` independently: `openssl rand -base64 48` twice.
3. Create a dedicated Sepolia publisher account. Fund it with Sepolia STRK from the faucet. Its private key goes only in the server's secret manager. It is the only account that can publish; rotate it with `set_publisher` from the owner account if it leaks.
4. Deploy the registry: `npm run build:contracts && npm run deploy:sepolia`. Put the printed address in `NEXT_PUBLIC_ARTICLE_REGISTRY_ADDRESS`.
5. Run `npm run check:sepolia` and confirm `registryPublisherMatches: true`.
6. Mount a persistent volume at `SESSION_STORE_PATH` or sessions and recovery codes die on restart.

## Who pays and who submits

The publisher account, controlled by the operator, submits `publish_article` and pays the fee. The source's wallet is never involved. The fee shown to the source is informational. Because the same account submits every article, publication timing is the only onchain correlation between articles, and the article id carries nothing about the source.

## Deployment procedure (unpaid, optional)

There is no production deployment in this change. To run the Sepolia build somewhere:

```bash
docker build -t sovereign-journalist:sepolia .
docker run --rm -p 8000:8000 --env-file .env.production -v sj-data:/app/.data sovereign-journalist:sepolia
```

`.env.production` must not set `ALLOW_DEV_WITHOUT_PRIVATE_BOND`. With the bond blocked, a production deployment can show the feed and the verification step only. That is intended until the bond is unblocked.
