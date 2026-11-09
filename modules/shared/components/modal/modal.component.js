import { showToast, copyToClipboard } from "../../utils/ui.utils.js?v=4.1";
import { StorageUtils } from "../../utils/storage.utils.js?v=4.1";
import { API_CONFIG } from "../../../../app/app.config.js?v=4.1";

export class ModalComponent {
  constructor(onTagClick, onToggleSave, fetchRelatedPins) {
    this.onTagClick = onTagClick;
    this.onToggleSave = onToggleSave;
    this.fetchRelatedPins = fetchRelatedPins;
    this.activePin = null;
    this.isOpen = false;
    this.savedScrollY = 0;
    this.previousHash = "";
    this.seenPinIds = new Set();
    this.renderedRelatedIds = new Set();
    this.relatedCache = new Map();
    this.pinStack = [];
    this.relatedPage = 1;
    this.hasMoreRelated = true;
    this.isLoadingRelated = false;
    this.relatedCols = [];
    this.colHeights = [];
    this.sentinelObserver = null;

    this.backdrop = document.getElementById("pin-modal");
    this.wrap = document.getElementById("modal-content-wrap");
    this.container = this.backdrop ? this.backdrop.querySelector(".modal-container") : null;
    this.infoCol = this.container ? this.container.querySelector(".modal-info-col") : null;
    this.img = document.getElementById("modal-img");
    this.title = document.getElementById("modal-title");
    this.author = document.getElementById("modal-author");
    this.authorPlatform = document.getElementById("modal-author-platform");
    this.authorAvatar = document.getElementById("modal-author-avatar");
    this.dimensions = document.getElementById("modal-dimensions");
    this.idEl = document.getElementById("modal-id");
    this.tagsContainer = document.getElementById("modal-tags");
    this.sourceLink = document.getElementById("modal-source-link");
    this.downloadBtn = document.getElementById("modal-download-btn");
    this.shareBtn = document.getElementById("modal-share-btn");
    this.saveBtn = document.getElementById("modal-save-btn");
    this.closeBtn = document.getElementById("modal-close-btn");
    this.scrollCue = document.getElementById("modal-scroll-cue");
    this.relatedContainer = document.getElementById("modal-related-container");
    this.relatedGrid = document.getElementById("modal-related-grid");
    this.relatedLoader = document.getElementById("modal-related-loader");
    this.sentinel = document.getElementById("modal-related-sentinel");
    this.relatedCardTemplate = document.getElementById("modal-related-card-template");
    this.imgSpinner = document.getElementById("modal-img-spinner");
    window._modal = this;

    this.bindEvents();
    this.initSentinelObserver();
  }

