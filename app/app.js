import { AppRouter } from "./app.routes.js?v=3.2";
import { APP_ROUTES, API_CONFIG } from "./app.config.js?v=3.2";
import { NavbarComponent } from "../modules/shared/components/navbar/navbar.component.js?v=3.2";
import { ModalComponent } from "../modules/shared/components/modal/modal.component.js?v=3.2";
import { LoaderComponent } from "../modules/shared/components/loader/loader.component.js?v=3.2";
import { PinService } from "../modules/pins/services/pin.service.js?v=3.2";
import { SavedService } from "../modules/saved/services/saved.service.js?v=3.2";
import { PinListComponent } from "../modules/pins/components/pin-list/pin-list.component.js?v=3.2";
import { SavedListComponent } from "../modules/saved/components/saved-list/saved-list.component.js?v=3.2";
import { SearchBarComponent } from "../modules/search/components/search-bar/search-bar.component.js?v=3.2";
import { TagFilterComponent } from "../modules/search/components/tag-filter/tag-filter.component.js?v=3.2";
import { ExploreMainComponent } from "../modules/explore/components/explore-main/explore-main.component.js?v=3.2";
import { ExploreService } from "../modules/explore/services/explore.service.js?v=3.2";
import { StorageUtils } from "../modules/shared/utils/storage.utils.js?v=3.2";

class LotusApp {
  constructor() {
    this.pinService = new PinService();
    this.savedService = new SavedService();
    this.exploreService = new ExploreService();

    this.currentQuery = "";
    this.currentMode = "feed";
    this.currentPage = 1;
    this.isLoading = false;
    this.hasMore = true;
    this.fetchSeq = 0;
    this.hasRenderedExplore = false;

    this.gridContainer = document.getElementById("pins-grid");
    this.exploreView = document.getElementById("explore-view");
    this.template = document.getElementById("pin-card-template");
    this.categoriesContainer = document.getElementById("categories-bar");
    this.searchInput = document.getElementById("search-input");
    this.searchClear = document.getElementById("search-clear");
    this.sentinel = document.getElementById("scroll-sentinel");
    this.exploreHeader = document.getElementById("explore-header");
    this.exploreBackBtn = document.getElementById("explore-back-btn");
    this.exploreTopicTitle = document.getElementById("explore-topic-title");
    this.ptrIndicator = document.getElementById("pull-to-refresh");
    this.ptrIcon = this.ptrIndicator ? this.ptrIndicator.querySelector(".ptr-icon") : null;

    this.loader = new LoaderComponent();

    this.modal = new ModalComponent(
      (tag) => this.handleTagSelection(tag),
      (pin) => {
        const isSaved = this.savedService.toggleSave(pin);
        this.exploreService.clearIdeasCache();
        this.hasRenderedExplore = false;
        return isSaved;
      },
      (pin, page, limit, excludeIds) => this.pinService.getRelatedPins(pin, page, limit, excludeIds)
    );

    this.pinList = new PinListComponent(
      this.gridContainer,
      this.template,
      this.savedService,
      {
        onPinClick: (pin) => {
          const isSaved = this.savedService.isSaved(pin.id);
          this.modal.open(pin, isSaved);
        }
      }
    );

    this.savedList = new SavedListComponent(
      this.pinList,
      this.savedService,
      this.loader,
      () => this.router.navigate(APP_ROUTES.explore)
    );

    this.exploreComponent = new ExploreMainComponent(
      this.exploreView,
      (tag, title) => this.router.navigate(`explore?topic=${encodeURIComponent(tag)}&title=${encodeURIComponent(title || tag)}`),
      this.exploreService
    );

    this.searchBar = new SearchBarComponent(
      this.searchInput,
      this.searchClear,
      (query) => this.handleSearch(query)
    );

    this.tagFilter = new TagFilterComponent(
      this.categoriesContainer,
      (tag) => {
        if (tag) {
          StorageUtils.addRecentSearch(tag);
          this.exploreService.clearIdeasCache();
          this.router.navigate(`topic=${encodeURIComponent(tag)}`);
        } else {
          this.router.navigate(APP_ROUTES.home);
        }
      }
    );

    this.loadDynamicTags();

    this.navbar = new NavbarComponent((route) => {
      if ((route === APP_ROUTES.home || route === "") && this.currentMode === "feed" && !window.location.hash) {
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      this.router.navigate(route);
    });

    if (this.exploreBackBtn) {
      this.exploreBackBtn.addEventListener("click", () => {
        this.router.navigate(APP_ROUTES.explore);
      });
    }

    this.observer = null;
    this.initRouter();
    this.initIntersectionObserver();
    this.initPullToRefresh();
    window._app = this;
  }

  initRouter() {
    this.router = new AppRouter({
      [APP_ROUTES.home]: () => this.showFeedView(),
      [APP_ROUTES.explore]: () => this.showExploreView(),
      explore: () => this.showExploreView(),
      explorar: () => this.showExploreView(),
      [APP_ROUTES.saved]: () => this.showSavedView(),
      saved: () => this.showSavedView(),
      guardados: () => this.showSavedView(),
      exploreTopic: (topic, title) => this.showExploreTopicView(topic, title),
      homeTopic: (topic) => this.showHomeTopicView(topic),
      search: (query) => this.showSearchView(query),
      pin: (pinId) => this.showPinModalById(pinId),
      default: () => this.showFeedView()
    });
  }

  setExploreViewVisible(isExplore) {
    this.exploreView.classList.toggle("d-none", !isExplore);
    this.gridContainer.classList.toggle("d-none", isExplore);
  }

  async showPinModalById(pinId) {
    if (!pinId) return;

    if (this.pinList.renderedPins.length === 0) {
      this.showFeedView();
    }

    const existing = this.pinList.renderedPins.find((p) => p.id === pinId)
      || this.savedService.getSavedPins().find((p) => p.id === pinId);

    if (existing) {
      const isSaved = this.savedService.isSaved(existing.id);
      history.replaceState({ modalOpen: true, pinId: existing.id, isDirect: true }, document.title, window.location.href);
      this.modal.open(existing, isSaved, false);
      return;
    }

    try {
      const pin = await this.pinService.getPinById(pinId);
      if (pin) {
        const isSaved = this.savedService.isSaved(pin.id);
        history.replaceState({ modalOpen: true, pinId: pin.id, isDirect: true }, document.title, window.location.href);
        this.modal.open(pin, isSaved, false);
      }
    } catch {}
  }

  initIntersectionObserver() {
    if (!("IntersectionObserver" in window) || !this.sentinel) return;

    this.observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        const isInfiniteScrollable = this.currentMode === "feed" || this.currentMode === "topic" || this.currentMode === "search";
        if (entry.isIntersecting && !this.isLoading && this.hasMore && isInfiniteScrollable) {
          if (this.modal && this.modal.isOpen) return;
          this.fetchMorePins();
        }
      },
      {
        rootMargin: "800px 0px"
      }
    );

