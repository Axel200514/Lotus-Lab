import { showToast, copyToClipboard } from "../../../shared/utils/ui.utils.js?v=5.1";
import { PinCardComponent } from "../pin-card/pin-card.component.js?v=5.1";

export class PinListComponent {
  constructor(container, template, savedService, callbacks = {}) {
    this.container = container;
    this.template = template;
    this.savedService = savedService;
    this.callbacks = callbacks;
    this.cardComponent = new PinCardComponent(this.template);
    this.columns = [];
    this.columnHeights = [];
    this.renderedPins = [];
    this.thresholdObserver = null;
    this.initColumns();
  }

  getOptimalColumnCount() {
    const width = window.innerWidth;
    if (width < 640) return 2;
    if (width < 900) return 3;
    if (width < 1200) return 4;
    if (width < 1600) return 5;
    return 6;
  }

  initColumns() {
    this.container.textContent = "";
    const colCount = this.getOptimalColumnCount();
    this.columns = [];
    this.columnHeights = new Array(colCount).fill(0);

    for (let i = 0; i < colCount; i++) {
      const col = document.createElement("div");
      col.className = `pins-col pins-col-${i}`;
      this.container.appendChild(col);
      this.columns.push(col);
    }
  }

  clear() {
    if (this.thresholdObserver) {
      this.thresholdObserver.disconnect();
      this.thresholdObserver = null;
    }
    this.initColumns();
    this.renderedPins = [];
  }

  destroy() {
    if (this.thresholdObserver) {
      this.thresholdObserver.disconnect();
      this.thresholdObserver = null;
    }
  }

  removePin(pinId) {
    if (!pinId) return;
    this.renderedPins = this.renderedPins.filter((p) => p.id !== pinId);
    const card = this.container.querySelector(`.pin-card[data-id="${pinId}"]`);
    if (card) {
      card.remove();
    }
  }

  handleResize() {
    const needed = this.getOptimalColumnCount();
    if (needed !== this.columns.length) {
      const pinsToReRender = [...this.renderedPins];
      this.clear();
      this.renderPins(pinsToReRender);
    }
  }

  setupThresholdObserver() {
    if (this.thresholdObserver) {
      this.thresholdObserver.disconnect();
      this.thresholdObserver = null;
    }

    if (typeof this.callbacks.onThresholdReach !== "function") return;
    if (this.renderedPins.length === 0) return;

    const targetIndex = this.renderedPins.length >= 15
      ? this.renderedPins.length - 10
      : -1;

    if (targetIndex < 0) return;

    const targetPin = this.renderedPins[targetIndex];
    if (!targetPin || !targetPin.id) return;

    const targetCard = this.container.querySelector(`.pin-card[data-id="${targetPin.id}"]`);
    if (!targetCard) return;

    if (!("IntersectionObserver" in window)) return;

    this.thresholdObserver = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry && entry.isIntersecting) {
          if (this.thresholdObserver) {
            this.thresholdObserver.disconnect();
            this.thresholdObserver = null;
          }
          this.callbacks.onThresholdReach();
        }
      },
      {
        rootMargin: "0px"
      }
    );

    this.thresholdObserver.observe(targetCard);
  }

  renderPins(pins = []) {
    if (!Array.isArray(pins) || pins.length === 0) return;

    if (this.columns.length === 0) {
      this.initColumns();
    }

    const colFragments = this.columns.map(() => document.createDocumentFragment());

    pins.forEach((pin) => {
      if (!pin || !pin.id) return;
      if (this.renderedPins.some((p) => p.id === pin.id || (p.artworkKey && p.artworkKey === pin.artworkKey))) return;

      this.renderedPins.push(pin);
      const isSaved = this.savedService.isSaved(pin.id);
      const cardNode = this.cardComponent.render(pin, isSaved, {
        onClick: this.callbacks.onPinClick,
        onToggleSave: (p) => this.savedService.toggleSave(p),
        onShare: async (p) => {
          const shareUrl = `${window.location.origin}${window.location.pathname}#pin=${encodeURIComponent(p.id)}`;
          if (navigator.share && window.isSecureContext) {
            try {
              await navigator.share({
                title: p.title || "Lotus Anime Art",
                text: `Check out "${p.title}" on Lotus`,
                url: shareUrl
              });
              showToast("Link shared!");
              return;
            } catch (err) {
              if (err.name === "AbortError") return;
            }
          }
          await copyToClipboard(shareUrl);
          showToast("Link copied to clipboard!");
        }
      });

      let shortest = 0;
      for (let i = 1; i < this.columns.length; i++) {
        if (this.columnHeights[i] < this.columnHeights[shortest]) {
          shortest = i;
        }
      }

      colFragments[shortest].appendChild(cardNode);
      const ratio = pin.height && pin.width ? pin.height / pin.width : 1.33;
      this.columnHeights[shortest] += ratio;
    });

    this.columns.forEach((col, idx) => {
      col.appendChild(colFragments[idx]);
    });

    this.setupThresholdObserver();
  }
}
