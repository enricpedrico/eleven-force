FROM node:20-bookworm-slim AS build
WORKDIR /app
RUN apt-get update \
    && apt-get install --yes --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build \
    && npm prune --omit=dev \
    && npm cache clean --force

FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN groupadd --system app && useradd --system --gid app --home-dir /app app
COPY package.json package-lock.json ./
COPY --from=build --chown=app:app /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
COPY --from=build /app/shared/catalog.json ./shared/catalog.json
COPY --from=build /app/shared/crossover-catalog.json ./shared/crossover-catalog.json
COPY --from=build /app/shared/crossover-portraits.json ./shared/crossover-portraits.json
USER app
EXPOSE 3010
CMD ["node", "dist-server/index.js"]
