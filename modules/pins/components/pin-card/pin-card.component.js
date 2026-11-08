export class PinCardComponent {
  constructor(template) {
    this.template = template;
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
    img.alt = pin.title;
    img.width = pin.width || 800;
    img.height = pin.height || 1000;

    const onImageLoaded = () => {
      img.classList.add("loaded");
    };

    img.addEventListener("load", onImageLoaded, { once: true });
    img.onerror = () => {
      if (pin.sampleUrl && img.src !== pin.sampleUrl) {
        img.src = pin.sampleUrl;
      }
    };
    img.src = pin.previewUrl;

    if (img.complete && img.naturalWidth > 0) {
      onImageLoaded();
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
