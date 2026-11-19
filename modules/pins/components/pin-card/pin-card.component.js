export class PinCardComponent {
  constructor(template) {
    this.template = template;
    this.observers = new Set();
  }

  disconnectAll() {
    for (const obs of this.observers) {
      obs.disconnect();
    }
    this.observers.clear();
  }

  render(pin, isSaved, callbacks = {}) {
    const clone = this.template.content.cloneNode(true);
    const card = clone.querySelector(".pin-card");
    if (card && pin.id) {
      card.dataset.id = pin.id;
    }
    const mediaWrapper = clone.querySelector(".pin-media-wrapper");
    const img = clone.querySelector(".pin-image");
    const titleEl = clone.querySelector(".pin-title");
    const authorEl = clone.querySelector(".pin-author");
    const shareBtn = clone.querySelector(".pin-share-btn");

    if (mediaWrapper && pin.width && pin.height) {
      mediaWrapper.style.aspectRatio = `${pin.width} / ${pin.height}`;
    }

    img.referrerPolicy = "no-referrer";
    img.loading = "lazy";
    img.decoding = "async";
    img.alt = pin.title || "Illustration";
    img.width = pin.width || 800;
    img.height = pin.height || 1000;

    const sources = [
      pin.previewUrl,
      pin.sampleUrl,
      pin.thumbnailUrl,
      pin.fullUrl
    ].filter(Boolean);
    const uniqueSources = [...new Set(sources)];
    let sourceIndex = 0;
    let isLoaded = false;
    let observer = null;

    const cleanupObserver = () => {
      if (observer) {
        observer.disconnect();
        this.observers.delete(observer);
        observer = null;
      }
    };

    const onImageLoaded = () => {
      isLoaded = true;
      cleanupObserver();
      img.classList.add("loaded");
      img.classList.remove("error");
    };

    img.addEventListener("load", onImageLoaded);

    img.addEventListener("error", () => {
      sourceIndex++;
      if (sourceIndex < uniqueSources.length) {
        img.src = uniqueSources[sourceIndex];
      } else {
        cleanupObserver();
        img.classList.add("loaded");
        img.classList.add("error");
      }
    });

    img.src = uniqueSources[0] || "";

    if (img.complete && img.naturalWidth > 0) {
      onImageLoaded();
    }

    if (!isLoaded && "IntersectionObserver" in window && card) {
      observer = new IntersectionObserver(
        (entries) => {
          if (!card.isConnected || isLoaded) {
            cleanupObserver();
            return;
          }
          for (const entry of entries) {
            if (entry.isIntersecting && !isLoaded) {
              if (img.complete && img.naturalWidth === 0) {
                sourceIndex++;
                if (sourceIndex < uniqueSources.length) {
                  img.src = uniqueSources[sourceIndex];
                } else {
                  cleanupObserver();
                }
              }
            }
          }
        },
        { rootMargin: "200px" }
      );
      this.observers.add(observer);
      observer.observe(card);
    }

    titleEl.textContent = pin.title;
    authorEl.textContent = pin.sourceDomain ? `${pin.author} · ${pin.sourceDomain}` : pin.author;

    if (shareBtn) {
      shareBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (typeof callbacks.onShare === "function") {
          callbacks.onShare(pin, shareBtn);
        }
      });
    }

    card.addEventListener("click", () => {
      if (typeof callbacks.onClick === "function") {
        callbacks.onClick(pin);
      }
    });

    return clone;
  }
}
