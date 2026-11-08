export class SearchBarComponent {
  constructor(inputEl, clearBtn, onSearch) {
    this.inputEl = inputEl;
    this.clearBtn = clearBtn;
    this.onSearch = onSearch;
    this.debounceTimer = null;
    this.init();
  }

  init() {
    this.inputEl.addEventListener("input", (e) => {
      const value = e.target.value.trim();
      if (value.length > 0) {
        this.clearBtn.classList.add("visible");
      } else {
        this.clearBtn.classList.remove("visible");
      }

      clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => {
        if (typeof this.onSearch === "function") {
          this.onSearch(value);
        }
      }, 400);
    });

    this.inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        this.inputEl.blur();
        clearTimeout(this.debounceTimer);
        const value = this.inputEl.value.trim();
        if (typeof this.onSearch === "function") {
          this.onSearch(value);
        }
      }
    });

    this.clearBtn.addEventListener("click", () => {
      this.setValue("");
      if (typeof this.onSearch === "function") {
        this.onSearch("");
      }
    });
  }

  setValue(value) {
    this.inputEl.value = value;
    if (value) {
      this.clearBtn.classList.add("visible");
    } else {
      this.clearBtn.classList.remove("visible");
    }
  }

  getValue() {
    return this.inputEl.value.trim();
  }

  blur() {
    this.inputEl.blur();
  }
}
