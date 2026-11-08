export class NavbarComponent {
  constructor(onRouteSelect) {
    this.onRouteSelect = onRouteSelect;
    this.navElement = document.getElementById("main-nav");
    this.header = document.querySelector(".header");
    this.searchContainer = document.querySelector(".search-container");
    this.navButtons = document.querySelectorAll(".nav-btn");
    this.brandLink = document.getElementById("brand-link");
    this.handleResponsivePlacement();
    this.init();
    window.addEventListener("resize", () => this.handleResponsivePlacement());
  }

  handleResponsivePlacement() {
    if (!this.navElement) return;
    if (window.innerWidth <= 768) {
      if (this.navElement.parentElement !== document.body) {
        document.body.appendChild(this.navElement);
      }
    } else {
      if (this.header && this.searchContainer && this.navElement.parentElement !== this.header) {
        this.header.insertBefore(this.navElement, this.searchContainer);
      }
    }
  }

  init() {
    this.navButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const route = btn.dataset.route || "";
        this.setActive(route);
        if (typeof this.onRouteSelect === "function") {
          this.onRouteSelect(route);
        }
      });
    });

    if (this.brandLink) {
      this.brandLink.addEventListener("click", (e) => {
        e.preventDefault();
        this.setActive("");
        if (typeof this.onRouteSelect === "function") {
          this.onRouteSelect("");
        }
      });
    }
  }

  triggerTapAnimation(route) {
    const normalized = route === "explorar" ? "explore" : route === "guardados" ? "saved" : route;
    const btn = Array.from(this.navButtons).find((b) => (b.dataset.route || "") === normalized);
    if (!btn) return;
    btn.classList.remove("tap-bounce");
    void btn.offsetWidth;
    btn.classList.add("tap-bounce");
  }

  setRefreshing(route, isRefreshing) {
    const normalized = route === "explorar" ? "explore" : route === "guardados" ? "saved" : route;
    const btn = Array.from(this.navButtons).find((b) => (b.dataset.route || "") === normalized);
    if (!btn) return;
    btn.classList.toggle("refreshing", Boolean(isRefreshing));
  }

  setActive(route) {
    const normalized = route === "explorar" ? "explore" : route === "guardados" ? "saved" : route;
    this.navButtons.forEach((btn) => {
      const btnRoute = btn.dataset.route || "";
      btn.classList.toggle("active", btnRoute === normalized || btnRoute === route);
    });
  }
}
