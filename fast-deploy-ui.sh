#!/bin/bash
# Fast UI deploy: rebuild only the browser bundle and hot-copy into running container.
# Use this instead of a full Docker image rebuild when only changing UI files
# (packages/desktop-client or packages/component-library).
# Full image rebuild is still needed for loot-core server changes (sync.ts, migrations, etc).

set -e

cd "$(dirname "$0")"

export NVM_DIR="$HOME/.nvm"
source "$NVM_DIR/nvm.sh"

echo "==> Building loot-core browser bundle..."
yarn workspace loot-core build:browser

echo "==> Building desktop-client browser bundle..."
NODE_OPTIONS=--max_old_space_size=4096 yarn workspace @actual-app/web build:browser

echo "==> Copying build into running container..."
docker cp packages/desktop-client/build/. actual-budget:/app/node_modules/@actual-app/web/build/

echo "==> Done. Hard refresh your browser (Ctrl+Shift+R)."
