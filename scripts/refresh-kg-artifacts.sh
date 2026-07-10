#!/bin/sh
#
# Refresh the KG-derived maps bundled into the FunCoNN client from the knowledge graph.
#
# These maps -- cell classes' WBbt anatomy terms/labels, WormAtlas links, cell sexes, the
# pharynx-database node set, WBbt "pharyngeal cell" set, and the full KG connectivity -- are
# COMPILED INTO the client bundle (see view/info.js, cell-info.js). So whenever the KG changes,
# they must be regenerated and committed, or the viz silently drifts from the KG. This script
# makes that one command instead of a manual per-file copy, which is how the committed maps went
# stale before (e.g. cell-sexes marking pharyngeal cells male-only after the pharynx data landed).
#
# It runs `cckg export` in the KG repo, then copies each generated map into src/client/js/ under
# the client's naming. Review the diff, commit, then `npm run deploy`.
#
# Usage:
#   sh scripts/refresh-kg-artifacts.sh                 # export from the KG repo, then copy
#   sh scripts/refresh-kg-artifacts.sh --no-export     # copy the KG repo's existing outputs only
#   KG_REPO=/path/to/celegans-connectome-kg sh scripts/refresh-kg-artifacts.sh
#
set -e

ng_root=$(cd "$(dirname "$0")/.." && pwd)
kg_repo=${KG_REPO:-"$ng_root/../celegans-connectome-kg"}
src_dir="$kg_repo/outputs/neuron-graph"
dst_dir="$ng_root/src/client/js"

# KG export filename : client bundle filename.
maps="
anatomy_terms.json:wbbt-terms.json
anatomy_labels.json:wbbt-labels.json
wormatlas_links.json:wormatlas-links.json
pharyngeal_cells.json:pharyngeal-cells.json
pharynx_cells.json:pharynx-cells.json
cell_sexes.json:cell-sexes.json
kg_connections.json:kg-connections.json
"

if [ ! -d "$kg_repo" ]; then
  echo "error: KG repo not found at $kg_repo" >&2
  echo "       set KG_REPO=/path/to/celegans-connectome-kg" >&2
  exit 1
fi

if [ "$1" != "--no-export" ]; then
  echo "==> Regenerating KG maps (cckg export in $kg_repo)"
  ( cd "$kg_repo" && uv run cckg export )
fi

echo "==> Syncing maps into $dst_dir"
changed=0
for pair in $maps; do
  src=${pair%%:*}
  dst=${pair##*:}
  if [ ! -f "$src_dir/$src" ]; then
    echo "error: missing KG output $src_dir/$src (run without --no-export to regenerate)" >&2
    exit 1
  fi
  if [ -f "$dst_dir/$dst" ] && cmp -s "$src_dir/$src" "$dst_dir/$dst"; then
    echo "    unchanged  $dst"
  else
    cp "$src_dir/$src" "$dst_dir/$dst"
    echo "    updated    $dst"
    changed=$((changed + 1))
  fi
done

echo "==> Done. $changed map(s) changed."
if [ "$changed" -gt 0 ]; then
  echo "    Review 'git diff', commit, then 'npm run deploy'."
fi
