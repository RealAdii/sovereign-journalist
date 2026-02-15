# Sovereign Journalist

Anonymous whistleblower platform where sources prove credentials via zkTLS, get interviewed by an AI journalist, and publish uncensorable stories to IPFS — all running inside a Trusted Execution Environment so nobody (not even the operator) can access source identities.

**Live (TEE):** http://34.26.214.35:8000
**TEE Verification:** https://verify-sepolia.eigencloud.xyz/app/0xcD6e2638Eb88E82294F622d19c5C416b6E6C8eD4

## How It Works

1. **Verify** — Source proves their identity (e.g. employer, role) using [Reclaim Protocol](https://reclaimprotocol.org) zkTLS proofs. No personal info is revealed — only that the credential is valid.
2. **Interview** — An AI journalist (Gemini) conducts a structured interview, asking follow-up questions based on the verified credential context.
3. **Publish** — The article is generated from the interview transcript and published to IPFS via Pinata. It's permanently stored and uncensorable.
4. **Trust** — The entire app runs inside an Intel TDX Trusted Execution Environment via EigenCompute. The `/api/attestation` endpoint provides cryptographic proof of the execution environment.

## Tech Stack

- **Next.js 14** — App Router, server components, API routes
- **Reclaim Protocol** — zkTLS credential verification (proves identity without revealing it)
- **Google Gemini** — AI journalist for conducting interviews and generating articles
- **IPFS / Pinata** — Decentralized, permanent article storage
- **EigenCompute** — Trusted Execution Environment (Intel TDX) deployment
- **Tailwind CSS** — Dark-themed UI with neon accents

## Prerequisites

- Node.js 18+
- npm
- API keys (see below)

## Local Development

1. Clone the repo:

```bash
git clone https://github.com/RealAdii/sovereign-journalist.git
cd sovereign-journalist
```

2. Install dependencies:

```bash
npm install
```

3. Create `.env.local` from the example:

```bash
cp .env.example .env.local
```

4. Fill in your API keys in `.env.local`:

| Variable | Where to get it |
|----------|----------------|
| `NEXT_PUBLIC_RECLAIM_APP_ID` | [Reclaim Developer Portal](https://dev.reclaimprotocol.org/) |
| `NEXT_PUBLIC_RECLAIM_APP_SECRET` | Reclaim Developer Portal |
| `NEXT_PUBLIC_RECLAIM_PROVIDER_ID` | Reclaim Developer Portal (choose a provider) |
| `GEMINI_API_KEY` | [Google AI Studio](https://aistudio.google.com/apikey) |
| `PINATA_API_KEY` | [Pinata](https://app.pinata.cloud/developers/api-keys) |
| `PINATA_SECRET_KEY` | Pinata |
| `SESSION_SECRET` | Any random string (e.g. `openssl rand -hex 32`) |

5. Run the dev server:

```bash
npm run dev
```

6. Open http://localhost:3000

## Project Structure

```
src/
  app/
    page.tsx                    # Homepage — article feed
    submit/
      page.tsx                  # Step 1: Start submission
      verify/page.tsx           # Step 2: zkTLS credential verification
      interview/page.tsx        # Step 3: AI interview + publish
    article/[cid]/page.tsx      # Article reader (fetches from IPFS)
    api/
      verify/route.ts           # Reclaim proof verification
      interview/route.ts        # AI interview (streaming chat)
      generate/route.ts         # Article generation from transcript
      publish/route.ts          # Publish article to IPFS
      attestation/route.ts      # TEE attestation proof endpoint
  components/                   # UI components (chat, verification, etc.)
  lib/
    gemini.ts                   # Gemini API client
    pinata.ts                   # IPFS/Pinata client
    reclaim.ts                  # Reclaim SDK helpers
    session.ts                  # Server-side session management
    types.ts                    # TypeScript types
```

## Docker

The app is containerized for TEE deployment. To build locally:

```bash
docker build \
  --build-arg NEXT_PUBLIC_RECLAIM_APP_ID=<your-id> \
  --build-arg NEXT_PUBLIC_RECLAIM_APP_SECRET=<your-secret> \
  --build-arg NEXT_PUBLIC_RECLAIM_PROVIDER_ID=<your-provider> \
  --build-arg NEXT_PUBLIC_PINATA_GATEWAY=https://gateway.pinata.cloud \
  --build-arg NEXT_PUBLIC_APP_URL=http://localhost:8000 \
  -t sovereign-journalist .

docker run --rm -p 8000:8000 \
  -e GEMINI_API_KEY=<key> \
  -e PINATA_API_KEY=<key> \
  -e PINATA_SECRET_KEY=<key> \
  -e SESSION_SECRET=<secret> \
  sovereign-journalist
```

The Docker image uses a multi-stage Alpine build with Next.js standalone output (~200MB final image). `NEXT_PUBLIC_*` variables are baked in at build time; server-side secrets are injected at runtime.

## EigenCompute TEE Deployment

The app is deployed to [EigenCompute](https://www.eigencloud.xyz/) on the Sepolia testnet, running inside an Intel TDX Trusted Execution Environment.

**What this means:** The code running the AI journalist is tamper-proof and verifiable. Nobody — not even the server operator — can access source identities, modify interview logic, or read encryption keys. This is "trust by math, not trust by promise."

To deploy your own instance:

1. Install the CLI: `npm install -g @layr-labs/ecloud-cli`
2. Authenticate: `ecloud auth generate --store`
3. Subscribe: `ecloud billing subscribe`
4. Fund your wallet with Sepolia ETH (see [faucet](https://cloud.google.com/application/web3/faucet/ethereum/sepolia))
5. Push your Docker image to a public registry (e.g. ghcr.io)
6. Deploy: `ecloud compute app deploy --image-ref <your-image> --environment sepolia`

The GitHub Actions workflow (`.github/workflows/docker-build.yml`) automates this entire process.

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/verify` | POST | Verify a Reclaim zkTLS proof |
| `/api/interview` | POST | Send a message in the AI interview |
| `/api/generate` | POST | Generate article from interview transcript |
| `/api/publish` | POST | Publish article to IPFS |
| `/api/attestation` | GET | TEE attestation proof and environment info |

## License

MIT
