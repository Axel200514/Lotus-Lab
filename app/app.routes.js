import { APP_ROUTES } from "./app.config.js?v=3.7";

export class AppRouter {
  constructor(routes = {}) {
    this.routes = routes;
    this.currentRoute = null;
    this.init();
  }

  init() {
    window.addEventListener("hashchange", () => this.handleHashChange());
    this.handleHashChange();
  }

  handleHashChange() {
    const rawHash = window.location.hash.replace(/^#\/?/, "");

    if (rawHash.startsWith("pin=")) {
      const pinId = decodeURIComponent(rawHash.slice(4));
      this.currentRoute = "pin";
      if (typeof this.routes.pin === "function") {
        this.routes.pin(pinId);
      }
      return;
    }

    if (rawHash.startsWith("explore?") || rawHash.startsWith("explorar?")) {
      const qIndex = rawHash.indexOf("?");
      const params = new URLSearchParams(rawHash.slice(qIndex + 1));
      const topic = params.get("topic") || "";
      const title = params.get("title") || topic;
      this.currentRoute = "explore-topic";
      if (typeof this.routes.exploreTopic === "function") {
        this.routes.exploreTopic(topic, title);
      }
      return;
    }

    if (rawHash.startsWith("topic=")) {
      history.replaceState(null, document.title, window.location.pathname + window.location.search);
      const route = APP_ROUTES.home;
      this.currentRoute = route;
      if (typeof this.routes[route] === "function") {
        this.routes[route]();
      }
      return;
    }

    if (rawHash.startsWith("search=")) {
      const query = decodeURIComponent(rawHash.slice(7));
      this.currentRoute = "search";
      if (typeof this.routes.search === "function") {
        this.routes.search(query);
      }
      return;
    }

    if (rawHash.startsWith("tag=")) {
      const tag = decodeURIComponent(rawHash.slice(4));
      this.currentRoute = "search";
      if (typeof this.routes.search === "function") {
        this.routes.search(tag);
      }
      return;
    }

    const normalized = rawHash === "explorar" ? "explore" : rawHash === "guardados" ? "saved" : rawHash;
    const route = normalized || APP_ROUTES.home;
    this.currentRoute = route;

    if (typeof this.routes[route] === "function") {
      this.routes[route]();
    } else if (typeof this.routes[rawHash] === "function") {
      this.routes[rawHash]();
    } else if (typeof this.routes.default === "function") {
      this.routes.default(route);
    }
  }

  navigate(route) {
    const targetHash = route ? `#${route}` : "";
    if (!route) {
      if (window.location.hash) {
        history.pushState(null, "", window.location.pathname + window.location.search);
      }
      this.handleHashChange();
      return;
    }
    if (window.location.hash === targetHash) {
      this.handleHashChange();
    } else {
      window.location.hash = targetHash;
    }
  }
}
