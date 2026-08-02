const $ = require('jquery');
const BaseView = require('./base-view');

const DataService = require('../data-service');
// Node-name -> WBbt anatomy term and -> WormAtlas page (from the connectome KG pipeline).
// Links are hidden when a target is unknown rather than rendered as a broken URL.
const WBBT_TERMS = require('../wbbt-terms.json');
// WBbt term id -> human-readable label (e.g. "WBbt:0003638" -> "MC neuron"), from the KG.
const WBBT_LABELS = require('../wbbt-labels.json');
const WORMATLAS_LINKS = require('../wormatlas-links.json');
// Upper-cased pharyngeal cell names + classes (WBbt is_a "pharyngeal cell"), from the KG. Used to
// show location "Pharynx": NemaNode's inhead/intail flags are head/tail *ganglia* membership, which
// excludes the pharyngeal nervous system, so pharyngeal cells otherwise show a misleading "Body".
const PHARYNGEAL_CELLS = new Set(require('../pharyngeal-cells.json'));
// Full class-level connectivity from the KG (every dataset, no weight threshold), for the
// "All connections in knowledge graph" section. The viz graph only draws connections for the
// current database at/above its threshold, so this reveals weak edges (e.g. M5->g2R, weight 1,
// below the default chemical threshold of 3) and edges from KG datasets not in the viz DB. Shape:
//   {datasets: [id...], conn: {class: {rel: {partner: {datasetCode: weight}}}}}
// rel: o/i = chemical out/in, e = gap junction (symmetric), fo/fi = functional out/in,
// npo/npi = predicted neuropeptide out/in.
//
// It's the largest bundled map (~0.8 MB, incl. the predicted neuropeptide network), and only
// needed once the info panel opens, so it's split into its own chunk and lazy-loaded on first
// cell selection (instant on subsequent ones) -- keeping it out of the initial page bundle.
let KG_CONNECTIONS = null;
let kgConnectionsLoading = null;
function loadKgConnections() {
  if (KG_CONNECTIONS) { return Promise.resolve(KG_CONNECTIONS); }
  if (!kgConnectionsLoading) {
    kgConnectionsLoading = import(
      /* webpackChunkName: "kg-connections" */ '../kg-connections.json'
    ).then(mod => {
      KG_CONNECTIONS = mod.default || mod;
      return KG_CONNECTIONS;
    });
  }
  return kgConnectionsLoading;
}

// Which NPP-GPCR pairs mediate each predicted neuropeptide edge (Ripoll-Sánchez 2023 mechanistic
// layer). Shape: {pairs: [[ligand, gpcr, ec50_nm, gpcr_class], ...], conn: {SRC: {TGT: [pairIdx]}}}
// keyed by upper-cased class. Its own lazy chunk, loaded on first cell selection alongside the KG
// connectivity map, so the peptide→receptor pairs behind an edge can be shown in the info panel.
let NP_PAIRS = null;
let npPairsLoading = null;
function loadNpPairs() {
  if (NP_PAIRS) { return Promise.resolve(NP_PAIRS); }
  if (!npPairsLoading) {
    npPairsLoading = import(/* webpackChunkName: "np-pairs" */ '../np-pairs.json')
      .then(mod => { NP_PAIRS = mod.default || mod; return NP_PAIRS; })
      .catch(() => { NP_PAIRS = { pairs: [], conn: {} }; return NP_PAIRS; });
  }
  return npPairsLoading;
}

// The mediating pairs for a directed class edge source→target, as "ligand→gpcr" strings (with EC50
// in the hover title). Returns [] when the map isn't loaded or the edge has no attribution.
function npPairsFor(source, target) {
  if (!NP_PAIRS) { return []; }
  let idxs = ((NP_PAIRS.conn[String(source).toUpperCase()] || {})[
    String(target).toUpperCase()
  ]) || [];
  return idxs.map(i => NP_PAIRS.pairs[i]).filter(Boolean);
}

