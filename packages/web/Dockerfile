FROM node:20-slim AS builder

WORKDIR /app

# Copy workspace root + shared package first
COPY package.json package-lock.json ./
COPY packages/shared/ packages/shared/
COPY packages/web/package.json packages/web/
RUN npm ci

# Copy web source and build
COPY packages/web/ packages/web/
RUN npm run build --workspace=packages/web

# --- Production image ---
FROM node:20-slim

RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    xvfb \
    xauth \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PUPPETEER_CHROMIUM_REVISION=skip

WORKDIR /app

COPY --from=builder /app/packages/web/.next/standalone ./
COPY --from=builder /app/packages/web/.next/static ./packages/web/.next/static
COPY --from=builder /app/packages/web/public ./packages/web/public

ENV NODE_ENV=production
ENV PORT=3069
ENV HOSTNAME=0.0.0.0

EXPOSE 3069

CMD ["node", "packages/web/server.js"]
