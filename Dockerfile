FROM oven/bun:1 AS build-dependencies
WORKDIR /app
COPY package.json bun.lock ./
# Build dependencies include Nest CLI and TypeScript, which are needed to compile the app.
RUN bun install --frozen-lockfile

FROM build-dependencies AS build
COPY . .
RUN bun run build

FROM oven/bun:1 AS production-dependencies
WORKDIR /app
COPY package.json bun.lock ./
# Install only runtime dependencies so build and test tools stay out of the final image.
RUN bun install --production --frozen-lockfile

FROM node:26-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
USER node
EXPOSE 4000
CMD ["node", "dist/main.js"]