// Which monoamine→receptor pairs mediate each predicted monoaminergic edge (Ripoll-Sánchez 2023
// mechanistic layer, reconstructed + validated against the published weights). Shape:
// {pairs: [[monoamine, receptor], ...], conn: {SRC: {TGT: [pairIdx]}}} keyed by upper-cased class.
// Own lazy chunk, loaded alongside the KG map so the monoamine→receptor pairs behind a monoamine
// edge can be shown in the info panel. Mirrors NP_PAIRS.
let MA_PAIRS = null;
let maPairsLoading = null;
function loadMaPairs() {
  if (MA_PAIRS) { return Promise.resolve(MA_PAIRS); }
  if (!maPairsLoading) {
    maPairsLoading = import(/* webpackChunkName: "ma-pairs" */ '../ma-pairs.json')
      .then(mod => { MA_PAIRS = mod.default || mod; return MA_PAIRS; })
      .catch(() => { MA_PAIRS = { pairs: [], conn: {} }; return MA_PAIRS; });
  }
  return maPairsLoading;
}

// The mediating pairs for a directed class edge source→target, as [monoamine, receptor] tuples.
// Returns [] when the map isn't loaded or the edge has no attribution.
function maPairsFor(source, target) {
  if (!MA_PAIRS) { return []; }
  let idxs = ((MA_PAIRS.conn[String(source).toUpperCase()] || {})[
    String(target).toUpperCase()
  ]) || [];
  return idxs.map(i => MA_PAIRS.pairs[i]).filter(Boolean);
}

// Short human labels for KG dataset ids; unknown ids fall back to a prettified form.
/* eslint-disable camelcase */
const KG_DATASET_LABELS = {
  cook_2019_hermaphrodite: 'Cook 2019 (hermaphrodite)',
  cook_2019_male: 'Cook 2019 (male)',
  cook_2020_pharynx: 'Cook 2020 (pharynx)',
  randi_funconn_unc31: 'Randi 2023 (unc-31)',
  randi_funconn_wildty: 'Randi 2023 (wild-type)',
  white_1986_jse: 'White 1986 (JSE)',
  white_1986_jsh: 'White 1986 (JSH)',
  white_1986_n2u: 'White 1986 (N2U)',
  white_1986_whole: 'White 1986 (whole)',
  witvliet_2020_1: 'Witvliet 2020 (dataset 1)',
  witvliet_2020_2: 'Witvliet 2020 (dataset 2)',
  witvliet_2020_3: 'Witvliet 2020 (dataset 3)',
  witvliet_2020_4: 'Witvliet 2020 (dataset 4)',
  witvliet_2020_5: 'Witvliet 2020 (dataset 5)',
  witvliet_2020_6: 'Witvliet 2020 (dataset 6)',
  witvliet_2020_7: 'Witvliet 2020 (dataset 7)',
  witvliet_2020_8: 'Witvliet 2020 (dataset 8)',
  ripoll_2023_neuropeptide_sr: 'Ripoll-Sánchez 2023 (NP short-range)',
  ripoll_2023_neuropeptide_mr: 'Ripoll-Sánchez 2023 (NP mid-range)',
  ripoll_2023_neuropeptide_lr: 'Ripoll-Sánchez 2023 (NP long-range)',
  ripoll_2023_monoamine: 'Ripoll-Sánchez 2023 (monoamine)'
};
/* eslint-enable camelcase */

const kgDatasetLabel = id =>
  KG_DATASET_LABELS[id] ||
  id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

// Relation code -> display heading. Order defines the rendered section order.
const KG_RELATIONS = [
  ['o', 'Chemical output'],
  ['i', 'Chemical input'],
  ['e', 'Gap junctions'],
  ['fo', 'Functional output'],
  ['fi', 'Functional input'],
  ['npo', 'Neuropeptide output (predicted)'],
  ['npi', 'Neuropeptide input (predicted)'],
  ['mao', 'Monoamine output (predicted)'],
  ['mai', 'Monoamine input (predicted)']
];

