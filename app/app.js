import { AppRouter } from "./app.routes.js?v=3.9";
import { APP_ROUTES, API_CONFIG } from "./app.config.js?v=3.9";
import { NavbarComponent } from "../modules/shared/components/navbar/navbar.component.js?v=3.9";
import { ModalComponent } from "../modules/shared/components/modal/modal.component.js?v=3.9";
import { LoaderComponent } from "../modules/shared/components/loader/loader.component.js?v=3.9";
import { PinService } from "../modules/pins/services/pin.service.js?v=3.9";
import { SavedService } from "../modules/saved/services/saved.service.js?v=3.9";
import { PinListComponent } from "../modules/pins/components/pin-list/pin-list.component.js?v=3.9";
import { SavedListComponent } from "../modules/saved/components/saved-list/saved-list.component.js?v=3.9";
import { SearchBarComponent } from "../modules/search/components/search-bar/search-bar.component.js?v=3.9";
import { TagFilterComponent } from "../modules/search/components/tag-filter/tag-filter.component.js?v=3.9";
import { ExploreMainComponent } from "../modules/explore/components/explore-main/explore-main.component.js?v=3.9";
import { ExploreService } from "../modules/explore/services/explore.service.js?v=3.9";
import { StorageUtils } from "../modules/shared/utils/storage.utils.js?v=3.9";

