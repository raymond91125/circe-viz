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
// rel: o/i = chemical out/in, e = gap junction (symmetric), fo/fi = functional out/in.
//
// It's the largest bundled map (~368 KB), and only needed once the info panel opens, so it's
// split into its own chunk and lazy-loaded on first cell selection (instant on subsequent ones)
// -- keeping it out of the initial page bundle.
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

// Short human labels for KG dataset ids; unknown ids fall back to a prettified form.
/* eslint-disable camelcase */
const KG_DATASET_LABELS = {
  cook_2019_hermaphrodite: 'Cook 2019 (hermaphrodite)',
  cook_2019_male: 'Cook 2019 (male)',
  cook_2020_pharynx: 'Cook 2020 (pharynx)',
  randi_funconn_unc31: 'Randi 2023 (unc-31)',
  randi_funconn_wildcp: 'Randi 2023 (wild-type, control)',
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
  witvliet_2020_8: 'Witvliet 2020 (dataset 8)'
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
  ['fi', 'Functional input']
];

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

    // Clicking a partner chip in the "All connections in knowledge graph" list adds that
    // cell/class to the graph (routed to the searchbar input pipeline by the controller).
    this.$container.on('click', '.kg-partner', e => {
      let name = $(e.currentTarget).attr('data-cell');
      if (name) {
        this.emit('addCell', name);
      }
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
    loadKgConnections().then(() => {
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
      let names = Object.keys(partners).sort();
      let items = names
        .map(p => {
          let byDs = partners[p];
          let detail = Object.keys(byDs)
            .map(code => `${kgDatasetLabel(datasets[Number(code)])}: ${byDs[code]}`)
            .join('\n');
          return `<span class="kg-partner" data-cell="${p}" title="${detail}">${p}</span>`;
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
        '<div class="kg-title">All connections in knowledge graph</div>' +
          '<div class="kg-note">All partners across every dataset in the knowledge graph, ' +
          'unfiltered by this view\'s threshold. Click a partner to add it to the graph; ' +
          'hover for datasets and weights.</div>' +
          groups.join('')
      )
      .show();
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
