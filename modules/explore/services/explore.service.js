import { API_CONFIG } from "../../../app/app.config.js";
import { StorageUtils } from "../../shared/utils/storage.utils.js";

const CACHE_KEY = "lotus_explore_cache_v15";
const CACHE_TTL_MS = 8 * 60 * 60 * 1000;

const IDEAS_CACHE_KEY = "lotus_ideas_cache_v15";
const IDEAS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export class ExploreService {
  constructor() {
    this.memoryCache = null;
    this.pendingPromise = null;
    this.ideasMemoryCache = null;
    try {
      for (let i = 1; i <= 14; i++) {
        localStorage.removeItem(`lotus_explore_cache_v${i}`);
        localStorage.removeItem(`lotus_ideas_cache_v${i}`);
      }
      localStorage.removeItem("lotus_explore_cache");
      localStorage.removeItem("lotus_ideas_for_you_cache");
    } catch {}
  }

  async getExploreData(forceRefresh = false) {
    if (!forceRefresh) {
      const cached = this.getStoredCache();
      if (cached) {
        this.memoryCache = cached;
        return cached;
      }
    }

    if (!this.pendingPromise) {
      this.pendingPromise = this.fetchExploreData()
        .then((data) => {
          if (this.isValidPayload(data)) {
            this.saveStoredCache(data);
            this.memoryCache = data;
          }
          this.pendingPromise = null;
          return this.memoryCache || data;
        })
        .catch(() => {
          this.pendingPromise = null;
          return this.getStoredCache() || { boards: [], popularSections: [] };
        });
    }
    return this.pendingPromise;
  }

  getStoredCache() {
    if (this.memoryCache) return this.memoryCache;
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !parsed.timestamp || !parsed.data) return null;
      if (Date.now() - parsed.timestamp > CACHE_TTL_MS) {
        localStorage.removeItem(CACHE_KEY);
        return null;
      }
      if (this.isValidPayload(parsed.data)) {
        return parsed.data;
      }
      localStorage.removeItem(CACHE_KEY);
      return null;
    } catch {
      return null;
    }
  }

  saveStoredCache(data) {
    try {
      localStorage.setItem(
        CACHE_KEY,
        JSON.stringify({
          timestamp: Date.now(),
          data
        })
      );
    } catch {}
  }

  isValidPayload(data) {
    if (!data || !Array.isArray(data.boards) || data.boards.length < 8) {
      return false;
    }
    return true;
  }

  async fetchExploreData() {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(API_CONFIG.trendingEndpoint, {
        cache: "no-store",
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!res.ok) return { boards: [], popularSections: [] };

      const data = await res.json();
      if (this.isValidPayload(data)) {
        return data;
      }
      return { boards: [], popularSections: [] };
    } catch {
      return { boards: [], popularSections: [] };
    }
  }

  async getFeaturedBoards(forceRefresh = false) {
    const data = await this.getExploreData(forceRefresh);
    return data.boards || [];
  }

  async getPopularSections(forceRefresh = false) {
    const data = await this.getExploreData(forceRefresh);
    return data.popularSections || [];
  }

  async getIdeasForYou(forceRefresh = false) {
    try {
      localStorage.removeItem("lotus_ideas_for_you_cache");
    } catch {}

    if (!forceRefresh) {
      if (this.ideasMemoryCache) return this.ideasMemoryCache;
      try {
        const raw = localStorage.getItem(IDEAS_CACHE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && parsed.timestamp && Array.isArray(parsed.data) && parsed.data.length >= 5) {
            if (Date.now() - parsed.timestamp < IDEAS_CACHE_TTL_MS) {
              this.ideasMemoryCache = parsed.data;
              return parsed.data;
            }
          }
          localStorage.removeItem(IDEAS_CACHE_KEY);
        }
      } catch {}
    }

    const ideas = await this.buildIdeasForYouPayload();
    this.ideasMemoryCache = ideas;
    try {
      localStorage.setItem(
        IDEAS_CACHE_KEY,
        JSON.stringify({
          timestamp: Date.now(),
          data: ideas
        })
      );
    } catch {}
    return ideas;
  }

  async buildIdeasForYouPayload() {
    const exploreData = await this.getExploreData();
    const savedPins = StorageUtils.getSavedPins();
    const userTasteTags = StorageUtils.getUserTasteTags();
    const recentSearches = StorageUtils.getRecentSearches();

    const selectedTopics = [];
    const usedQueries = new Set();

    const userCandidates = [...userTasteTags, ...recentSearches];
    for (const term of userCandidates) {
      const clean = (term || "").trim();
      if (!clean) continue;
      const q = clean.replace(/\s+/g, "_").toLowerCase();
      if (!usedQueries.has(q)) {
        const preview = this.findPreviewForQuery(q, savedPins, exploreData);
        if (preview) {
          usedQueries.add(q);
          selectedTopics.push({
            title: this.formatTitle(clean),
            tag: clean,
            query: q,
            previewUrl: preview
          });
          if (selectedTopics.length >= 5) break;
        }
      }
    }

    if (selectedTopics.length < 5 && Array.isArray(exploreData.popularSections)) {
      for (const section of exploreData.popularSections) {
        if (!section || !section.tag) continue;
        const q = section.tag.trim().replace(/\s+/g, "_").toLowerCase();
        const t = section.thumbnails && section.thumbnails[0];
        const preview = typeof t === "string" ? t : (t ? t.url : "");
        if (!usedQueries.has(q) && preview) {
          usedQueries.add(q);
          selectedTopics.push({
            title: section.title || this.formatTitle(section.tag),
            tag: section.tag,
            query: q,
            previewUrl: preview
          });
          if (selectedTopics.length >= 5) break;
        }
      }
    }

    if (selectedTopics.length < 5 && Array.isArray(exploreData.boards)) {
      const remainingBoards = exploreData.boards.slice(4).concat(exploreData.boards.slice(0, 4));
      for (const board of remainingBoards) {
        if (!board || !board.tag) continue;
        const q = board.tag.trim().replace(/\s+/g, "_").toLowerCase();
        const preview = (board.previews && (board.previews[1] || board.previews[0])) || "";
        if (!usedQueries.has(q) && preview) {
          usedQueries.add(q);
          selectedTopics.push({
            title: board.title || this.formatTitle(board.tag),
            tag: board.tag,
            query: q,
            previewUrl: preview
          });
          if (selectedTopics.length >= 5) break;
        }
      }
    }

    if (selectedTopics.length < 5 && Array.isArray(exploreData.boards)) {
      for (const board of exploreData.boards) {
        if (!board || !board.tag) continue;
        const q = board.tag.trim().replace(/\s+/g, "_").toLowerCase();
        const preview = (board.previews && (board.previews[0] || board.previews[1])) || "";
        if (!usedQueries.has(q) && preview) {
          usedQueries.add(q);
          selectedTopics.push({
            title: board.title || this.formatTitle(board.tag),
            tag: board.tag,
            query: q,
            previewUrl: preview
          });
          if (selectedTopics.length >= 5) break;
        }
      }
    }

    if (selectedTopics.length < 5 && Array.isArray(exploreData.boards)) {
      for (const board of exploreData.boards) {
        if (!board || !Array.isArray(board.previews)) continue;
        for (const prev of board.previews) {
          if (prev && !selectedTopics.some((t) => t.previewUrl === prev)) {
            selectedTopics.push({
              title: board.title || this.formatTitle(board.tag),
              tag: board.tag,
              query: `${board.tag}_${selectedTopics.length}`,
              previewUrl: prev
            });
            if (selectedTopics.length >= 5) break;
          }
        }
        if (selectedTopics.length >= 5) break;
      }
    }

    return selectedTopics.slice(0, 5).map((topic, i) => ({
      id: `idea-${i}-${topic.query}`,
      title: topic.title,
      tag: topic.tag,
      query: topic.query,
      previewUrl: topic.previewUrl,
      badge: "Idea for you"
    }));
  }

  clearIdeasCache() {
    this.ideasMemoryCache = null;
    StorageUtils.clearIdeasCache();
  }

  findPreviewForQuery(query, savedPins, exploreData) {
    const cleanQ = query.toLowerCase();

    const matchingSaved = savedPins.find((p) => {
      if (!p || !Array.isArray(p.tags)) return false;
      return p.tags.some((t) => {
        const raw = typeof t === "string" ? t : t.query || t.label;
        return (raw || "").toLowerCase().includes(cleanQ);
      });
    });
    if (matchingSaved && matchingSaved.previewUrl) {
      return matchingSaved.previewUrl;
    }

    const viewedPins = StorageUtils.getViewedPins();
    const matchingViewed = viewedPins.find((p) => {
      if (!p || !Array.isArray(p.tags)) return false;
      return p.tags.some((t) => {
        const raw = typeof t === "string" ? t : t.query || t.label;
        return (raw || "").toLowerCase().includes(cleanQ);
      });
    });
    if (matchingViewed && matchingViewed.previewUrl) {
      return matchingViewed.previewUrl;
    }

    if (Array.isArray(exploreData.boards)) {
      const b = exploreData.boards.find(
        (item) => item.tag && item.tag.toLowerCase().includes(cleanQ)
      );
      if (b && b.previews && b.previews[0]) {
        return b.previews[0];
      }
    }

    if (Array.isArray(exploreData.popularSections)) {
      const s = exploreData.popularSections.find(
        (item) => item.tag && item.tag.toLowerCase().includes(cleanQ)
      );
      if (s && s.thumbnails && s.thumbnails[0]) {
        const t = s.thumbnails[0];
        return typeof t === "string" ? t : t.url;
      }
    }

    return "";
  }

  formatTitle(tag) {
    return tag
      .replace(/&#039;/g, "'")
      .replace(/&amp;/g, "&")
      .replace(/\([^)]*\)/g, "")
      .replace(/_/g, " ")
      .trim()
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }
}
