const $ = require('jquery');
const BaseView = require('./base-view');

const DataService = require('../data-service');
// Node-name -> WBbt anatomy term and -> WormAtlas page (from the connectome KG pipeline).
// Links are hidden when a target is unknown rather than rendered as a broken URL.
const WBBT_TERMS = require('../wbbt-terms.json');
const WORMATLAS_LINKS = require('../wormatlas-links.json');

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
    // other non-neuron categories have no mapped page). Hide when unknown.
    let atlas =
      WORMATLAS_LINKS[node] || WORMATLAS_LINKS[String(node).toUpperCase()];
    let $wormatlas = this.$container.find('a.wormatlas');
    if (atlas) {
      $wormatlas.attr('href', atlas).show();
    } else {
      $wormatlas.removeAttr('href').hide();
    }

    // Link to WormBase by WBbt anatomy term (from the connectome KG). Case-insensitive
    // since DataService.cellClass() casing varies; hide the link when there is no term
    // rather than producing a broken name-based URL.
    let wbbt = WBBT_TERMS[node] || WBBT_TERMS[String(node).toUpperCase()];
    let $wormbase = this.$container.find('a.wormbase');
    if (wbbt) {
      $wormbase
        .attr('href', 'https://www.wormbase.org/species/all/anatomy_term/' + wbbt)
        .show();
    } else {
      $wormbase.removeAttr('href').hide();
    }

    this.$container
      .find('span.cellname')
      .html(node);
  }
}

module.exports = InfoView;
