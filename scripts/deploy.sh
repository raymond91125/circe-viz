#!/bin/sh
#
# Deploy the FunCoNN client: rebuild the production bundle from the latest main.
#
# Production is the local server (node src/server/index.js) serving dist/ from
# disk, so a client change is live as soon as dist/ is rebuilt -- no restart is
# needed for client-only changes. The KG-derived link maps (wbbt-terms.json,
# cell-sexes.json, wormatlas-links.json, wbbt-labels.json) are compiled INTO the
# bundle, and `build-prod` bundles the *checked-out* tree, so the one rule that
# keeps deploys correct is: build from main, not a feature branch. This script
# enforces that.
#
# Usage: npm run deploy   (or: sh scripts/deploy.sh)

set -e

ROOT=$(git rev-parse --show-toplevel)
cd "$ROOT"

# build-prod bundles the working tree; refuse to build over uncommitted work.
if [ -n "$(git status --porcelain)" ]; then
    echo "ERROR: working tree has uncommitted changes -- commit or stash first." >&2
    git status --short >&2
    exit 1
fi

BEFORE=$(git rev-parse HEAD)

echo "==> Switching to main and pulling latest"
git checkout main
git pull --ff-only

AFTER=$(git rev-parse HEAD)

echo "==> Building production bundle (npm run build-prod)"
npm run build-prod

BUNDLE=$(grep -o 'nemanode\.[a-f0-9]*\.js' dist/index.html | head -1)
echo "==> Done. dist/ rebuilt from main (bundle: ${BUNDLE:-unknown})."
echo "    The local :3000 server serves dist/ from disk, so client changes are now live."

# Only server-code changes need the node process restarted.
if [ "$BEFORE" != "$AFTER" ] && ! git diff --quiet "$BEFORE" "$AFTER" -- src/server; then
    echo ""
    echo "NOTE: src/server/ changed since the last deploy -- restart the node server"
    echo "      for the backend change to take effect (client is already updated)."
fi
