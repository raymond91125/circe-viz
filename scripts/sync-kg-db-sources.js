#!/usr/bin/env node
//
// Regenerate the server DB's KG-derived raw-data inputs from the knowledge graph, so
// `npm run populate-database` reproduces the full connectome DB (hermaphrodite + male +
// pharynx) instead of the stale hermaphrodite-only seed.
//
// The KG (circe) projects these neuron-graph databases:
//   outputs/neuron-graph/        hermaphrodite cells + connections (authoritative cell metadata)
//   outputs/neuron-graph-male/   cook_2019_male  cells + connections + dataset
//   outputs/neuron-graph-pharynx/cook_2020_pharynx cells + connections + dataset
//   outputs/neuron-graph-dauer/  yim_2024_dauer  cells + connections + dataset (a "head" life stage)
//
// This writes, into src/server/populate-db/raw-data/:
//   neurons.json                 union of all projections' cells (raw-data cell schema)
//   connections/cook_2019_male.json, cook_2020_pharynx.json, yim_2024_dauer.json (raw-data schema)
//   datasets.json                existing hermaphrodite datasets + KG-derived Cook/dauer entries
//
// Hermaphrodite CONNECTIONS stay in their committed raw-data/connections/*.json (they carry the
// viz's own randi_funconn_wildcp "complete"-collection labelling, which the KG intentionally drops).
// Only cells, the two Cook connection files, and the Cook dataset entries are KG-derived here.
//
// Usage:  KG_REPO=/path/to/circe node scripts/sync-kg-db-sources.js   (default KG_REPO=../circe)

const fs = require('fs');
const path = require('path');

const NG_ROOT = path.resolve(__dirname, '..');
const KG_REPO = process.env.KG_REPO || path.resolve(NG_ROOT, '../circe');
const KG_OUT = path.join(KG_REPO, 'outputs');
const RAW = path.join(NG_ROOT, 'src/server/populate-db/raw-data');

const readJson = p => JSON.parse(fs.readFileSync(p, 'utf-8'));
const need = p => {
  if (!fs.existsSync(p)) {
    console.error(`error: missing KG output ${p}\n       run \`cckg export\` in ${KG_REPO}`);
    process.exit(1);
  }
  return p;
};

// KG cell (/api/cells schema) -> raw-data cell schema read by populate-cells.js.
const toRawCell = c => ({
  name: c.name,
  classes: c.class,
  nt: c.neurotransmitter,
  typ: c.type,
  emb: c.embryonic,
  inhead: c.inhead,
  intail: c.intail
});

// api connection-type string -> the numeric `typ` code populate-connections.js switches on.
const TYP_CODE = { chemical: 0, electrical: 2, functional: 4, neuropeptidergic: 5 };

// KG connection (/api/connections aggregated shape: synapses={datasetId: weight}) -> the raw-data
// connection shape. populate-connections uses syn.length as the (chemical/electrical) synapse
// count, so we materialise a length-`weight` array; no per-synapse ids (no synapse-table rows,
// matching how the Cook datasets were loaded).
const toRawConnection = (conn, datasetId) => {
  const weight = conn.synapses[datasetId] || 0;
  return {
    datasetId,
    pre: conn.pre,
    post: conn.post,
    typ: TYP_CODE[conn.type],
    syn: Array.from({ length: weight }, () => 1)
  };
};

// --- Cells: union ng + male + pharynx + dauer (first occurrence wins; shared cells identical) ----
const ngCells = readJson(need(path.join(KG_OUT, 'neuron-graph/cells.json')));
const maleCells = readJson(need(path.join(KG_OUT, 'neuron-graph-male/cells.json')));
const pharynxCells = readJson(need(path.join(KG_OUT, 'neuron-graph-pharynx/cells.json')));
const dauerCells = readJson(need(path.join(KG_OUT, 'neuron-graph-dauer/cells.json')));

