# PracticeRoom — Nest API + Python room_worker (+ static web stage)
FROM node:22-bookworm AS web-build
WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@12.18.0 --activate
COPY package.json pnpm-workspace.yaml ./
COPY packages/shared-types/package.json packages/shared-types/
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile=false
COPY packages/shared-types packages/shared-types
COPY apps/web apps/web
# Same-origin /api via nginx in runtime-web
ENV VITE_API_URL=
RUN pnpm --filter @practice-room/web build

FROM node:22-bookworm AS api-build
WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@12.18.0 --activate
COPY package.json pnpm-workspace.yaml ./
COPY packages/shared-types/package.json packages/shared-types/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile=false
COPY packages/shared-types packages/shared-types
COPY apps/api apps/api

# API runtime: full workspace + Python worker (nest start resolves TS workspace packages)
FROM node:22-bookworm AS runtime-api
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-pip \
    && rm -rf /var/lib/apt/lists/* \
    && ln -sf /usr/bin/python3 /usr/local/bin/python \
    && corepack enable && corepack prepare pnpm@12.18.0 --activate

COPY apps/ai-service/requirements.txt /tmp/requirements.txt
RUN pip3 install --no-cache-dir --break-system-packages -r /tmp/requirements.txt \
    && rm /tmp/requirements.txt

COPY --from=api-build /repo /app
COPY apps/ai-service /app/apps/ai-service

ENV NODE_ENV=production \
    PORT=3000 \
    PRACTICE_ROOM_DATA_DIR=/data \
    PRACTICE_ROOM_AI_SERVICE=/app/apps/ai-service \
    CORS_ORIGIN=http://localhost:8080

WORKDIR /app
EXPOSE 3000
VOLUME ["/data"]
CMD ["pnpm", "--filter", "@practice-room/api", "start"]

# Static web + nginx reverse proxy to api:3000 (local compose)
FROM nginx:1.27-alpine AS runtime-web
COPY --from=web-build /repo/apps/web/dist /usr/share/nginx/html
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80

# Production all-in-one: API + Python + static UI + nginx on :8080 (Fly / single host)
FROM runtime-api AS runtime-prod
RUN apt-get update \
    && apt-get install -y --no-install-recommends nginx wget \
    && rm -rf /var/lib/apt/lists/* \
    && rm -f /etc/nginx/sites-enabled/default

COPY --from=web-build /repo/apps/web/dist /usr/share/nginx/html
COPY deploy/nginx.prod.conf /etc/nginx/conf.d/default.conf
COPY deploy/start-prod.sh /start-prod.sh
RUN chmod +x /start-prod.sh

ENV NODE_ENV=production \
    COOKIE_SECURE=true \
    PORT=3000 \
    PRACTICE_ROOM_DATA_DIR=/data \
    PRACTICE_ROOM_AI_SERVICE=/app/apps/ai-service

EXPOSE 8080
VOLUME ["/data"]
CMD ["/start-prod.sh"]

