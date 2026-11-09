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

    const onImageLoaded = () => {
      isLoaded = true;
      img.classList.add("loaded");
      img.classList.remove("error");
    };

    img.addEventListener("load", onImageLoaded);

    img.addEventListener("error", () => {
      sourceIndex++;
      if (sourceIndex < uniqueSources.length) {
        img.src = uniqueSources[sourceIndex];
      } else {
        img.classList.add("loaded");
        img.classList.add("error");
      }
    });

    img.src = uniqueSources[0] || "";

    if (img.complete && img.naturalWidth > 0) {
      onImageLoaded();
    }

    if ("IntersectionObserver" in window && card) {
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting && !isLoaded) {
              if (img.complete && img.naturalWidth === 0) {
                sourceIndex++;
                if (sourceIndex < uniqueSources.length) {
                  img.src = uniqueSources[sourceIndex];
                }
              }
            }
          });
        },
        { rootMargin: "200px" }
      );
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
