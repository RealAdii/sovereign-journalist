# Stage 1: Install dependencies
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# Stage 2: Build the application
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_* vars must be available at build time (inlined into JS bundles)
ARG NEXT_PUBLIC_RECLAIM_APP_ID
ARG NEXT_PUBLIC_RECLAIM_APP_SECRET
ARG NEXT_PUBLIC_RECLAIM_PROVIDER_ID
ARG NEXT_PUBLIC_PINATA_GATEWAY
ARG NEXT_PUBLIC_APP_URL

ENV NEXT_PUBLIC_RECLAIM_APP_ID=$NEXT_PUBLIC_RECLAIM_APP_ID
ENV NEXT_PUBLIC_RECLAIM_APP_SECRET=$NEXT_PUBLIC_RECLAIM_APP_SECRET
ENV NEXT_PUBLIC_RECLAIM_PROVIDER_ID=$NEXT_PUBLIC_RECLAIM_PROVIDER_ID
ENV NEXT_PUBLIC_PINATA_GATEWAY=$NEXT_PUBLIC_PINATA_GATEWAY
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL

RUN mkdir -p public
RUN npm run build

# Stage 3: Production runner
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8000
ENV HOSTNAME="0.0.0.0"

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy public assets (if they exist)
COPY --from=builder /app/public ./public

# Copy standalone build output
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 8000

CMD ["node", "server.js"]