  bindEvents() {
    this.closeBtn.addEventListener("click", () => this.close());
    this.backdrop.addEventListener("click", (e) => {
      if (e.target === this.backdrop || e.target === this.wrap) {
        this.close();
      }
    });

    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.isOpen) {
        this.close();
      }
    });

    window.addEventListener("popstate", () => {
      if (!this.isOpen) return;
      if (this.pinStack.length > 1) {
        this.pinStack.pop();
        const prevPin = this.pinStack[this.pinStack.length - 1];
        this.renderPin(prevPin, false);
      } else {
        this.pinStack = [];
        this.closeInternal();
      }
    });

    if (this.scrollCue) {
      this.scrollCue.addEventListener("click", () => {
        if (this.relatedContainer) {
          this.relatedContainer.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      });
    }

    const onScroll = () => {
      if (!this.isOpen) return;
      if (this.scrollCue) {
        this.scrollCue.classList.toggle("hide", this.backdrop.scrollTop > 100);
      }
    };

    if (this.backdrop) {
      this.backdrop.addEventListener("scroll", onScroll, { passive: true });
    }

    this.saveBtn.addEventListener("click", () => {
      if (!this.activePin) return;
      if (typeof this.onToggleSave === "function") {
        const isSaved = this.onToggleSave(this.activePin);
        this.updateSaveButton(isSaved);
        showToast(isSaved ? "Saved to Collections!" : "Removed from Collections");
      }
    });

    this.downloadBtn.addEventListener("click", async (e) => {
      if (!this.activePin) return;
      e.preventDefault();
      await this.downloadDirectly(this.activePin);
    });

    if (this.shareBtn) {
      this.shareBtn.addEventListener("click", async (e) => {
        if (!this.activePin) return;
        e.preventDefault();
        const pin = this.activePin;
        const shareUrl = `${window.location.origin}${window.location.pathname}#pin=${encodeURIComponent(pin.id)}`;
        const shareData = {
          title: pin.title || "Lotus Anime Art",
          text: `Check out "${pin.title}" on Lotus`,
          url: shareUrl
        };

        if (navigator.share && window.isSecureContext) {
          try {
            await navigator.share(shareData);
            showToast("Link shared!");
            return;
          } catch (err) {
            if (err.name === "AbortError") return;
          }
        }

        await copyToClipboard(shareUrl);
        showToast("Link copied to clipboard!");
      });
    }
  }

  initSentinelObserver() {
    if (!("IntersectionObserver" in window) || !this.sentinel) return;
    this.sentinelObserver = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry && entry.isIntersecting && this.isOpen && !this.isLoadingRelated && this.hasMoreRelated) {
          this.loadNextRelatedBatch();
        }
      },
      {
        root: this.backdrop,
        rootMargin: "150px 0px"
      }
    );
    this.sentinelObserver.observe(this.sentinel);
  }

  async downloadDirectly(pin) {
    if (!pin) return;
    showToast("Downloading image...");
    this.downloadBtn.classList.add("is-loading");

    const ext = (pin.fullUrl || pin.previewUrl || "").split(".").pop().split("?")[0] || "png";
    const filename = `${(pin.title || "lotus_pin").replace(/[^a-zA-Z0-9_-]/g, "_")}.${ext}`;
    const targetUrl = pin.fullUrl || pin.previewUrl;
    const proxyDownloadUrl = `${API_CONFIG.downloadProxyEndpoint}?url=${encodeURIComponent(targetUrl)}&filename=${encodeURIComponent(filename)}`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      const response = await fetch(proxyDownloadUrl, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (response.ok) {
        const blob = await response.blob();
        this.triggerBlobDownload(blob, filename);
        showToast("Download completed!");
        this.downloadBtn.classList.remove("is-loading");
        return;
      }
    } catch {}

    const iframe = document.createElement("iframe");
    iframe.className = "d-none";
    iframe.src = proxyDownloadUrl;
    document.body.appendChild(iframe);
    setTimeout(() => {
      if (iframe.parentNode) {
        document.body.removeChild(iframe);
      }
    }, 6000);

    showToast("Download completed!");
    this.downloadBtn.classList.remove("is-loading");
  }

  triggerBlobDownload(blob, filename) {
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
  }

  open(pin, isSaved = false, pushToStack = true) {
    if (!pin) return;

    if (!this.isOpen) {
      this.savedScrollY = window.scrollY;
      this.previousHash = window.location.hash;
    }

    if (pushToStack) {
      this.pinStack.push(pin);
      history.pushState({ modalOpen: true, pinId: pin.id }, "", `#pin=${encodeURIComponent(pin.id)}`);
    } else {
      this.pinStack = [pin];
    }

    if (!this.isOpen) {
      this.isOpen = true;
      document.body.classList.add("modal-open");
      this.backdrop.classList.add("open");
    }

    this.resetModalScroll();
    this.renderPin(pin, isSaved);
  }

  renderPin(pin, isSaved = false) {
    if (!pin) return;
    this.activePin = pin;
    this.seenPinIds.add(pin.id);
    StorageUtils.recordViewedPin(pin);

    if (this.imgSpinner) {
      this.imgSpinner.classList.remove("d-none");
    }

    this.img.referrerPolicy = "no-referrer";
    this.img.alt = pin.title;

    this.img.onload = () => {
      if (this.imgSpinner) {
        this.imgSpinner.classList.add("d-none");
      }
    };

    this.img.onerror = () => {
      if (pin.sampleUrl && this.img.src !== pin.sampleUrl) {
        this.img.src = pin.sampleUrl;
      } else if (pin.fullUrl && this.img.src !== pin.fullUrl) {
        this.img.src = pin.fullUrl;
      } else {
        if (this.imgSpinner) {
          this.imgSpinner.classList.add("d-none");
        }
      }
    };

    this.img.src = pin.previewUrl;

    if (this.img.complete && this.img.naturalWidth > 0) {
      if (this.imgSpinner) {
        this.imgSpinner.classList.add("d-none");
      }
    }

    if (pin.fullUrl && pin.fullUrl !== pin.previewUrl) {
      const nativeImg = new Image();
      nativeImg.referrerPolicy = "no-referrer";
      nativeImg.onload = () => {
        if (this.activePin && this.activePin.id === pin.id) {
          this.img.src = pin.fullUrl;
        }
      };
      nativeImg.src = pin.fullUrl;
    }

    this.title.textContent = pin.title;
    this.author.textContent = pin.author;
    if (pin.authorHref && /^https?:\/\//i.test(pin.authorHref)) {
      this.author.href = pin.authorHref;
      this.author.target = "_blank";
      this.author.rel = "noopener noreferrer";
      this.author.title = `View artist profile on ${pin.sourceDomain}`;
    } else {
      this.author.removeAttribute("href");
    }

    if (this.authorPlatform) {
      this.authorPlatform.textContent = `Verified artist · ${pin.sourceDomain}`;
    }
    if (this.authorAvatar) {
      this.authorAvatar.textContent = (pin.author || "A").replace(/^@/, "").charAt(0).toUpperCase();
    }

    this.dimensions.textContent = `${pin.width} × ${pin.height}`;
    this.idEl.textContent = `#${pin.id.slice(0, 8)}`;

    if (pin.source && /^https?:\/\//i.test(pin.source)) {
      this.sourceLink.href = pin.source;
      this.sourceLink.target = "_blank";
      this.sourceLink.rel = "noopener noreferrer";
      this.sourceLink.title = `Visit original post on ${pin.sourceDomain}`;
      this.sourceLink.classList.remove("d-none");
    } else {
      this.sourceLink.removeAttribute("href");
      this.sourceLink.classList.add("d-none");
    }

    this.updateSaveButton(isSaved);

    this.tagsContainer.textContent = "";
    const fragment = document.createDocumentFragment();
    const tagsToRender = (pin.tags || []).slice(0, 16);
    tagsToRender.forEach((tagItem) => {
      const label = typeof tagItem === "object" && tagItem.label ? tagItem.label : String(tagItem).replace(/_/g, " ");
      const query = typeof tagItem === "object" && tagItem.query ? tagItem.query : String(tagItem);
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "modal-tag-chip";
      chip.textContent = `#${label}`;
      chip.dataset.query = query;
      chip.addEventListener("click", () => {
        this.closeForNavigation();
        if (typeof this.onTagClick === "function") {
          this.onTagClick(query);
        }
      });
      fragment.appendChild(chip);
    });
    this.tagsContainer.appendChild(fragment);

    if (this.scrollCue) {
      this.scrollCue.classList.remove("hide");
    }

    this.relatedPage = 1;
    this.hasMoreRelated = true;
    this.loadRelatedPins(pin, true);
    this.resetModalScroll();
  }

  setupRelatedColumns() {
    if (!this.relatedGrid) return [];
    const width = window.innerWidth;
    const colCount = width > 900 ? 4 : width > 600 ? 3 : 2;
    this.relatedGrid.textContent = "";
    this.relatedCols = [];
    this.colHeights = [];
    for (let i = 0; i < colCount; i++) {
      const col = document.createElement("div");
      col.className = `modal-related-col modal-related-col-${i}`;
      this.relatedGrid.appendChild(col);
      this.relatedCols.push(col);
      this.colHeights.push(0);
    }
    return this.relatedCols;
  }

  async loadNextRelatedBatch() {
    if (!this.activePin || this.isLoadingRelated || !this.hasMoreRelated) return;
    this.isLoadingRelated = true;
    this.relatedPage += 1;
    await this.loadRelatedPins(this.activePin, false);
  }

  renderRelatedPinsBatch(pins) {
    const frags = this.relatedCols.map(() => document.createDocumentFragment());

    pins.forEach((relPin) => {
      let card;
      let img;
      if (this.relatedCardTemplate) {
        const clone = this.relatedCardTemplate.content.cloneNode(true);
        card = clone.querySelector(".modal-related-card");
        img = clone.querySelector(".modal-related-img");
      } else {
        card = document.createElement("div");
        card.className = "modal-related-card";
        img = document.createElement("img");
        img.className = "modal-related-img";
        card.appendChild(img);
      }

      const rawRatio = relPin.height && relPin.width ? relPin.height / relPin.width : 1.333;
      const ratio = Math.min(Math.max(rawRatio, 0.55), 1.85);

      img.referrerPolicy = "no-referrer";
      img.loading = "lazy";
      img.decoding = "async";
      img.width = relPin.width || 400;
      img.height = relPin.height || Math.round((relPin.width || 400) * ratio);
      img.alt = relPin.title;

      const onImageLoaded = () => {
        img.classList.add("loaded");
      };
      img.addEventListener("load", onImageLoaded, { once: true });
      img.src = relPin.previewUrl;

      if (img.complete && img.naturalWidth > 0) {
        onImageLoaded();
      }

      card.addEventListener("click", () => {
        this.open(relPin, false, true);
      });

      const minIdx = this.colHeights.indexOf(Math.min(...this.colHeights));
      frags[minIdx].appendChild(card);
      this.colHeights[minIdx] += ratio;
    });

    this.relatedCols.forEach((col, idx) => {
      col.appendChild(frags[idx]);
    });
  }

  async loadRelatedPins(pin, isInitial = true) {
    if (!this.relatedGrid) return;
    if (isInitial) {
      this.setupRelatedColumns();
      this.renderedRelatedIds.clear();

      if (this.relatedCache.has(pin.id)) {
        const cached = this.relatedCache.get(pin.id);
        this.relatedPage = cached.page;
        this.hasMoreRelated = cached.hasMore;
        cached.pins.forEach((p) => {
          this.renderedRelatedIds.add(p.id);
          this.seenPinIds.add(p.id);
        });
        if (this.relatedContainer) {
          this.relatedContainer.classList.remove("d-none");
        }
        this.renderRelatedPinsBatch(cached.pins);
        return;
      }

      this.relatedPage = 1;
      this.hasMoreRelated = true;
      this.relatedCache.set(pin.id, { pins: [], page: 1, hasMore: true });
      if (this.relatedContainer) {
        this.relatedContainer.classList.remove("d-none");
      }
    }

    if (typeof this.fetchRelatedPins !== "function") return;
    this.isLoadingRelated = true;
    if (this.relatedLoader) {
      this.relatedLoader.classList.remove("d-none");
    }

    try {
      const related = await this.fetchRelatedPins(pin, this.relatedPage, 8, this.seenPinIds);
      if (!Array.isArray(related) || related.length === 0) {
        this.hasMoreRelated = false;
        const entry = this.relatedCache.get(pin.id);
        if (entry) entry.hasMore = false;
        return;
      }

      const uniqueRelated = related.filter((relPin) => {
        if (!relPin || !relPin.id || this.renderedRelatedIds.has(relPin.id)) return false;
        this.renderedRelatedIds.add(relPin.id);
        this.seenPinIds.add(relPin.id);
        return true;
      });

      if (uniqueRelated.length === 0) {
        this.hasMoreRelated = false;
        const entry = this.relatedCache.get(pin.id);
        if (entry) entry.hasMore = false;
        return;
      }

      const entry = this.relatedCache.get(pin.id);
      if (entry) {
        entry.pins.push(...uniqueRelated);
        entry.page = this.relatedPage;
        entry.hasMore = this.hasMoreRelated;
      }

      this.renderRelatedPinsBatch(uniqueRelated);
    } catch {
      this.hasMoreRelated = false;
      const entry = this.relatedCache.get(pin.id);
      if (entry) entry.hasMore = false;
    } finally {
      this.isLoadingRelated = false;
      if (this.relatedLoader) {
        this.relatedLoader.classList.add("d-none");
      }
    }
  }

  resetModalScroll() {
    if (this.backdrop) {
      this.backdrop.scrollTop = 0;
    }
    if (this.infoCol) {
      this.infoCol.scrollTop = 0;
    }
  }

  updateSaveButton(isSaved) {
    this.saveBtn.textContent = isSaved ? "Saved" : "Save";
    this.saveBtn.classList.toggle("is-saved", isSaved);
  }

  close() {
    if (!this.isOpen) return;
    if (history.state && history.state.modalOpen && !history.state.isDirect) {
      history.back();
    } else {
      this.closeInternal();
    }
  }

  closeInternal() {
    this.isOpen = false;
    this.backdrop.classList.remove("open");
    document.body.classList.remove("modal-open");
    this.activePin = null;
    this.pinStack = [];
    this.renderedRelatedIds.clear();
    this.relatedCache.clear();
    this.resetModalScroll();

    if (window.location.hash.startsWith("#pin=")) {
      const prev = (this.previousHash && !this.previousHash.startsWith("#pin=")) ? this.previousHash : "";
      const targetUrl = prev ? `${window.location.pathname}${window.location.search}${prev}` : (window.location.pathname + window.location.search);
      history.replaceState(null, document.title, targetUrl);
    }
    if (typeof this.savedScrollY === "number") {
      const scrollY = this.savedScrollY;
      window.scrollTo({ top: scrollY, behavior: "instant" });
      requestAnimationFrame(() => {
        window.scrollTo({ top: scrollY, behavior: "instant" });
      });
    }
  }

  closeForNavigation() {
    this.isOpen = false;
    if (this.backdrop) {
      this.backdrop.classList.remove("open");
    }
    document.body.classList.remove("modal-open");
    this.activePin = null;
    this.pinStack = [];
    this.renderedRelatedIds.clear();
    this.relatedCache.clear();
    this.resetModalScroll();

    if (history.state && history.state.modalOpen) {
      history.replaceState(null, "");
    }
  }
}
