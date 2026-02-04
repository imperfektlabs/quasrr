FROM node:20-alpine AS base
RUN corepack enable

FROM base AS deps
WORKDIR /app
COPY package.json ./
RUN npm install

FROM base AS builder
WORKDIR /app

COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node . .

RUN chown -R node:node /app && \
    mkdir -p /app/.next /app/.next/cache /app/.next/static /app/.next/standalone /app/.next/server/app && \
    chown -R node:node /app/.next

ENV NEXT_TELEMETRY_DISABLED=1

USER node

RUN npm run build

FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
