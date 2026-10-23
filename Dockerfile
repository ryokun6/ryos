# Dataset files change only when their URLs change, so this layer stays cached
# across app rebuilds. A failed download fails the image build (an empty layer
# would be cached). Runtime still lazy-loads if a file is missing.
FROM --platform=linux/amd64 oven/bun:1.4.4 AS dictionary-data

WORKDIR /app

COPY api/dictionary/_helpers/_dataset-sources.ts ./api/dictionary/_helpers/_dataset-sources.ts
COPY scripts/prefetch-dictionary-data.ts ./scripts/prefetch-dictionary-data.ts

ENV DICTIONARY_DATA_DIR=/app/data/dictionary

RUN mkdir -p /app/data/dictionary && bun scripts/prefetch-dictionary-data.ts

FROM --platform=linux/amd64 oven/bun:1.4.4 AS build

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
COPY --from=dictionary-data /app/data/dictionary ./data/dictionary

# Commit SHA passed in by CI (e.g. GitHub Actions). The prebuild script
# (`scripts/generate-build-version.ts`) reads this to populate the build
# number in `public/version.json`. Without it, the script falls back to
# 'dev' because the `.git` directory is excluded by `.dockerignore`.
ARG GIT_COMMIT_SHA=""
ENV GIT_COMMIT_SHA=$GIT_COMMIT_SHA
ENV DICTIONARY_DATA_DIR=/app/data/dictionary

RUN bun scripts/build-dictionary-indexes.ts && bun run build

# Runtime dependencies only: the server never imports devDependencies
# (build tooling, test libraries), so they stay out of the final image.
FROM --platform=linux/amd64 oven/bun:1.4.4 AS prod-deps

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

FROM --platform=linux/amd64 oven/bun:1.4.4 AS runtime

# oven/bun:1.4.4 is Debian frozen when that tag was published.
# Upgrade OS packages at image build so the runtime snapshot picks up
# later security updates, then install curl.
RUN apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get upgrade -y --no-install-recommends \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends curl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV API_HOST=0.0.0.0
ENV DICTIONARY_DATA_DIR=/app/data/dictionary

# App files stay root-owned (read-only for the server user). `src/` is still
# required: API routes import shared modules from src/shared, src/utils, etc.
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/bun.lock ./bun.lock
COPY --from=build /app/api ./api
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/src ./src
COPY --from=build /app/dist ./dist
COPY --from=build /app/tsconfig.json ./tsconfig.json
COPY --from=build /app/tsconfig.node.json ./tsconfig.node.json
COPY --from=build /app/tsconfig.app.json ./tsconfig.app.json
# The dictionary cache is written at runtime (lazy dataset downloads and
# index snapshots), so it is the one directory the server user owns.
COPY --from=build --chown=bun:bun /app/data/dictionary ./data/dictionary

USER bun

EXPOSE 3000

CMD ["bun", "run", "start"]
