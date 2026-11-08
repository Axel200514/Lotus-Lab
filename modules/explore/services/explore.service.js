import { API_CONFIG } from "../../../app/app.config.js";
import { StorageUtils, ATTR_REGEX } from "../../shared/utils/storage.utils.js";

const CACHE_KEY = "lotus_explore_cache_v15";
const CACHE_TTL_MS = 8 * 60 * 60 * 1000;

const IDEAS_CACHE_KEY = "lotus_ideas_cache_v20";
const IDEAS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export class ExploreService {
  constructor() {
    this.memoryCache = null;
    this.pendingPromise = null;
    this.ideasMemoryCache = null;
    try {
      for (let i = 1; i <= 19; i++) {
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
    const recentSearches = StorageUtils.getRecentSearches();

    const tagOccurrences = new Map();
    savedPins.forEach((p) => {
      if (p.title) {
        const titleTag = p.title.trim().toLowerCase().replace(/\s+/g, "_");
        if (titleTag && titleTag.length > 2 && !ATTR_REGEX.test(titleTag) && !/^\d/.test(titleTag)) {
          tagOccurrences.set(titleTag, (tagOccurrences.get(titleTag) || 0) + 2);
        }
      }
      if (Array.isArray(p.tags)) {
        p.tags.forEach((t) => {
          const raw = typeof t === "string" ? t : t.query || t.label;
          if (!raw) return;
          const clean = raw.trim().toLowerCase();
          if (clean.length > 2 && !/^\d/.test(clean) && !ATTR_REGEX.test(clean)) {
            tagOccurrences.set(clean, (tagOccurrences.get(clean) || 0) + 1);
          }
        });
      }
    });

    const recurringTags = [...tagOccurrences.entries()]
      .filter(([_, count]) => count >= 2)
      .map(([tag]) => tag);

    const dynamicKnownTags = new Set([
      ...(exploreData.boards || []).map((b) => (b.tag || "").toLowerCase()),
      ...(exploreData.popularSections || []).map((s) => (s.tag || "").toLowerCase()),
      ...recentSearches
        .map((s) => (s || "").trim().toLowerCase().replace(/\s+/g, "_"))
        .filter((s) => s.length > 2 && !ATTR_REGEX.test(s) && !/^\d/.test(s)),
      ...savedPins
        .map((p) => (p.title || "").trim().toLowerCase().replace(/\s+/g, "_"))
        .filter((t) => t.length > 2 && !ATTR_REGEX.test(t) && !/^\d/.test(t)),
      ...recurringTags
    ]);
    const userTasteTags = StorageUtils.getUserTasteTags(dynamicKnownTags);

    const selectedTopics = [];
    const usedQueries = new Set();
    const usedPreviews = new Set();

    const userCandidates = userTasteTags;
    for (const term of userCandidates) {
      const clean = (term || "").trim();
      if (!clean) continue;
      const q = clean.replace(/\s+/g, "_").toLowerCase();
      if (usedQueries.has(q)) continue;
      if ([...usedQueries].some((existing) => existing.split("_").includes(q) || q.split("_").includes(existing))) continue;
      const preview = this.findPreviewForQuery(q, savedPins, exploreData, usedPreviews);
      if (preview && !usedPreviews.has(preview)) {
        usedQueries.add(q);
        usedPreviews.add(preview);
        selectedTopics.push({
          title: this.formatTitle(clean),
          tag: clean,
          query: q,
          previewUrl: preview
        });
        if (selectedTopics.length >= 5) break;
      }
    }

    if (selectedTopics.length < 5 && Array.isArray(exploreData.popularSections)) {
      for (const section of exploreData.popularSections) {
        if (!section || !section.tag) continue;
        const q = section.tag.trim().replace(/\s+/g, "_").toLowerCase();
        if (usedQueries.has(q)) continue;
        let preview = "";
        if (Array.isArray(section.thumbnails)) {
          for (const t of section.thumbnails) {
            const url = typeof t === "string" ? t : (t ? t.url : "");
            if (url && !usedPreviews.has(url)) {
              preview = url;
              break;
            }
          }
        }
        if (preview) {
          usedQueries.add(q);
          usedPreviews.add(preview);
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
        if (usedQueries.has(q)) continue;
        let preview = "";
        if (Array.isArray(board.previews)) {
          const unused = board.previews.find((p) => p && !usedPreviews.has(p));
          if (unused) preview = unused;
        }
        if (preview) {
          usedQueries.add(q);
          usedPreviews.add(preview);
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
        if (usedQueries.has(q)) continue;
        let preview = "";
        if (Array.isArray(board.previews)) {
          const unused = board.previews.find((p) => p && !usedPreviews.has(p));
          if (unused) preview = unused;
        }
        if (preview) {
          usedQueries.add(q);
          usedPreviews.add(preview);
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
          if (prev && !usedPreviews.has(prev)) {
            usedPreviews.add(prev);
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

  findPreviewForQuery(query, savedPins, exploreData, usedPreviews = new Set()) {
    const cleanQ = query.toLowerCase();

    const matchingSaved = savedPins.find((p) => {
      if (!p || !Array.isArray(p.tags) || !p.previewUrl) return false;
      if (usedPreviews.has(p.previewUrl)) return false;
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
      if (!p || !Array.isArray(p.tags) || !p.previewUrl) return false;
      if (usedPreviews.has(p.previewUrl)) return false;
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
      if (b && Array.isArray(b.previews)) {
        const unused = b.previews.find((url) => url && !usedPreviews.has(url));
        if (unused) return unused;
      }
    }

    if (Array.isArray(exploreData.popularSections)) {
      const s = exploreData.popularSections.find(
        (item) => item.tag && item.tag.toLowerCase().includes(cleanQ)
      );
      if (s && Array.isArray(s.thumbnails)) {
        for (const t of s.thumbnails) {
          const url = typeof t === "string" ? t : (t ? t.url : "");
          if (url && !usedPreviews.has(url)) return url;
        }
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
