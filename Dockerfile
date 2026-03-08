FROM oven/bun:1.3.9 AS build

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

FROM oven/bun:1.3.9 AS runtime

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