// Relation code -> [connection type, direction] for the CSV export columns.
const KG_REL_META = {
  o: ['chemical', 'outgoing'],
  i: ['chemical', 'incoming'],
  e: ['gap junction', 'undirected'],
  fo: ['functional', 'outgoing'],
  fi: ['functional', 'incoming'],
  npo: ['neuropeptidergic (predicted)', 'outgoing'],
  npi: ['neuropeptidergic (predicted)', 'incoming'],
  mao: ['monoaminergic (predicted)', 'outgoing'],
  mai: ['monoaminergic (predicted)', 'incoming']
};

// Quote a CSV field only when it contains a comma, quote, or newline (RFC 4180).
const csvField = value => {
  let s = String(value);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

// Trigger a client-side file download from in-memory text (no server round-trip needed --
// the KG connectivity is already bundled).
const downloadTextFile = (filename, text, mime) => {
  let blob = new Blob([text], { type: `${mime};charset=utf-8;` });
  let url = URL.createObjectURL(blob);
  let a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

class InfoView extends BaseView {
  constructor(model) {
    super();

    this.model = model;

    this.$container = $('#infobar-container');
    this.$toggle = $('#infobar-toggle');

    this.$welcome = $('#welcome');
    this.$welcomeTitle = this.$welcome.find('h1');
    this.$welcomeBody = this.$welcome.find('.body');

    // CSS transitions cancels out jQuery fade, so separate div is required.
    this.$toggle.click(() => {
      if (this.$container.hasClass('open')) {
        this.close();
      } else {
        this.open();
      }
    });

    $('#infobar-container > div').on(
      'transitionend webkitTransitionEnd oTransitionEnd',
      () => {
        this.emit('transitionEnd');
      }
    );

    model.on('selectedChanged', selected => {
      if (selected.length > 0) {
        this.show();
        this.updateContent(selected);
      } else {
        this.hide();
      }
    });

    // Download the currently-shown class's full KG connectivity as CSV.
    this.$container.on('click', '.kg-download', e => {
      e.preventDefault();
      this.downloadKgConnections();
    });
    // The cell-info ".open-welcome" link is handled in HelpView, which routes it
    // through the welcome controller so the popup is populated and positioned.
  }

  show() {
    this.$container.stop();
    this.$container.fadeIn(200);
    this.$welcome.fadeOut(200);
  }

  hide() {
    this.$container.stop();
    this.$container.fadeOut(200);
  }

  open() {
    this.$container.addClass('open');
  }

  close() {
    this.$container.removeClass('open');
  }

  getBoundingBox() {
    let { top, left } = this.$container.offset();

    return {
      x1: left,
      x2: left + this.$container.width(),
      y1: top,
      y2: top + this.$container.height()
    };
  }

  updateContent(selected) {
    let node = DataService.cellClass(selected[0]);

    // Link to WormAtlas (neuron pages by class; body wall muscle -> somatic-muscle page;
    // other non-neuron categories have no mapped page). Hide the whole line when unknown.
    let atlas =
      WORMATLAS_LINKS[node] || WORMATLAS_LINKS[String(node).toUpperCase()];
    if (atlas) {
      this.$container.find('a.wormatlas').attr('href', atlas);
      this.$container.find('.wormatlas-line').show();
    } else {
      this.$container.find('.wormatlas-line').hide();
    }

    // WBbt anatomy term (from the connectome KG) for the summary's Anatomy row, which links
    // to WormBase. Case-insensitive since DataService.cellClass() casing varies; omitted from
    // the summary when there is no term rather than producing a broken name-based URL.
    let wbbt = WBBT_TERMS[node] || WBBT_TERMS[String(node).toUpperCase()];

    this.$container
      .find('span.cellname')
      .html(node);

    this.renderSummary(node, wbbt);
    this.renderKgConnections(node);
  }

  // Case-insensitive lookup of a node's class entry in the KG connectivity map (KG class names
  // keep natural case, e.g. "g2"; the viz node casing varies).
  kgConnLookup(node) {
    let conn = KG_CONNECTIONS.conn;
    if (conn[node]) { return conn[node]; }
    if (!this._kgUpperIndex) {
      this._kgUpperIndex = {};
      for (let cls in conn) { this._kgUpperIndex[cls.toUpperCase()] = conn[cls]; }
    }
    return this._kgUpperIndex[String(node).toUpperCase()];
  }

  // "All connections in knowledge graph": the cell class's complete connectivity from the KG —
  // every dataset, no weight threshold — so partners the graph doesn't draw (below-threshold or
  // from a KG-only dataset) are still visible. Partners group by relation; hover shows datasets +
  // weights. The map is lazy-loaded (its own chunk), so this fills in asynchronously on the first
  // cell selection; a token guards against a later selection resolving out of order.
  renderKgConnections(node) {
    let $box = this.$container.find('.kg-connections');
    $box.empty().hide();
    this._kgConnNode = node;
    Promise.all([loadKgConnections(), loadNpPairs(), loadMaPairs()]).then(() => {
      if (this._kgConnNode === node) { this.fillKgConnections($box, node); }
    });
  }

  fillKgConnections($box, node) {
    let entry = this.kgConnLookup(node);
    if (!entry) { $box.empty().hide(); return; }

    let datasets = KG_CONNECTIONS.datasets;
    let groups = [];
    KG_RELATIONS.forEach(([rel, heading]) => {
      let partners = entry[rel];
      if (!partners) { return; }
      // For the predicted-neuropeptide relations, resolve which NPP→GPCR pairs mediate each edge:
      // npo = node→partner (node is the ligand source), npi = partner→node.
      let isNp = rel === 'npo' || rel === 'npi';
      // For the predicted-monoamine relations, likewise resolve the mediating monoamine→receptor
      // pairs: mao = node→partner (node produces the monoamine), mai = partner→node.
      let isMa = rel === 'mao' || rel === 'mai';
      let names = Object.keys(partners).sort();
      let items = names
        .map(p => {
          let byDs = partners[p];
          let detail = Object.keys(byDs)
            .map(code => `${kgDatasetLabel(datasets[Number(code)])}: ${byDs[code]}`)
            .join('\n');
          let suffix = '';
          if (isNp) {
            let pairs = rel === 'npo' ? npPairsFor(node, p) : npPairsFor(p, node);
            if (pairs.length) {
              detail +=
                '\nPairs (ligand → receptor):\n' +
                pairs
                  .map(pr => `  ${pr[0]} → ${pr[1]}${pr[2] ? ` (EC50 ${pr[2]} nM)` : ''}`)
                  .join('\n');
              suffix = ` <span class="kg-npcount">${pairs.length}</span>`;
            }
          } else if (isMa) {
            let pairs = rel === 'mao' ? maPairsFor(node, p) : maPairsFor(p, node);
            if (pairs.length) {
              detail +=
                '\nPairs (monoamine → receptor):\n' +
                pairs.map(pr => `  ${pr[0]} → ${pr[1]}`).join('\n');
              suffix = ` <span class="kg-npcount">${pairs.length}</span>`;
            }
          }
          return `<span class="kg-partner" title="${detail}">${p}${suffix}</span>`;
        })
        .join('');
      groups.push(
        `<div class="kg-rel"><span class="kg-rel-label">${heading} (${names.length})</span>` +
          `<span class="kg-partners">${items}</span></div>`
      );
    });

    if (!groups.length) { $box.empty().hide(); return; }
    $box
      .html(
        '<div class="kg-title">All connections in knowledge graph' +
          '<a class="kg-download" href="#" title="Download every connection listed here ' +
          '(all datasets, per dataset and weight) as CSV">Download CSV</a></div>' +
          '<div class="kg-note">All partners across every dataset in the knowledge graph, ' +
          'unfiltered by this view\'s threshold. Hover a partner for datasets and weights; for ' +
          'predicted neuropeptide or monoamine partners the badge is the number of mediating ' +
          'receptor pairs and the hover lists them (ligand/monoamine → receptor).</div>' +
          groups.join('')
      )
      .show();
  }

  // Flatten the shown class's KG connectivity into CSV rows: one row per
  // (partner, connection type, direction, dataset) with its weight.
  buildKgCsvRows(node, entry) {
    let datasets = KG_CONNECTIONS.datasets;
    let rows = [['reference', 'partner', 'type', 'direction', 'dataset', 'weight']];
    KG_RELATIONS.forEach(([rel]) => {
      let partners = entry[rel];
      if (!partners) { return; }
      let [type, direction] = KG_REL_META[rel];
      Object.keys(partners)
        .sort()
        .forEach(partner => {
          let byDs = partners[partner];
          Object.keys(byDs).forEach(code => {
            rows.push([node, partner, type, direction, datasets[Number(code)], byDs[code]]);
          });
        });
    });
    return rows;
  }

  downloadKgConnections() {
    let node = this._kgConnNode;
    if (!node || !KG_CONNECTIONS) { return; }
    let entry = this.kgConnLookup(node);
    if (!entry) { return; }
    // Provenance comment lines (# prefix) above the CSV header, noting the source and that the
    // list spans every KG dataset and is NOT filtered by the visualization's thresholds.
    let header = [
      `# All connections for ${node} in the C. elegans connectome knowledge graph`,
      '# Source: CIRCE (Connectome Integration & Reasoning for C. Elegans) knowledge graph',
      '# Every KG dataset; NOT filtered by this visualization\'s connection thresholds',
      `# Downloaded: ${new Date().toISOString().slice(0, 10)}`
    ].join('\n');
    let csv = this.buildKgCsvRows(node, entry)
      .map(row => row.map(csvField).join(','))
      .join('\n');
    let safeName = String(node).replace(/[^A-Za-z0-9._-]/g, '_');
    downloadTextFile(`${safeName}_kg_connections.csv`, `${header}\n${csv}`, 'text/csv');
  }

  // Summary of what the database knows about the cell (group): type, neurotransmitter(s),
  // birth, location, class members, and the grounded WBbt anatomy term. Rows with no data
  // are omitted. All facts come from DataService (already loaded from /api/cells) plus the
  // KG-derived WBbt term/label maps.
  renderSummary(node, wbbt) {
    let rows = [];
    let addRow = (key, value) => {
      if (value) { rows.push(`<dt>${key}</dt><dd>${value}</dd>`); }
    };

    let type = DataService.typ(node);
    if (type !== undefined && type !== null) {
      addRow('Type', DataService.getTypeDisplayNames(type));
    }

    let nt = DataService.nt(node);
    if (nt) {
      addRow('Neurotransmitter', DataService.getNeurotransmitterDisplayNames(nt));
    }

    let emb = DataService.isEmb(node);
    if (emb !== undefined) {
      addRow('Birth', emb ? 'Embryonic' : 'Post-embryonic');
    }

    let locations = [];
    if (PHARYNGEAL_CELLS.has(String(node).toUpperCase())) { locations.push('Pharynx'); }
    if (DataService.exists(node, 'head')) { locations.push('Head ganglia'); }
    if (DataService.exists(node, 'tail')) { locations.push('Tail ganglia'); }
    if (!locations.length && DataService.exists(node, 'complete')) {
      locations.push('Body');
    }
    addRow('Location', locations.join(', '));

    let members = DataService.classMembers(node) || [];
    if (members.length > 1) {
      addRow(
        'Members',
        members.map(m => DataService.getDisplayName(m)).join(', ')
      );
    }

    if (wbbt) {
      let label = WBBT_LABELS[wbbt];
      let idLink =
        `<a href="https://www.wormbase.org/species/all/anatomy_term/${wbbt}"` +
        ` target="_blank">${wbbt}</a>`;
      addRow('Anatomy', label ? `${label} (${idLink})` : idLink);
    }

    this.$container.find('.cell-summary').html(rows.join(''));
  }
}

module.exports = InfoView;
