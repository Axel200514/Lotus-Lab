import { showToast } from "../../../shared/utils/ui.utils.js?v=5.5";

export class SavedListComponent {
  constructor(pinListComponent, savedService, loaderComponent, onExploreClick) {
    this.pinListComponent = pinListComponent;
    this.savedService = savedService;
    this.loaderComponent = loaderComponent;
    this.onExploreClick = onExploreClick;
    this.countBadge = document.getElementById("saved-count-badge");
    this.importBtn = document.getElementById("saved-import-btn");
    this.exportBtn = document.getElementById("saved-export-btn");
    this.fileInput = document.getElementById("saved-import-input");
    this.pageSize = 24;
    this.allSavedPins = [];
    this.initActions();
  }

  initActions() {
    if (this.importBtn && this.fileInput) {
      this.importBtn.addEventListener("click", () => {
        this.fileInput.value = "";
        this.fileInput.click();
      });

      this.fileInput.addEventListener("change", (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;

        if (file.size > 10 * 1024 * 1024) {
          showToast({
            title: "File too large",
            subtitle: "Collection file exceeds the 10 MB limit",
            type: "default",
            icon: "info",
            duration: 3000
          });
          return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            const rawText = event.target.result;
            const parsed = JSON.parse(rawText);
            const result = this.savedService.importPins(parsed);

            this.render();

            if (result.addedCount > 0) {
              const skipMsg = result.skippedCount > 0 ? `${result.skippedCount} duplicates skipped` : "Saved to your collections";
              showToast({
                title: `Imported ${result.addedCount} pin${result.addedCount > 1 ? "s" : ""}!`,
                subtitle: skipMsg,
                type: "success",
                icon: "sparkle",
                duration: 2800
              });
              this.updateCount(result.totalCount, true);
            } else {
              showToast({
                title: "Collection already up to date",
                subtitle: `${result.skippedCount} duplicate${result.skippedCount > 1 ? "s" : ""} skipped`,
                type: "default",
                icon: "info",
                duration: 2600
              });
            }
          } catch (err) {
            showToast({
              title: "Import failed",
              subtitle: err.message || "Invalid JSON file",
              type: "default",
              icon: "info",
              duration: 3000
            });
          }
        };
        reader.onerror = () => {
          showToast({
            title: "File read error",
            subtitle: "Could not read the selected file",
            type: "default",
            icon: "info",
            duration: 2800
          });
        };
        reader.readAsText(file);
      });
    }

    if (this.exportBtn) {
      this.exportBtn.addEventListener("click", () => {
        const count = this.savedService.exportCollection();
        if (count === 0) {
          showToast({
            title: "Collection is empty",
            subtitle: "Save some pins before exporting",
            type: "default",
            icon: "info",
            duration: 2600
          });
          return;
        }
        showToast({
          title: `Exported ${count} pin${count > 1 ? "s" : ""}!`,
          subtitle: "JSON backup saved to your downloads",
          type: "success",
          icon: "download",
          duration: 2600
        });
      });
    }
  }

  updateCount(count, animate = false) {
    if (this.countBadge) {
      this.countBadge.textContent = `${count} Pin${count === 1 ? "" : "s"}`;
      if (animate) {
        this.countBadge.classList.remove("pop");
        void this.countBadge.offsetWidth;
        this.countBadge.classList.add("pop");
        setTimeout(() => this.countBadge.classList.remove("pop"), 360);
      }
    }
  }

  render() {
    this.pinListComponent.clear();
    this.allSavedPins = this.savedService.getSavedPins();
    this.updateCount(this.allSavedPins.length);

    if (this.allSavedPins.length === 0) {
      this.loaderComponent.hide();
      this.renderSavedEmpty();
      return;
    }

    this.loaderComponent.hideEmpty();
    this.loaderComponent.hide();
    const initialBatch = this.allSavedPins.slice(0, this.pageSize);
    this.pinListComponent.renderPins(initialBatch);
  }

  loadMoreSavedPins() {
    const total = this.allSavedPins.length;
    const currentCount = this.pinListComponent.renderedPins.length;
    if (currentCount >= total) return;

    const nextBatch = this.allSavedPins.slice(currentCount, currentCount + this.pageSize);
    if (nextBatch.length > 0) {
      this.pinListComponent.renderPins(nextBatch);
    }
  }

  removePin(pinId) {
    if (!pinId) return;
    this.allSavedPins = this.allSavedPins.filter((p) => p.id !== pinId);
    this.pinListComponent.removePin(pinId);
    this.updateCount(this.allSavedPins.length);
    if (this.pinListComponent.renderedPins.length === 0) {
      if (this.allSavedPins.length > 0) {
        const nextBatch = this.allSavedPins.slice(0, this.pageSize);
        this.pinListComponent.renderPins(nextBatch);
      } else {
        this.renderSavedEmpty();
      }
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
    desc.textContent = "Start collecting art while exploring, or import an existing collection file.";

    const actionsWrap = document.createElement("div");
    actionsWrap.className = "saved-empty-actions";

    const exploreBtn = document.createElement("button");
    exploreBtn.type = "button";
    exploreBtn.className = "btn-primary";
    exploreBtn.textContent = "Explore Art";
    exploreBtn.addEventListener("click", () => {
      if (typeof this.onExploreClick === "function") {
        this.onExploreClick();
      }
    });

    const emptyImportBtn = document.createElement("button");
    emptyImportBtn.type = "button";
    emptyImportBtn.className = "saved-action-btn";

    const btnText = document.createElement("span");
    btnText.textContent = "Import Collection";
    emptyImportBtn.appendChild(btnText);

    emptyImportBtn.addEventListener("click", () => {
      if (this.fileInput) {
        this.fileInput.value = "";
        this.fileInput.click();
      }
    });

    actionsWrap.appendChild(exploreBtn);
    actionsWrap.appendChild(emptyImportBtn);

    wrap.appendChild(title);
    wrap.appendChild(desc);
    wrap.appendChild(actionsWrap);

    container.appendChild(wrap);
  }
}