const FALLBACK_TAGS = [
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
    this.savedGridContainer = document.getElementById("saved-grid");
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

    this.feedScrollPosition = 0;
    this.feedPage = 1;
    this.feedHasMore = true;
    this.isFeedActive = false;

    this.loader = new LoaderComponent();

    this.modal = new ModalComponent(
      (tag) => this.handleTagSelection(tag),
      (pin) => {
        const isSaved = this.savedService.toggleSave(pin);
        this.exploreService.clearIdeasCache();
        this.hasRenderedExplore = false;
        if (!isSaved && this.currentMode === "saved") {
          this.savedList.removePin(pin.id);
        }
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

    this.savedPinList = new PinListComponent(
      this.savedGridContainer,
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
      this.savedPinList,
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
          this.showHomeTopicView(tag);
        } else {
          this.showFeedView();
        }
      }
    );

    this.tagFilter.setTags(this.pinService.shuffle([...FALLBACK_TAGS]));
    const cachedExplore = this.exploreService.getStoredCache();
    if (cachedExplore) {
      this.populateDynamicTags(cachedExplore);
    } else {
      setTimeout(() => {
        if (!this.hasLoadedTrendingTags) {
          this.loadDynamicTags();
        }
      }, 1800);
    }

    let homeTapCount = 0;
    let homeTapTimer = null;

    this.navbar = new NavbarComponent((route) => {
      if (this.modal && this.modal.isOpen) {
        if (typeof this.modal.closeForNavigation === "function") {
          this.modal.closeForNavigation();
        } else {
          this.modal.close();
        }
      }

      if (route === APP_ROUTES.home || route === "") {
        const isAlreadyOnHome = (this.currentMode === "feed" || !this.currentMode) && (!window.location.hash || window.location.hash === "#" || window.location.hash === `#${APP_ROUTES.home}` || window.location.hash === "#/");
        if (isAlreadyOnHome) {
          homeTapCount += 1;
          this.navbar.triggerTapAnimation("");
          clearTimeout(homeTapTimer);
          homeTapTimer = setTimeout(() => {
            homeTapCount = 0;
          }, 1800);

          if (homeTapCount >= 4) {
            homeTapCount = 0;
            clearTimeout(homeTapTimer);
            this.navbar.setRefreshing("", true);
            if (this.ptrIndicator) {
              this.ptrIndicator.style.transition = "opacity 0.25s ease, transform 0.25s ease";
              this.ptrIndicator.style.opacity = "1";
              this.ptrIndicator.style.transform = "translate3d(-50%, 15px, 0)";
              this.ptrIndicator.classList.add("refreshing");
            }
            window.scrollTo({ top: 0, behavior: "smooth" });
            this.triggerFeedRefresh().finally(() => {
              this.navbar.setRefreshing("", false);
              setTimeout(() => {
                if (this.ptrIndicator) {
                  this.ptrIndicator.classList.remove("refreshing");
                  this.resetPullIndicator();
                }
              }, 400);
            });
            return;
          }

          window.scrollTo({ top: 0, behavior: "smooth" });
          return;
        }

        homeTapCount = 1;
        this.navbar.triggerTapAnimation("");
        clearTimeout(homeTapTimer);
        homeTapTimer = setTimeout(() => {
          homeTapCount = 0;
        }, 1800);
        this.router.navigate(route);
        return;
      }

      homeTapCount = 0;
      clearTimeout(homeTapTimer);
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
    if (this.savedGridContainer) this.savedGridContainer.classList.add("d-none");
    this.gridContainer.classList.toggle("d-none", isExplore);
  }

  setSavedViewVisible(isSaved) {
    if (this.savedGridContainer) this.savedGridContainer.classList.toggle("d-none", !isSaved);
    this.exploreView.classList.add("d-none");
    this.gridContainer.classList.toggle("d-none", isSaved);
  }

  async showPinModalById(pinId) {
    if (!pinId) return;

    if (this.pinList.renderedPins.length === 0 && !this.isFeedActive) {
      this.showFeedView();
    }

    const existing = this.pinList.renderedPins.find((p) => p.id === pinId)
      || (this.savedPinList && this.savedPinList.renderedPins.find((p) => p.id === pinId))
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
      this.hasRenderedExplore = true;
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

    this.feedScrollPosition = 0;
    this.feedPage = 1;
    this.feedHasMore = true;
    this.isFeedActive = true;
    this.pinList.clear();
    this.pinService.resetSession();
    await this.fetchMorePins(true);
  }

  showFeedView() {
    if (this.modal && this.modal.isOpen) {
      if (typeof this.modal.closeForNavigation === "function") {
        this.modal.closeForNavigation();
      } else {
        this.modal.close();
      }
    }

    if (this.currentMode === "feed" && this.pinList.renderedPins.length > 0) {
      return;
    }

    this.navbar.setActive(APP_ROUTES.home);
    this.categoriesContainer.classList.remove("d-none");
    if (this.exploreHeader) this.exploreHeader.classList.add("d-none");
    this.setSavedViewVisible(false);
    this.setExploreViewVisible(false);
    this.searchBar.setValue("");
    this.tagFilter.selectByTag("");

    if (this.isFeedActive && this.pinList.renderedPins.length > 0) {
      this.currentMode = "feed";
      this.currentQuery = "";
      this.currentPage = this.feedPage;
      this.hasMore = this.feedHasMore;
      this.loader.hide();
      this.loader.hideEmpty();
      if (!this.hasMore) {
        this.loader.showEnd();
      } else {
        this.loader.hideEnd();
      }
      requestAnimationFrame(() => {
        window.scrollTo({ top: this.feedScrollPosition, behavior: "instant" });
      });
      return;
    }

    this.currentMode = "feed";
    this.currentQuery = "";
    this.currentPage = 1;
    this.hasMore = true;
    this.isFeedActive = true;
    this.pinList.clear();
    this.loader.hideEnd();
    this.loader.hideEmpty();
    this.pinService.resetSession();
    this.fetchMorePins(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  showHomeTopicView(topic) {
    if (this.currentMode === "feed") {
      this.feedScrollPosition = window.scrollY;
      this.feedPage = this.currentPage;
      this.feedHasMore = this.hasMore;
    }
    this.navbar.setActive(APP_ROUTES.home);
    this.categoriesContainer.classList.remove("d-none");
    if (this.exploreHeader) this.exploreHeader.classList.add("d-none");
    this.setSavedViewVisible(false);
    this.setExploreViewVisible(false);

    if (this.currentMode === "topic" && this.currentQuery === topic && this.pinList.renderedPins.length > 0) {
      return;
    }

    this.isFeedActive = false;
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
    if (this.currentMode === "feed") {
      this.feedScrollPosition = window.scrollY;
      this.feedPage = this.currentPage;
      this.feedHasMore = this.hasMore;
    }
    this.navbar.setActive(APP_ROUTES.explore);
    this.categoriesContainer.classList.add("d-none");
    if (this.exploreHeader) {
      this.exploreHeader.classList.remove("d-none");
      if (this.exploreTopicTitle) {
        this.exploreTopicTitle.textContent = title || topic;
      }
    }
    this.setSavedViewVisible(false);
    this.setExploreViewVisible(false);

    if (this.currentMode === "topic" && this.currentQuery === topic && this.pinList.renderedPins.length > 0) {
      return;
    }

    this.isFeedActive = false;
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
    if (this.currentMode === "feed") {
      this.feedScrollPosition = window.scrollY;
      this.feedPage = this.currentPage;
      this.feedHasMore = this.hasMore;
    }
    this.navbar.setActive(APP_ROUTES.home);
    this.categoriesContainer.classList.remove("d-none");
    if (this.exploreHeader) this.exploreHeader.classList.add("d-none");
    this.setSavedViewVisible(false);
    this.setExploreViewVisible(false);

    if (this.currentMode === "search" && this.currentQuery === query && this.pinList.renderedPins.length > 0) {
      return;
    }

    this.isFeedActive = false;
    this.currentQuery = query;
    this.currentMode = "search";
    this.currentPage = 1;
    this.hasMore = true;
    this.searchBar.setValue(query.replace(/_/g, " "));
    this.tagFilter.clearActive();
    this.pinList.clear();
    this.loader.hideEnd();
    this.loader.hideEmpty();
    this.pinService.resetSearchSession();
    this.fetchMorePins(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async showExploreView() {
    if (this.modal && this.modal.isOpen) {
      if (typeof this.modal.closeForNavigation === "function") {
        this.modal.closeForNavigation();
      } else {
        this.modal.close();
      }
    }
    if (this.currentMode === "feed") {
      this.feedScrollPosition = window.scrollY;
      this.feedPage = this.currentPage;
      this.feedHasMore = this.hasMore;
    }
    this.fetchSeq += 1;
    this.navbar.setActive(APP_ROUTES.explore);
    this.categoriesContainer.classList.add("d-none");
    if (this.exploreHeader) this.exploreHeader.classList.add("d-none");
    this.setSavedViewVisible(false);
    this.setExploreViewVisible(true);
    this.currentMode = "explore";
    this.hasMore = false;
    this.loader.hideEnd();
    this.loader.hideEmpty();

    if (this.hasRenderedExplore) {
      this.loader.hide();
      return;
    }

    this.loader.show();
    await this.exploreComponent.render();
    this.hasRenderedExplore = true;
    this.loader.hide();
  }

  showSavedView() {
    if (this.modal && this.modal.isOpen) {
      if (typeof this.modal.closeForNavigation === "function") {
        this.modal.closeForNavigation();
      } else {
        this.modal.close();
      }
    }
    if (this.currentMode === "feed") {
      this.feedScrollPosition = window.scrollY;
      this.feedPage = this.currentPage;
      this.feedHasMore = this.hasMore;
    }
    if (this.currentMode === "saved") {
      return;
    }
    this.fetchSeq += 1;
    this.navbar.setActive(APP_ROUTES.saved);
    this.categoriesContainer.classList.add("d-none");
    if (this.exploreHeader) this.exploreHeader.classList.add("d-none");
    this.setSavedViewVisible(true);
    this.currentMode = "saved";
    this.hasMore = false;
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

  populateDynamicTags(data) {
    if (!data) return;
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

    for (const fb of FALLBACK_TAGS) {
      addTag(fb.label, fb.query);
    }

    if (tags.length > 0) {
      const activeTag = this.currentMode === "topic" ? this.currentQuery : "";
      const shuffled = this.pinService.shuffle(tags);
      this.tagFilter.setTags(shuffled);
      this.tagFilter.selectByTag(activeTag);
      this.hasLoadedTrendingTags = true;
    }
  }

  async loadDynamicTags() {
    if (this.isLoadingDynamicTags) return;
    this.isLoadingDynamicTags = true;
    try {
      const data = await this.exploreService.getExploreData();
      this.populateDynamicTags(data);
    } catch {}
    finally {
      this.isLoadingDynamicTags = false;
    }
  }

  handleTagSelection(tag) {
    if (this.searchBar) {
      this.searchBar.blur();
    }
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
        if (this.currentMode === "feed") {
          this.pinService.resetSession();
          const retryResult = await this.pinService.getFeedPins(1, API_CONFIG.defaultLimit);
          if (currentSeq !== this.fetchSeq) return;
          const retryPins = retryResult?.pins || [];
          if (retryPins.length > 0) {
            this.loader.hideEmpty();
            this.pinList.renderPins(retryPins);
            this.currentPage = 2;
            this.hasMore = Boolean(retryResult?.hasNextPage);
            this.feedPage = 2;
            this.feedHasMore = this.hasMore;
            return;
          }
        }
        this.loader.showEmpty();
        this.hasMore = false;
        if (this.currentMode === "feed") {
          this.feedHasMore = false;
        }
        return;
      }

      this.loader.hideEmpty();
      this.pinList.renderPins(pins);
      this.currentPage += 1;

      if (this.currentMode === "feed") {
        this.feedPage = this.currentPage;
        this.feedHasMore = this.hasMore;
      }

      if (!this.hasMore) {
        this.loader.showEnd();
      }
    } catch {
      if (currentSeq !== this.fetchSeq) return;
      if (reset) {
        if (this.currentMode === "feed") {
          try {
            this.pinService.resetSession();
            const retryResult = await this.pinService.getFeedPins(1, API_CONFIG.defaultLimit);
            if (currentSeq !== this.fetchSeq) return;
            const retryPins = retryResult?.pins || [];
            if (retryPins.length > 0) {
              this.loader.hideEmpty();
              this.pinList.renderPins(retryPins);
              this.currentPage = 2;
              this.hasMore = Boolean(retryResult?.hasNextPage);
              this.feedPage = 2;
              this.feedHasMore = this.hasMore;
              return;
            }
          } catch {}
        }
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
