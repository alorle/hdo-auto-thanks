FROM node:24-bookworm-slim AS builder

WORKDIR /app

COPY package.json package-lock.json tsconfig.json ./
RUN npm ci

COPY src/ src/
RUN npm run build


FROM node:24-bookworm-slim AS deps

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev


FROM node:24-bookworm-slim

WORKDIR /app

COPY --from=deps /app/node_modules node_modules/

ENV PLAYWRIGHT_BROWSERS_PATH=/app/.playwright-browsers
RUN npx playwright install --with-deps chromium \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/dist/*.js dist/

RUN useradd --create-home --shell /bin/bash appuser \
    && mkdir -p /app/.cache \
    && chown -R appuser:appuser /app

ENV CACHE_DIR=/app/.cache
ENV WEBHOOK_PORT=3000

VOLUME /app/.cache
EXPOSE 3000

USER appuser

ENTRYPOINT ["node", "dist/index.js"]
CMD ["serve"]
