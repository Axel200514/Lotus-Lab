import { showToast, copyToClipboard } from "../../utils/ui.utils.js?v=5.4";
import { StorageUtils } from "../../utils/storage.utils.js?v=5.4";
import { API_CONFIG } from "../../../../app/app.config.js?v=5.4";

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
    this.renderedRelatedHashes = new Set();
    this.spinnerSafetyTimer = null;
    this.relatedCache = new Map();
    this.pinStack = [];
    this.relatedAbortController = null;
    this.relatedSeq = 0;
    this.relatedPage = 1;
    this.hasMoreRelated = true;
    this.isLoadingRelated = false;
    this.relatedCols = [];
    this.colHeights = [];
    this.sentinelObserver = null;
    this.relatedThresholdObserver = null;
    this.pendingRelatedPrefetch = false;
    this.renderedRelatedPins = [];

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
    this.tagsSection = this.tagsContainer ? this.tagsContainer.closest(".modal-tags-container") : null;
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
        const prevEntry = this.pinStack[this.pinStack.length - 1];
        const prevPin = prevEntry.pin || prevEntry;
        const prevScroll = typeof prevEntry.scrollY === "number" ? prevEntry.scrollY : 0;
        this.renderPin(prevPin, false, prevScroll);
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
        if (entry && entry.isIntersecting && this.isOpen && this.hasMoreRelated) {
          if (this.isLoadingRelated) {
            if (this.relatedLoader) {
              this.relatedLoader.classList.remove("d-none");
            }
            return;
          }
          this.loadNextRelatedBatch(false);
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
      if (this.pinStack.length > 0) {
        const top = this.pinStack[this.pinStack.length - 1];
        if (top) {
          top.scrollY = this.backdrop ? this.backdrop.scrollTop : 0;
        }
      }
      this.pinStack.push({ pin, scrollY: 0 });
      history.pushState({ modalOpen: true, pinId: pin.id }, "", `#pin=${encodeURIComponent(pin.id)}`);
    } else {
      this.pinStack = [{ pin, scrollY: 0 }];
    }

    if (!this.isOpen) {
      this.isOpen = true;
      document.body.classList.add("modal-open");
      this.backdrop.classList.add("open");
    }

    this.renderPin(pin, isSaved, null);
  }

  renderPin(pin, isSaved = false, restoreScrollTop = null) {
    if (!pin) return;
    this.activePin = pin;
    this.seenPinIds.add(pin.id);
    if (this.seenPinIds.size > 50) {
      const arr = Array.from(this.seenPinIds).slice(-25);
      this.seenPinIds = new Set(arr);
    }
    StorageUtils.recordViewedPin(pin);

    if (this.imgSpinner) {
      this.imgSpinner.classList.remove("d-none");
    }

    if (this.spinnerSafetyTimer) {
      clearTimeout(this.spinnerSafetyTimer);
    }
    this.spinnerSafetyTimer = setTimeout(() => {
      if (this.imgSpinner) {
        this.imgSpinner.classList.add("d-none");
      }
    }, 6000);

    const sources = [
      pin.previewUrl,
      pin.sampleUrl,
      pin.fullUrl,
      pin.thumbnailUrl
    ].filter(Boolean);
    const uniqueSources = [...new Set(sources)];
    let sourceIdx = 0;

    this.img.referrerPolicy = "no-referrer";
    this.img.alt = pin.title;

    this.img.onload = () => {
      if (this.spinnerSafetyTimer) {
        clearTimeout(this.spinnerSafetyTimer);
      }
      if (this.imgSpinner) {
        this.imgSpinner.classList.add("d-none");
      }
    };

    this.img.onerror = () => {
      sourceIdx += 1;
      if (sourceIdx < uniqueSources.length) {
        this.img.src = uniqueSources[sourceIdx];
      } else {
        if (this.spinnerSafetyTimer) {
          clearTimeout(this.spinnerSafetyTimer);
        }
        if (this.imgSpinner) {
          this.imgSpinner.classList.add("d-none");
        }
      }
    };

    this.img.src = uniqueSources[0] || "";

    if (this.img.complete && this.img.naturalWidth > 0) {
      if (this.spinnerSafetyTimer) {
        clearTimeout(this.spinnerSafetyTimer);
      }
      if (this.imgSpinner) {
        this.imgSpinner.classList.add("d-none");
      }
    }

    if (pin.fullUrl && pin.fullUrl !== uniqueSources[0]) {
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
    if (this.tagsSection) {
      this.tagsSection.classList.toggle("d-none", tagsToRender.length === 0);
    }
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
    this.renderedRelatedPins = [];
    this.pendingRelatedPrefetch = false;
    if (this.relatedThresholdObserver) {
      this.relatedThresholdObserver.disconnect();
      this.relatedThresholdObserver = null;
    }
    this.loadRelatedPins(pin, true, false, restoreScrollTop);
    if (typeof restoreScrollTop !== "number" || restoreScrollTop <= 0) {
      this.resetModalScroll();
    }
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

  setupRelatedThresholdObserver() {
    if (this.relatedThresholdObserver) {
      this.relatedThresholdObserver.disconnect();
      this.relatedThresholdObserver = null;
    }

    if (!this.hasMoreRelated || this.renderedRelatedPins.length === 0) return;
    if (!("IntersectionObserver" in window)) return;

    const targetIndex = this.renderedRelatedPins.length >= 5
      ? this.renderedRelatedPins.length - 4
      : -1;

    if (targetIndex < 0) return;
    const targetPin = this.renderedRelatedPins[targetIndex];
    if (!targetPin || !targetPin.id) return;

    const targetCard = this.relatedGrid ? this.relatedGrid.querySelector(`.modal-related-card[data-id="${targetPin.id}"]`) : null;
    if (!targetCard) return;

    this.relatedThresholdObserver = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry && entry.isIntersecting) {
          if (this.relatedThresholdObserver) {
            this.relatedThresholdObserver.disconnect();
            this.relatedThresholdObserver = null;
          }
          if (this.isLoadingRelated) {
            this.pendingRelatedPrefetch = true;
            return;
          }
          this.loadNextRelatedBatch(true);
        }
      },
      {
        root: this.backdrop,
        rootMargin: "0px"
      }
    );

    this.relatedThresholdObserver.observe(targetCard);
  }

  async loadNextRelatedBatch(isSilent = false) {
    if (!this.activePin || this.isLoadingRelated || !this.hasMoreRelated) return;
    this.isLoadingRelated = true;
    this.relatedPage += 1;
    await this.loadRelatedPins(this.activePin, false, isSilent);
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
      if (card && relPin.id) {
        card.dataset.id = relPin.id;
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
    this.renderedRelatedPins.push(...pins);
    this.setupRelatedThresholdObserver();
  }

  async loadRelatedPins(pin, isInitial = true, isSilent = false, restoreScrollTop = null) {
    if (!this.relatedGrid) return;
    if (isInitial) {
      if (this.relatedAbortController) {
        this.relatedAbortController.abort();
      }
      this.relatedAbortController = new AbortController();
      this.setupRelatedColumns();
      this.renderedRelatedIds.clear();
      this.renderedRelatedHashes.clear();
      this.renderedRelatedPins = [];

      if (this.relatedCache.has(pin.id)) {
        const cached = this.relatedCache.get(pin.id);
        this.relatedPage = cached.page;
        this.hasMoreRelated = cached.hasMore;
        cached.pins.forEach((p) => {
          this.renderedRelatedIds.add(p.id);
          const url = p.previewUrl || p.sampleUrl || p.image || "";
          const m = url.match(/([a-f0-9]{32})/i);
          if (m) this.renderedRelatedHashes.add(m[1].toLowerCase());
          this.seenPinIds.add(p.id);
        });
        if (this.relatedContainer) {
          this.relatedContainer.classList.remove("d-none");
        }
        this.renderRelatedPinsBatch(cached.pins);
        if (typeof restoreScrollTop === "number" && restoreScrollTop > 0) {
          requestAnimationFrame(() => {
            if (this.backdrop) {
              this.backdrop.scrollTop = restoreScrollTop;
            }
          });
        }
        return;
      }

      this.relatedPage = 1;
      this.hasMoreRelated = true;
      this.relatedCache.set(pin.id, { pins: [], page: 1, hasMore: true });
      if (this.relatedContainer) {
        this.relatedContainer.classList.add("d-none");
      }
      if (this.scrollCue) {
        this.scrollCue.classList.add("hide");
      }
    }

    if (typeof this.fetchRelatedPins !== "function") return;
    this.isLoadingRelated = true;
    if (!isSilent && this.relatedLoader) {
      this.relatedLoader.classList.remove("d-none");
    }

    this.relatedSeq = (this.relatedSeq || 0) + 1;
    const currentSeq = this.relatedSeq;
    const signal = this.relatedAbortController ? this.relatedAbortController.signal : null;

    try {
      const related = await this.fetchRelatedPins(pin, this.relatedPage, 8, this.renderedRelatedIds, signal);
      if (currentSeq !== this.relatedSeq || !this.isOpen || (this.activePin && this.activePin.id !== pin.id)) {
        return;
      }
      if (!Array.isArray(related) || related.length === 0) {
        this.hasMoreRelated = false;
        const entry = this.relatedCache.get(pin.id);
        if (entry) entry.hasMore = false;
        if (isInitial && this.relatedContainer) {
          this.relatedContainer.classList.add("d-none");
        }
        if (this.scrollCue) {
          this.scrollCue.classList.add("hide");
        }
        return;
      }

      if (this.relatedContainer) {
        this.relatedContainer.classList.remove("d-none");
      }
      if (this.scrollCue) {
        this.scrollCue.classList.remove("hide");
      }

      const extractHash = (relPin) => {
        if (!relPin) return "";
        if (relPin.artworkKey && !relPin.artworkKey.startsWith("sb_")) return relPin.artworkKey.toLowerCase();
        const url = relPin.previewUrl || relPin.sampleUrl || relPin.image || "";
        const m = url.match(/([a-f0-9]{32})/i);
        return m ? m[1].toLowerCase() : (url ? url.split("/").pop().toLowerCase() : relPin.id);
      };

      const uniqueRelated = related.filter((relPin) => {
        if (!relPin || !relPin.id || this.renderedRelatedIds.has(relPin.id)) return false;
        const hash = extractHash(relPin);
        if (hash && this.renderedRelatedHashes.has(hash)) return false;
        this.renderedRelatedIds.add(relPin.id);
        if (hash) this.renderedRelatedHashes.add(hash);
        this.seenPinIds.add(relPin.id);
        return true;
      });

      if (uniqueRelated.length === 0) {
        if (this.relatedPage < 4) {
          this.relatedPage += 1;
          return this.loadRelatedPins(pin, false, isSilent, restoreScrollTop);
        }
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
      if (typeof restoreScrollTop === "number" && restoreScrollTop > 0) {
        requestAnimationFrame(() => {
          if (this.backdrop) {
            this.backdrop.scrollTop = restoreScrollTop;
          }
        });
      }
    } catch {
      if (currentSeq === this.relatedSeq) {
        this.hasMoreRelated = false;
        const entry = this.relatedCache.get(pin.id);
        if (entry) entry.hasMore = false;
      }
    } finally {
      if (currentSeq === this.relatedSeq) {
        this.isLoadingRelated = false;
        if (this.relatedLoader) {
          this.relatedLoader.classList.add("d-none");
        }
        if (this.pendingRelatedPrefetch) {
          this.pendingRelatedPrefetch = false;
          if (this.hasMoreRelated) {
            this.loadNextRelatedBatch(true);
          }
        }
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
    if (this.relatedAbortController) {
      this.relatedAbortController.abort();
      this.relatedAbortController = null;
    }
    this.relatedSeq = 0;
    this.seenPinIds.clear();
    if (this.relatedThresholdObserver) {
      this.relatedThresholdObserver.disconnect();
      this.relatedThresholdObserver = null;
    }
    this.pendingRelatedPrefetch = false;
    this.renderedRelatedPins = [];
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
    if (this.relatedAbortController) {
      this.relatedAbortController.abort();
      this.relatedAbortController = null;
    }
    this.relatedSeq = 0;
    this.seenPinIds.clear();
    if (this.relatedThresholdObserver) {
      this.relatedThresholdObserver.disconnect();
      this.relatedThresholdObserver = null;
    }
    this.pendingRelatedPrefetch = false;
    this.renderedRelatedPins = [];
    this.renderedRelatedIds.clear();
    this.relatedCache.clear();
    this.resetModalScroll();

    if (history.state && history.state.modalOpen) {
      history.replaceState(null, "");
    }
  }
}
