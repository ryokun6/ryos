FROM --platform=linux/amd64 oven/bun:1.3.9@sha256:856da45d07aeb62eb38ea3e7f9e1794c0143a4ff63efb00e6c4491b627e2a521 AS build

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .

# Commit SHA passed in by CI (e.g. GitHub Actions). The prebuild script
# (`scripts/generate-build-version.ts`) reads this to populate the build
# number in `public/version.json`. Without it, the script falls back to
# 'dev' because the `.git` directory is excluded by `.dockerignore`.
ARG GIT_COMMIT_SHA=""
ENV GIT_COMMIT_SHA=$GIT_COMMIT_SHA

RUN bun run build

FROM --platform=linux/amd64 oven/bun:1.3.9@sha256:856da45d07aeb62eb38ea3e7f9e1794c0143a4ff63efb00e6c4491b627e2a521 AS prod-deps

WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

FROM --platform=linux/amd64 oven/bun:1.3.9@sha256:856da45d07aeb62eb38ea3e7f9e1794c0143a4ff63efb00e6c4491b627e2a521 AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV API_HOST=0.0.0.0

COPY --chown=bun:bun --from=build /app/package.json ./package.json
COPY --chown=bun:bun --from=build /app/bun.lock ./bun.lock
COPY --chown=bun:bun --from=prod-deps /app/node_modules ./node_modules
COPY --chown=bun:bun --from=build /app/api ./api
COPY --chown=bun:bun --from=build /app/scripts/api-standalone-server.ts ./scripts/api-standalone-server.ts
COPY --chown=bun:bun --from=build /app/scripts/api-route-manifest.ts ./scripts/api-route-manifest.ts
COPY --chown=bun:bun --from=build /app/src ./src
COPY --chown=bun:bun --from=build /app/dist ./dist
COPY --chown=bun:bun --from=build /app/tsconfig.json ./tsconfig.json
COPY --chown=bun:bun --from=build /app/tsconfig.node.json ./tsconfig.node.json
COPY --chown=bun:bun --from=build /app/tsconfig.app.json ./tsconfig.app.json

EXPOSE 3000

USER bun

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl --fail --silent --show-error http://127.0.0.1:3000/health >/dev/null || exit 1

CMD ["bun", "run", "start"]
