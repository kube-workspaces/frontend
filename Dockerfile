FROM node:22-alpine AS builder

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app

LABEL org.opencontainers.image.source="https://github.com/kube-workspaces/frontend"

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Build information, so a running container can be identified without inspecting
# the image digest. Set in the runner stage rather than the builder so a rebuild
# for a new commit does not invalidate the npm/Next.js build cache.
ARG VERSION=dev
ARG COMMIT=unknown
ARG BUILD_DATE=unknown
ENV APP_VERSION=$VERSION
ENV APP_COMMIT=$COMMIT
ENV APP_BUILD_DATE=$BUILD_DATE

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Production server with proxy support for escaped workspace requests (WebSocket, assets).
# Uses Next.js getRequestHandlers() for app serving + http-proxy for workspace forwarding.
COPY --from=builder --chown=nextjs:nodejs /app/server-prod.mjs ./server-prod.mjs
COPY --from=builder /app/node_modules/http-proxy ./node_modules/http-proxy
COPY --from=builder /app/node_modules/eventemitter3 ./node_modules/eventemitter3
COPY --from=builder /app/node_modules/requires-port ./node_modules/requires-port
COPY --from=builder /app/node_modules/follow-redirects ./node_modules/follow-redirects

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server-prod.mjs"]
