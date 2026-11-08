export class TagFilterComponent {
  constructor(containerEl, onSelectTag) {
    this.containerEl = containerEl;
    this.onSelectTag = onSelectTag;
    this.chips = [];
    this.init();
    this.setTags([]);
  }

  setTags(tags = []) {
    this.containerEl.textContent = "";
    const fragment = document.createDocumentFragment();

    const allBtn = document.createElement("button");
    allBtn.type = "button";
    allBtn.className = "category-chip active";
    allBtn.dataset.query = "";
    allBtn.textContent = "All";
    fragment.appendChild(allBtn);

    const isMobile = window.innerWidth <= 768;
    const items = tags.slice(0, isMobile ? 8 : 14);

    items.forEach((item) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "category-chip";
      btn.dataset.query = item.query || item.tag || item;
      btn.textContent = item.label || item.title || item;
      fragment.appendChild(btn);
    });

    this.containerEl.appendChild(fragment);
    this.chips = Array.from(this.containerEl.querySelectorAll(".category-chip"));
  }

  init() {
    let isDown = false;
    let startX = 0;
    let initialScroll = 0;
    let hasMoved = false;

    this.containerEl.addEventListener("mousedown", (e) => {
      isDown = true;
      hasMoved = false;
      startX = e.clientX;
      initialScroll = this.containerEl.scrollLeft;
    });

    window.addEventListener("mouseup", () => {
      if (!isDown) return;
      isDown = false;
      this.containerEl.classList.remove("is-dragging");
    });

    window.addEventListener("mousemove", (e) => {
      if (!isDown) return;
      const delta = e.clientX - startX;
      if (!hasMoved && Math.abs(delta) > 8) {
        hasMoved = true;
        this.containerEl.classList.add("is-dragging");
      }
      if (hasMoved) {
        e.preventDefault();
        this.containerEl.scrollLeft = initialScroll - delta;
      }
    });

    this.containerEl.addEventListener(
      "wheel",
      (e) => {
        if (e.deltaY !== 0) {
          e.preventDefault();
          this.containerEl.scrollLeft += e.deltaY;
        }
      },
      { passive: false }
    );

    this.containerEl.addEventListener("click", (e) => {
      if (hasMoved) {
        hasMoved = false;
        return;
      }
      const chip = e.target.closest(".category-chip");
      if (!chip) return;

      this.setActiveChip(chip);
      if (typeof this.onSelectTag === "function") {
        this.onSelectTag(chip.dataset.query || "");
      }
    });
  }

  setActiveChip(selectedChip) {
    this.chips.forEach((c) => c.classList.remove("active"));
    if (selectedChip) {
      selectedChip.classList.add("active");
      const offsetLeft = selectedChip.offsetLeft;
      const chipWidth = selectedChip.offsetWidth;
      const containerWidth = this.containerEl.clientWidth;
      this.containerEl.scrollTo({
        left: offsetLeft - (containerWidth / 2) + (chipWidth / 2),
        behavior: "smooth"
      });
    }
  }

  selectByTag(tag) {
    const cleanTag = (tag || "").trim().toLowerCase();
    this.chips = Array.from(this.containerEl.querySelectorAll(".category-chip"));

    if (!cleanTag) {
      this.setActiveChip(this.chips[0]);
      return;
    }

    const matched = this.chips.find(
      (c) => (c.dataset.query || "").toLowerCase() === cleanTag || c.textContent.trim().toLowerCase() === cleanTag
    );

    this.setActiveChip(matched || null);
  }
}
