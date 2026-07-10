#!/bin/sh
#
# Deploy the FunCoNN client: rebuild the production bundle from the latest main.
#
# Production is the local server (node src/server/index.js) serving dist/ from
# disk, so a client change is live as soon as dist/ is rebuilt -- no restart is
# needed for client-only changes. The KG-derived maps (wbbt-terms.json,
# cell-sexes.json, wormatlas-links.json, wbbt-labels.json, pharynx-cells.json,
# pharyngeal-cells.json, kg-connections.json) are compiled INTO the bundle, and
# `build-prod` bundles the *checked-out* tree, so the one rule that keeps deploys
# correct is: build from main, not a feature branch. This script enforces that.
#
# Those maps are generated from the KG; keep them current with
# `npm run refresh-kg` (scripts/refresh-kg-artifacts.sh) and commit before
# deploying. This script does a best-effort drift check below.
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

# Best-effort drift check: if the KG repo's exports are available locally, warn when a bundled
# map differs from the KG output (i.e. the KG changed but the maps weren't refreshed/committed).
# Advisory only -- deploys still build the committed tree.
KG_REPO=${KG_REPO:-"$ROOT/../celegans-connectome-kg"}
KG_OUT="$KG_REPO/outputs/neuron-graph"
if [ -d "$KG_OUT" ]; then
    drift=""
    for pair in \
        anatomy_terms.json:wbbt-terms.json \
        anatomy_labels.json:wbbt-labels.json \
        wormatlas_links.json:wormatlas-links.json \
        pharyngeal_cells.json:pharyngeal-cells.json \
        pharynx_cells.json:pharynx-cells.json \
        cell_sexes.json:cell-sexes.json \
        kg_connections.json:kg-connections.json; do
        src="$KG_OUT/${pair%%:*}"
        dst="src/client/js/${pair##*:}"
        if [ -f "$src" ] && ! cmp -s "$src" "$dst"; then
            drift="$drift ${pair##*:}"
        fi
    done
    if [ -n "$drift" ]; then
        echo ""
        echo "WARNING: bundled KG maps differ from the KG export:$drift"
        echo "         run 'npm run refresh-kg', commit, then redeploy to sync."
        echo ""
    fi
fi

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
