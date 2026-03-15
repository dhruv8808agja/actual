FROM node:22-bookworm AS deps

RUN apt-get update && apt-get install -y openssl

WORKDIR /app

COPY .yarn ./.yarn
COPY yarn.lock package.json .yarnrc.yml tsconfig.json ./
COPY packages/api/package.json packages/api/package.json
COPY packages/auto-sync/package.json packages/auto-sync/package.json
COPY packages/component-library/package.json packages/component-library/package.json
COPY packages/crdt/package.json packages/crdt/package.json
COPY packages/desktop-client/package.json packages/desktop-client/package.json
COPY packages/desktop-electron/package.json packages/desktop-electron/package.json
COPY packages/eslint-plugin-actual/package.json packages/eslint-plugin-actual/package.json
COPY packages/loot-core/package.json packages/loot-core/package.json
COPY packages/sync-server/package.json packages/sync-server/package.json
COPY packages/plugins-service/package.json packages/plugins-service/package.json

COPY ./bin/package-browser ./bin/package-browser

RUN yarn install

FROM deps AS builder

WORKDIR /app

COPY packages/ ./packages/

ENV NODE_OPTIONS=--max_old_space_size=8192

RUN yarn build:api && yarn workspace @actual-app/auto-sync build

RUN yarn workspaces focus @actual-app/auto-sync --production

# Replace workspace symlink with real built package
RUN rm -rf ./node_modules/@actual-app/api
RUN cp -r ./packages/api ./node_modules/@actual-app/api

FROM node:22-bookworm-slim AS prod

RUN apt-get update && apt-get install -y tini && apt-get clean -y && rm -rf /var/lib/apt/lists/*

ARG USERNAME=actual
ARG USER_UID=1001
ARG USER_GID=$USER_UID
RUN groupadd --gid $USER_GID $USERNAME \
    && useradd --uid $USER_UID --gid $USER_GID -m $USERNAME \
    && mkdir /data && chown -R ${USERNAME}:${USERNAME} /data

WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/packages/auto-sync/build ./build

USER $USERNAME

ENTRYPOINT ["/usr/bin/tini", "-g", "--"]
CMD ["node", "build/index.js"]
