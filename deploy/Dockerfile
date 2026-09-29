FROM node:24.11.1-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY vendor/codex-harness ./vendor/codex-harness
RUN npm ci
COPY src ./src
COPY public ./public
COPY bridge ./bridge
COPY index.html scene-render.html vite.production.config.ts tsconfig.json tsconfig.production.json ./
RUN npm run build:studio

FROM node:24.11.1-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends chromium ffmpeg ca-certificates fonts-noto-cjk tini && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY vendor/codex-harness ./vendor/codex-harness
RUN npm ci --omit=dev && npm cache clean --force
COPY bridge ./bridge
COPY src/frontend ./src/frontend
COPY --from=build /app/dist ./dist
RUN mkdir -p /app/runtime && chown node:node /app/runtime
ENV NODE_ENV=production MOUVA_AI_HOST=0.0.0.0 MOUVA_AI_PORT=5175 MOUVA_AI_DATA_DIR=/app/runtime CHROME_PATH=/usr/bin/chromium MOUVA_RENDER_ORIGIN=http://127.0.0.1:5175
USER node
EXPOSE 5175
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "bridge/server.mjs"]