    this.observer.observe(this.sentinel);

    let scrollTimeout = null;
    window.addEventListener(
      "scroll",
      () => {
        if (scrollTimeout) return;
        scrollTimeout = setTimeout(() => {
          scrollTimeout = null;
          const isInfiniteScrollable = this.currentMode === "feed" || this.currentMode === "topic" || this.currentMode === "search";
          if (!isInfiniteScrollable || this.isLoading || !this.hasMore) return;
          if (this.modal && this.modal.isOpen) return;
          const scrollRemaining = document.documentElement.scrollHeight - (window.scrollY + window.innerHeight);
          if (scrollRemaining < 1000) {
            this.fetchMorePins();
          }
        }, 120);
      },
      { passive: true }
    );
  }

  initPullToRefresh() {
    if (!this.ptrIndicator) return;

    let startY = 0;
    let currentPull = 0;
    let isTracking = false;
    let isRefreshing = false;
    const threshold = 65;

    const onTouchStart = (e) => {
      if (window.scrollY > 5 || isRefreshing) return;
      if (this.modal && this.modal.isOpen) return;
      startY = e.touches[0].clientY;
      currentPull = 0;
      isTracking = true;
    };

    const onTouchMove = (e) => {
      if (!isTracking || isRefreshing) return;
      if (window.scrollY > 5) {
        isTracking = false;
        this.resetPullIndicator();
        return;
      }
      const clientY = e.touches[0].clientY;
      const diff = clientY - startY;
      if (diff > 0) {
        currentPull = Math.min(diff * 0.42, 85);
        const progress = Math.min(currentPull / threshold, 1);
        this.ptrIndicator.style.transition = "none";
        this.ptrIndicator.style.opacity = String(progress);
        this.ptrIndicator.style.transform = `translate3d(-50%, ${currentPull - 75}px, 0)`;
        if (this.ptrIcon) {
          this.ptrIcon.style.transform = `rotate(${progress * 280}deg)`;
        }
      } else {
        this.resetPullIndicator();
      }
    };

    const onTouchEnd = async () => {
      if (!isTracking || isRefreshing) return;
      isTracking = false;

      if (currentPull >= threshold) {
        isRefreshing = true;
        this.ptrIndicator.style.transition = "";
        this.ptrIndicator.classList.add("refreshing");
        try {
          await this.triggerFeedRefresh();
        } finally {
          setTimeout(() => {
            this.ptrIndicator.classList.remove("refreshing");
            this.resetPullIndicator();
            isRefreshing = false;
          }, 400);
        }
      } else {
        this.resetPullIndicator();
      }
    };

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
  }

  resetPullIndicator() {
    if (!this.ptrIndicator) return;
    this.ptrIndicator.style.transition = "opacity 0.25s ease, transform 0.25s ease";
    this.ptrIndicator.style.opacity = "0";
    this.ptrIndicator.style.transform = "translate3d(-50%, -75px, 0)";
    if (this.ptrIcon) {
      this.ptrIcon.style.transform = "rotate(0deg)";
    }
  }

  async triggerFeedRefresh() {
    if (this.currentMode === "explore") {
      this.hasRenderedExplore = false;
      this.exploreService.memoryCache = null;
      this.exploreService.ideasMemoryCache = null;
      await this.exploreComponent.render(true);
      return;
    }

    if (this.currentMode === "saved") {
      await new Promise((resolve) => setTimeout(resolve, 250));
      this.savedList.render();
      return;
    }

    if (this.currentMode === "topic") {
      this.pinList.clear();
      this.pinService.resetTopicSession();
      await this.fetchMorePins(true);
      return;
    }

    if (this.currentMode === "search") {
      this.pinList.clear();
      this.pinService.resetSearchSession();
      await this.fetchMorePins(true);
      return;
    }

    this.pinList.clear();
    this.pinService.resetSession();
    await this.fetchMorePins(true);
  }

  showFeedView() {
    if (this.currentMode === "feed" && this.pinList.renderedPins.length > 0) {
      return;
    }

    this.navbar.setActive(APP_ROUTES.home);
    this.categoriesContainer.classList.remove("d-none");
    if (this.exploreHeader) this.exploreHeader.classList.add("d-none");
    this.setExploreViewVisible(false);
    this.searchBar.setValue("");
    this.tagFilter.selectByTag("");

    if (!this.hasLoadedTrendingTags) {
      this.loadDynamicTags();
    }

    this.currentMode = "feed";
    this.currentQuery = "";
    this.currentPage = 1;
    this.hasMore = true;
    this.pinList.clear();
    this.loader.hideEnd();
    this.loader.hideEmpty();
    this.pinService.resetSession();
    this.fetchMorePins(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  showHomeTopicView(topic) {
    this.navbar.setActive(APP_ROUTES.home);
    this.categoriesContainer.classList.remove("d-none");
    if (this.exploreHeader) this.exploreHeader.classList.add("d-none");
    this.setExploreViewVisible(false);

    if (this.currentMode === "topic" && this.currentQuery === topic && this.pinList.renderedPins.length > 0) {
      return;
    }

    this.currentQuery = topic;
    this.currentMode = "topic";
    this.currentPage = 1;
    this.hasMore = true;
    this.searchBar.setValue("");
    this.tagFilter.selectByTag(topic);
    this.pinList.clear();
    this.loader.hideEnd();
    this.loader.hideEmpty();
    this.pinService.resetTopicSession();
    this.fetchMorePins(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  showExploreTopicView(topic, title) {
    this.navbar.setActive(APP_ROUTES.explore);
    this.categoriesContainer.classList.add("d-none");
    if (this.exploreHeader) {
      this.exploreHeader.classList.remove("d-none");
      if (this.exploreTopicTitle) {
        this.exploreTopicTitle.textContent = title || topic;
      }
    }
    this.setExploreViewVisible(false);

    if (this.currentMode === "topic" && this.currentQuery === topic && this.pinList.renderedPins.length > 0) {
      return;
    }

    this.currentQuery = topic;
    this.currentMode = "topic";
    this.currentPage = 1;
    this.hasMore = true;
    this.searchBar.setValue("");
    this.pinList.clear();
    this.loader.hideEnd();
    this.loader.hideEmpty();
    this.pinService.resetTopicSession();
    this.fetchMorePins(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  showSearchView(query) {
    this.navbar.setActive(APP_ROUTES.home);
    this.categoriesContainer.classList.remove("d-none");
    if (this.exploreHeader) this.exploreHeader.classList.add("d-none");
    this.setExploreViewVisible(false);

    if (this.currentMode === "search" && this.currentQuery === query && this.pinList.renderedPins.length > 0) {
      return;
    }

    this.currentQuery = query;
    this.currentMode = "search";
    this.currentPage = 1;
    this.hasMore = true;
    this.searchBar.setValue(query.replace(/_/g, " "));
    this.tagFilter.selectByTag(query);
    this.pinList.clear();
    this.loader.hideEnd();
    this.loader.hideEmpty();
    this.pinService.resetSearchSession();
    this.fetchMorePins(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async showExploreView() {
    if (this.currentMode === "explore" && this.hasRenderedExplore) {
      return;
    }
    this.fetchSeq += 1;
    this.navbar.setActive(APP_ROUTES.explore);
    this.categoriesContainer.classList.add("d-none");
    if (this.exploreHeader) this.exploreHeader.classList.add("d-none");
    this.setExploreViewVisible(true);
    this.currentMode = "explore";
    this.hasMore = false;
    this.loader.hideEnd();
    this.loader.hideEmpty();

    this.loader.show();
    await this.exploreComponent.render();
    this.hasRenderedExplore = true;
    this.loader.hide();
  }

  showSavedView() {
    if (this.currentMode === "saved") {
      return;
    }
    this.fetchSeq += 1;
    this.navbar.setActive(APP_ROUTES.saved);
    this.categoriesContainer.classList.add("d-none");
    if (this.exploreHeader) this.exploreHeader.classList.add("d-none");
    this.setExploreViewVisible(false);
    this.currentMode = "saved";
    this.hasMore = false;
    this.pinList.clear();
    this.loader.hide();
    this.loader.hideEnd();
    this.savedList.render();
  }

  handleSearch(query) {
    const clean = (query || "").trim();
    if (clean) {
      StorageUtils.addRecentSearch(clean);
      this.router.navigate(`search=${encodeURIComponent(clean)}`);
    } else {
      this.router.navigate(APP_ROUTES.home);
    }
  }

  async loadDynamicTags() {
    try {
      const data = await this.exploreService.getExploreData();
      const tags = [];
      const seen = new Set();

      const addTag = (title, query) => {
        if (!title || !query) return;
        const q = String(query).trim();
        const l = String(title).replace(/&#039;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"').trim();
        const keyQ = q.toLowerCase();
        const keyL = l.toLowerCase();
        if (!seen.has(keyQ) && !seen.has(keyL)) {
          seen.add(keyQ);
          seen.add(keyL);
          tags.push({ label: l, query: q });
        }
      };

      if (Array.isArray(data?.boards)) {
        data.boards.forEach((b) => addTag(b.title, b.tag));
      }
      if (Array.isArray(data?.popularSections)) {
        data.popularSections.forEach((s) => addTag(s.title, s.tag));
      }

      const fallbacks = [
        { label: "Genshin Impact", query: "genshin_impact" },
        { label: "Honkai Star Rail", query: "honkai:_star_rail" },
        { label: "Zenless Zone Zero", query: "zenless_zone_zero" },
        { label: "Undertale", query: "undertale" },
        { label: "Touhou", query: "touhou" },
        { label: "Deltarune", query: "deltarune" },
        { label: "Blue Archive", query: "blue_archive" },
        { label: "Umamusume", query: "umamusume" },
        { label: "Project Moon", query: "project_moon" },
        { label: "Fate", query: "fate/grand_order" },
        { label: "Arknights", query: "arknights" },
        { label: "Hololive", query: "hololive" },
        { label: "Vocaloid", query: "vocaloid" },
        { label: "Frieren", query: "sousou_no_frieren" },
        { label: "Bocchi the Rock", query: "bocchi_the_rock!" },
        { label: "Chainsaw Man", query: "chainsaw_man" },
        { label: "Jujutsu Kaisen", query: "jujutsu_kaisen" },
        { label: "Evangelion", query: "neon_genesis_evangelion" },
        { label: "Madoka Magica", query: "mahou_shoujo_madoka_magica" },
        { label: "Cyberpunk", query: "cyberpunk" },
        { label: "NieR Automata", query: "nier:_automata" },
        { label: "Persona", query: "persona_5" },
        { label: "Pokemon", query: "pokemon" },
        { label: "Zelda", query: "the_legend_of_zelda" },
        { label: "Elden Ring", query: "elden_ring" },
        { label: "Oshi no Ko", query: "oshi_no_ko" },
        { label: "Spy x Family", query: "spy_x_family" },
        { label: "Glitchtale", query: "glitchtale" },
        { label: "Pixel Art", query: "pixel_art" },
        { label: "Scenery", query: "scenery" },
        { label: "Wallpaper", query: "wallpaper" },
        { label: "Retro 90s", query: "90s_retro" }
      ];

      for (const fb of fallbacks) {
        addTag(fb.label, fb.query);
      }

      if (tags.length > 0) {
        const shuffled = this.pinService.shuffle(tags);
        this.tagFilter.setTags(shuffled);
        this.hasLoadedTrendingTags = true;
      }
    } catch {}
  }

  handleTagSelection(tag) {
    if (this.modal) {
      if (typeof this.modal.closeForNavigation === "function") {
        this.modal.closeForNavigation();
      } else {
        this.modal.close();
      }
    }
    const clean = (tag || "").trim();
    if (clean) {
      StorageUtils.addRecentSearch(clean);
      this.exploreService.clearIdeasCache();
    }
    this.router.navigate(`search=${encodeURIComponent(clean)}`);
  }

  async fetchMorePins(reset = false) {
    if (this.isLoading && !reset) return;
    if (!this.hasMore && !reset) return;

    this.isLoading = true;
    this.loader.show();
    this.loader.hideEmpty();

    this.fetchSeq += 1;
    const currentSeq = this.fetchSeq;

    try {
      let result;
      if (this.currentMode === "topic") {
        result = await this.pinService.getTopicPins(
          this.currentQuery,
          this.currentPage,
          API_CONFIG.defaultLimit
        );
      } else if (this.currentMode === "search") {
        result = await this.pinService.searchPins(
          this.currentQuery,
          this.currentPage,
          API_CONFIG.defaultLimit
        );
      } else {
        result = await this.pinService.getFeedPins(
          this.currentPage,
          API_CONFIG.defaultLimit
        );
      }

      if (currentSeq !== this.fetchSeq) return;

      const pins = result?.pins || [];
      this.hasMore = Boolean(result?.hasNextPage);

      if (reset && pins.length === 0) {
        this.loader.showEmpty();
        this.hasMore = false;
        return;
      }

      this.loader.hideEmpty();
      this.pinList.renderPins(pins);
      this.currentPage += 1;

      if (!this.hasMore) {
        this.loader.showEnd();
      }
    } catch {
      if (currentSeq !== this.fetchSeq) return;
      if (reset) {
        this.loader.showEmpty();
      }
    } finally {
      if (currentSeq === this.fetchSeq) {
        this.isLoading = false;
        this.loader.hide();
        if (this.hasMore && this.sentinel) {
          const rect = this.sentinel.getBoundingClientRect();
          if (rect.top <= window.innerHeight + 800) {
            this.fetchMorePins();
          }
        }
      }
    }
  }
}

new LotusApp();
