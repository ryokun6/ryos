FROM --platform=linux/amd64 oven/bun:1.3.9 AS build

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

FROM --platform=linux/amd64 oven/bun:1.3.9 AS runtime

# `curl` is used by the runtime + to fetch the standalone `yt-dlp` binary
# below. `ca-certificates` is required so yt-dlp can talk to YouTube /
# googlevideo.com over HTTPS. We deliberately download the upstream
# pyinstaller-bundled binary instead of `apt-get install -y yt-dlp`
# because the Debian package is months stale and breaks whenever YouTube
# rotates its player. We pin to a known-good release tag (override at
# build time with `--build-arg YT_DLP_VERSION=<tag>` to bump).
ARG YT_DLP_VERSION=2026.03.17
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && curl -fsSL -o /usr/local/bin/yt-dlp \
         "https://github.com/yt-dlp/yt-dlp/releases/download/${YT_DLP_VERSION}/yt-dlp_linux" \
    && chmod +x /usr/local/bin/yt-dlp \
    && /usr/local/bin/yt-dlp --version
ENV YT_DLP_PATH=/usr/local/bin/yt-dlp

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV API_HOST=0.0.0.0

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/bun.lock ./bun.lock
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/api ./api
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/src ./src
COPY --from=build /app/dist ./dist
COPY --from=build /app/index.html ./index.html
COPY --from=build /app/middleware.ts ./middleware.ts
COPY --from=build /app/tsconfig.json ./tsconfig.json
COPY --from=build /app/tsconfig.node.json ./tsconfig.node.json
COPY --from=build /app/tsconfig.app.json ./tsconfig.app.json

EXPOSE 3000

CMD ["bun", "run", "start"]
