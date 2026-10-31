# Compile the browser editor without embedding fonts.
FROM rust:1-bookworm AS deckcraft
WORKDIR /work
RUN rustup target add wasm32-unknown-unknown \
    && cargo install trunk --version 0.22.1 --locked
COPY vendor/deckcraft/ vendor/deckcraft/
COPY patches/deckcraft-bridge.patch patches/deckcraft-bridge.patch
COPY scripts/build-deckcraft.sh scripts/build-deckcraft.sh
RUN bash scripts/build-deckcraft.sh

FROM node:24-alpine AS builder
WORKDIR /app
RUN apk add --no-cache openssl && npm install -g pnpm@9
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY ./ ./
COPY --from=deckcraft /work/public/deckcraft/ ./public/deckcraft/
RUN npx prisma generate && pnpm build

FROM node:24-alpine AS runner
WORKDIR /app
RUN apk add --no-cache openssl
ENV NODE_ENV=production
COPY --from=builder /app ./
CMD ["./start.sh"]
