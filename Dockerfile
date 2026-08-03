# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS client-build
WORKDIR /app/client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

FROM node:22-bookworm-slim AS server-deps
WORKDIR /app/server
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Render (and most hosts) inject PORT at runtime; default for local docker runs.
ENV PORT=4040
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY --from=server-deps /app/server/node_modules ./server/node_modules
COPY server/package.json server/package-lock.json ./server/
COPY server/src ./server/src
COPY server/scripts ./server/scripts
COPY --from=client-build /app/client/dist ./client/dist

WORKDIR /app/server
RUN mkdir -p data && node src/seed.js

EXPOSE 4040
CMD ["node", "src/index.js"]