const byName = new Map();
for (const c of [...ngCells, ...maleCells, ...pharynxCells, ...dauerCells]) {
  if (!byName.has(c.name)) byName.set(c.name, toRawCell(c));
}
const neurons = [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
fs.writeFileSync(path.join(RAW, 'neurons.json'), JSON.stringify(neurons, null, 2) + '\n');
console.log(`neurons.json: ${neurons.length} cells (ng ${ngCells.length} + male/pharynx-specific)`);

// --- KG-projected connection files (raw-data schema): male, pharynx, dauer ----------------------
const cookConnFiles = [
  ['neuron-graph-male/connections.json', 'cook_2019_male'],
  ['neuron-graph-pharynx/connections.json', 'cook_2020_pharynx'],
  ['neuron-graph-dauer/connections.json', 'yim_2024_dauer']
];
for (const [rel, datasetId] of cookConnFiles) {
  const conns = readJson(need(path.join(KG_OUT, rel)));
  const raw = conns.map(c => toRawConnection(c, datasetId));
  const out = path.join(RAW, 'connections', `${datasetId}.json`);
  fs.writeFileSync(out, JSON.stringify(raw, null, 2) + '\n');
  console.log(`connections/${datasetId}.json: ${raw.length} connections`);
}

// --- Neuropeptide (Ripoll-Sánchez 2023) predicted network: one raw-data file per range model ----
// The projection bundles all three range models in one connections.json (synapses keyed by the
// short viz dataset id). Split per dataset, keeping only edges present (weight > 0) in that model.
const npDatasets = readJson(need(path.join(KG_OUT, 'neuron-graph-neuropeptide/datasets.json')));
const npConns = readJson(need(path.join(KG_OUT, 'neuron-graph-neuropeptide/connections.json')));
for (const ds of npDatasets) {
  const raw = npConns
    .filter(c => (c.synapses[ds.id] || 0) > 0)
    .map(c => toRawConnection(c, ds.id));
  const out = path.join(RAW, 'connections', `${ds.id}.json`);
  // The predicted network has ~30-54k edges per range model; write compact (no indent) to keep
  // these generated seed files from bloating the repo (they regenerate wholesale, so a readable
  // diff has no value here anyway).
  fs.writeFileSync(out, JSON.stringify(raw) + '\n');
  console.log(`connections/${ds.id}.json: ${raw.length} neuropeptide connections`);
}

// --- Viz-only 'Pharynx + inferred muscle coupling' dataset --------------------------------------
// cook_2020_pharynx records no muscle/marginal gap junctions (SI3, observed only). This viz-only
// dataset unions the observed pharynx with the pharyngeal muscle/marginal gap junctions from Cook
// 2019 (electrical coupling per Albertson & Thomson 1976). The pharynx is not sexually dimorphic,
// so these gaps are taken from the male projection (identical to the hermaphrodite). NOT part of
// the observed KG -- it lives only in the viz so the known muscle coupling can be visualised.
const COUPLED = 'pharynx_coupled'; // dataset id (datasets.id is varchar(20))
const isPmMc = n => n.startsWith('pm') || n.startsWith('mc');
const arr = w => Array.from({ length: w }, () => 1);
const pharynxConns = readJson(need(path.join(KG_OUT, 'neuron-graph-pharynx/connections.json')));
const maleConns = readJson(need(path.join(KG_OUT, 'neuron-graph-male/connections.json')));
const coupled = pharynxConns.map(c => ({
  datasetId: COUPLED, pre: c.pre, post: c.post, typ: TYP_CODE[c.type],
  syn: arr(c.synapses['cook_2020_pharynx'] || 0)
}));
let nGap = 0;
for (const c of maleConns) {
  if (c.type !== 'electrical' || !isPmMc(c.pre) || !isPmMc(c.post)) continue;
  coupled.push({ datasetId: COUPLED, pre: c.pre, post: c.post, typ: 2,
    syn: arr(c.synapses['cook_2019_male'] || 0) });
  nGap++;
}
fs.writeFileSync(path.join(RAW, 'connections', `${COUPLED}.json`), JSON.stringify(coupled, null, 2) + '\n');
console.log(`connections/${COUPLED}.json: ${coupled.length} connections (+${nGap} muscle/marginal gaps)`);

// --- Datasets: committed hermaphrodite entries + KG-derived Cook/dauer entries + coupled ---------
// Strip the KG-derived ids from the committed baseline so re-runs don't double-count them.
const datasetsPath = path.join(RAW, 'datasets.json');
const existing = readJson(datasetsPath).filter(
  d =>
    !d.id.startsWith('cook_') &&
    !d.id.startsWith('yim_') &&
    !d.id.startsWith('ripoll_') &&
    d.id !== COUPLED
);
const maleDs = readJson(need(path.join(KG_OUT, 'neuron-graph-male/datasets.json')));
const pharynxDs = readJson(need(path.join(KG_OUT, 'neuron-graph-pharynx/datasets.json')));
const dauerDs = readJson(need(path.join(KG_OUT, 'neuron-graph-dauer/datasets.json')));
const coupledDs = {
  id: COUPLED, type: 'pharynxCoupled', name: 'Pharynx (2020) + GJ (1976)',
  time: 50, visualTime: 50, datatypes: 'cs,gj',
  description: 'Observed Cook 2020 pharyngeal connectome plus the pharyngeal muscle/marginal '
    + 'gap junctions from Cook 2019 (electrical coupling, Albertson & Thomson 1976). '
    + 'Visualization only - not part of the observed knowledge graph.'
};
const datasets = [...existing, ...maleDs, ...pharynxDs, ...dauerDs, coupledDs, ...npDatasets];
fs.writeFileSync(datasetsPath, JSON.stringify(datasets, null, 2) + '\n');
console.log(
  `datasets.json: ${datasets.length} datasets ` +
    `(+${maleDs.length + pharynxDs.length} Cook, +${dauerDs.length} dauer, ` +
    `+${npDatasets.length} neuropeptide)`
);
