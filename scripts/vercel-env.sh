#!/usr/bin/env bash
# Uploads the server-side variables from .env.local to a Vercel environment
# (preview by default) without printing any value. Usage: scripts/vercel-env.sh [preview|production]
set -euo pipefail
TARGET="${1:-preview}"
NAMES=(STARKNET_SEPOLIA_RPC_URL STARKNET_PUBLISHER_ADDRESS STARKNET_PUBLISHER_PRIVATE_KEY NEXT_PUBLIC_ARTICLE_REGISTRY_ADDRESS NEXT_PUBLIC_STRK20_POOL_ADDRESS NEXT_PUBLIC_BOND_TREASURY_ADDRESS NEXT_PUBLIC_STARKNET_NETWORK NEXT_PUBLIC_STARKNET_CHAIN_ID NEXT_PUBLIC_STARKNET_EXPLORER RECLAIM_APP_ID RECLAIM_APP_SECRET RECLAIM_PROVIDER_ID OPENROUTER_API_KEY OPENROUTER_MODEL OPENROUTER_PROVIDER PHALA_API_KEY PROVING_SERVICE_URL INDEXER_URL BOND_TREASURY_PRIVATE_KEY BOND_VIEWING_KEY SESSION_SECRET RATE_LIMIT_SECRET SESSION_STORE_URL APP_PUBLIC_URL)
for NAME in "${NAMES[@]}"; do
  VALUE="$(grep -E "^${NAME}=" .env.local | head -1 | cut -d= -f2- || true)"
  if [ -z "$VALUE" ]; then echo "skip ${NAME} (empty)"; continue; fi
  npx vercel@latest env rm "$NAME" "$TARGET" --yes >/dev/null 2>&1 || true
  npx vercel@latest env add "$NAME" "$TARGET" --value "$VALUE" --yes >/dev/null 2>&1 && echo "set ${NAME} (${TARGET})" || echo "FAILED ${NAME}"
done
# The hosted build must not use the local Ollama or the dev bypass.
npx vercel@latest env rm AI_PROVIDER "$TARGET" --yes >/dev/null 2>&1 || true
npx vercel@latest env add AI_PROVIDER "$TARGET" --value openrouter --yes >/dev/null 2>&1 && echo "set AI_PROVIDER=openrouter (${TARGET})"
