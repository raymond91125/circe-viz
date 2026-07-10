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
