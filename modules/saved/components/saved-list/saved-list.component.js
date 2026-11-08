export class SavedListComponent {
  constructor(pinListComponent, savedService, loaderComponent, onExploreClick) {
    this.pinListComponent = pinListComponent;
    this.savedService = savedService;
    this.loaderComponent = loaderComponent;
    this.onExploreClick = onExploreClick;
  }

  render() {
    this.pinListComponent.clear();
    const saved = this.savedService.getSavedPins();

    if (saved.length === 0) {
      this.loaderComponent.hide();
      this.renderSavedEmpty();
      return;
    }

    this.loaderComponent.hideEmpty();
    this.loaderComponent.hide();
    this.pinListComponent.renderPins(saved);
  }

  removePin(pinId) {
    if (!pinId) return;
    this.pinListComponent.removePin(pinId);
    if (this.pinListComponent.renderedPins.length === 0) {
      this.renderSavedEmpty();
    }
  }

  renderSavedEmpty() {
    const container = this.pinListComponent.container;
    container.textContent = "";

    const wrap = document.createElement("div");
    wrap.className = "empty-state visible w-full";

    const title = document.createElement("h2");
    title.className = "empty-title";
    title.textContent = "No saved pins yet";

    const desc = document.createElement("p");
    desc.className = "empty-desc";
    desc.textContent = "Click the 'Save' button on any pin to start organizing your private collection here.";

    const exploreBtn = document.createElement("button");
    exploreBtn.type = "button";
    exploreBtn.className = "btn-primary mt-4";
    exploreBtn.textContent = "Explore Art";
    exploreBtn.addEventListener("click", () => {
      if (typeof this.onExploreClick === "function") {
        this.onExploreClick();
      }
    });

    wrap.appendChild(title);
    wrap.appendChild(desc);
    wrap.appendChild(exploreBtn);

    container.appendChild(wrap);
  }
}
