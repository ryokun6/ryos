FROM --platform=linux/amd64 oven/bun:1.3.9 AS build

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

FROM --platform=linux/amd64 oven/bun:1.3.9 AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

# Install Lightpanda headless browser
RUN curl -fsSL -o /usr/local/bin/lightpanda \
    https://github.com/lightpanda-io/browser/releases/download/nightly/lightpanda-x86_64-linux \
 && chmod +x /usr/local/bin/lightpanda

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV API_HOST=0.0.0.0
ENV BROWSER_CDP_URL=ws://127.0.0.1:9222

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

COPY scripts/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3000

CMD ["/usr/local/bin/docker-entrypoint.sh"]
