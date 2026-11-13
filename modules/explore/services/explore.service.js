import { API_CONFIG } from "../../../app/app.config.js?v=5.0";
import { StorageUtils, isCharacterTag } from "../../shared/utils/storage.utils.js?v=5.0";

const CACHE_KEY = "lotus_explore_cache_v24";
const CACHE_TTL_MS = 8 * 60 * 60 * 1000;

const IDEAS_CACHE_KEY = "lotus_ideas_cache_v24";
const IDEAS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export class ExploreService {
  constructor() {
    this.memoryCache = null;
    this.pendingPromise = null;
    this.ideasMemoryCache = null;
    try {
      for (let i = 1; i <= 23; i++) {
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
        if (this.isSanitized(cached)) {
          this.memoryCache = cached;
          return cached;
        }
        const sanitized = await this.sanitizeExploreData(cached);
        this.saveStoredCache(sanitized);
        this.memoryCache = sanitized;
        return sanitized;
      }
    }

    if (!this.pendingPromise) {
      this.pendingPromise = this.fetchExploreData()
        .then(async (data) => {
          if (this.isValidPayload(data)) {
            const sanitized = await this.sanitizeExploreData(data);
            this.saveStoredCache(sanitized);
            this.memoryCache = sanitized;
            return sanitized;
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

  notifyPinSaved() {
    StorageUtils.notifyTasteDirty();
  }

  async getIdeasForYou(forceRefresh = false) {
    try {
      localStorage.removeItem("lotus_ideas_for_you_cache");
    } catch {}

    if (!forceRefresh) {
      if (this.ideasMemoryCache && !StorageUtils.shouldRefreshIdeas(this.ideasMemoryTimestamp)) {
        return this.ideasMemoryCache;
      }
      try {
        const raw = localStorage.getItem(IDEAS_CACHE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && parsed.timestamp && Array.isArray(parsed.data) && parsed.data.length >= 5) {
            if (!StorageUtils.shouldRefreshIdeas(parsed.timestamp)) {
              this.ideasMemoryCache = parsed.data;
              this.ideasMemoryTimestamp = parsed.timestamp;
              return parsed.data;
            }
          }
          localStorage.removeItem(IDEAS_CACHE_KEY);
        }
      } catch {}
    }

    const ideas = await this.buildIdeasForYouPayload();
    this.ideasMemoryCache = ideas;
    this.ideasMemoryTimestamp = Date.now();
    StorageUtils.resetTasteDirty();
    try {
      localStorage.setItem(
        IDEAS_CACHE_KEY,
        JSON.stringify({
          timestamp: this.ideasMemoryTimestamp,
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
        if (isCharacterTag(titleTag)) {
          tagOccurrences.set(titleTag, (tagOccurrences.get(titleTag) || 0) + 2);
        }
      }
      if (Array.isArray(p.tags)) {
        p.tags.forEach((t) => {
          const raw = typeof t === "string" ? t : t.query || t.label;
          if (!raw) return;
          const clean = raw.trim().toLowerCase();
          if (isCharacterTag(clean)) {
            tagOccurrences.set(clean, (tagOccurrences.get(clean) || 0) + 1);
          }
        });
      }
    });

    const recurringTags = [...tagOccurrences.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([tag]) => tag);

    const dynamicKnownTags = new Set([
      ...(exploreData.boards || []).map((b) => (b.tag || "").toLowerCase()),
      ...(exploreData.popularSections || []).map((s) => (s.tag || "").toLowerCase()),
      ...recentSearches
        .map((s) => (s || "").trim().toLowerCase().replace(/\s+/g, "_"))
        .filter(isCharacterTag),
      ...savedPins.flatMap((p) => [
        (p.title || "").trim().toLowerCase().replace(/\s+/g, "_"),
        ...(Array.isArray(p.tags) ? p.tags.map((t) => (typeof t === "string" ? t : t.query || t.label || "").trim().toLowerCase().replace(/\s+/g, "_")) : [])
      ]).filter(isCharacterTag),
      ...recurringTags
    ]);
    const userTasteTags = StorageUtils.getUserTasteTags(dynamicKnownTags);

    const selectedTopics = [];
    const usedQueries = new Set();
    const usedPreviews = new Set();

    const userCandidates = userTasteTags;
    for (const term of userCandidates) {
      const clean = (term || "").trim();
      if (!clean || /^\(?series\)?$/i.test(clean)) continue;
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

  normalizeTopicKey(str) {
    return String(str || "")
      .toLowerCase()
      .replace(/&#039;/g, "'")
      .replace(/&amp;/g, "&")
      .replace(/\([^)]*\)/g, "")
      .replace(/[^a-z0-9]/g, "");
  }

  isSanitized(data) {
    if (!this.isValidPayload(data)) return false;
    if (!Array.isArray(data.popularSections) || data.popularSections.length < 4) return false;
    const existingBoardKeys = new Set(
      (data.boards || []).flatMap((b) => [this.normalizeTopicKey(b.title), this.normalizeTopicKey(b.tag)]).filter(Boolean)
    );
    const seen = new Set();
    for (const s of data.popularSections) {
      if (!s || !Array.isArray(s.thumbnails) || s.thumbnails.length < 4) return false;
      const normTitle = this.normalizeTopicKey(s.title);
      const normTag = this.normalizeTopicKey(s.tag);
      if (existingBoardKeys.has(normTitle) || existingBoardKeys.has(normTag)) return false;
      if (seen.has(normTitle)) return false;
      seen.add(normTitle);
    }
    return true;
  }

  async sanitizeExploreData(data) {
    if (!data || !Array.isArray(data.boards)) return data;
    const boards = data.boards;
    const rawSections = Array.isArray(data.popularSections) ? data.popularSections : [];

    const existingBoardKeys = new Set(
      boards.flatMap((b) => [this.normalizeTopicKey(b.title), this.normalizeTopicKey(b.tag)]).filter(Boolean)
    );

    const seenSectionKeys = new Set();
    const validSections = [];

    rawSections.forEach((s) => {
      if (!s || !Array.isArray(s.thumbnails) || s.thumbnails.length < 4) return;
      const normTitle = this.normalizeTopicKey(s.title);
      const normTag = this.normalizeTopicKey(s.tag);
      if (existingBoardKeys.has(normTitle) || existingBoardKeys.has(normTag)) return;
      if (seenSectionKeys.has(normTitle)) return;
      seenSectionKeys.add(normTitle);
      validSections.push(s);
    });

    const targetCount = Math.max(4, rawSections.length);
    if (validSections.length < targetCount) {
      const candidates = await this.getReplacementCandidates(existingBoardKeys, seenSectionKeys);
      for (const candTag of candidates) {
        if (validSections.length >= targetCount) break;
        const normCand = this.normalizeTopicKey(candTag);
        if (existingBoardKeys.has(normCand) || seenSectionKeys.has(normCand)) continue;

        const replacementSection = await this.fetchSectionForTag(candTag);
        if (replacementSection && replacementSection.thumbnails.length >= 4) {
          seenSectionKeys.add(normCand);
          validSections.push(replacementSection);
        }
      }
    }

    return {
      ...data,
      popularSections: validSections
    };
  }

  async getReplacementCandidates(existingBoardKeys, seenSectionKeys) {
    const dynamicKnownTags = new Set([...existingBoardKeys, ...seenSectionKeys]);
    const candidates = [];
    const seen = new Set();

    const addCand = (rawTag) => {
      if (!rawTag || typeof rawTag !== "string") return;
      const clean = rawTag.trim().toLowerCase().replace(/\s+/g, "_");
      if (!isCharacterTag(clean)) return;
      const norm = this.normalizeTopicKey(clean);
      if (existingBoardKeys.has(norm) || seenSectionKeys.has(norm) || seen.has(norm)) return;
      seen.add(norm);
      candidates.push(clean);
    };

    const userTaste = StorageUtils.getUserTasteTags(dynamicKnownTags);
    userTaste.forEach(addCand);

    const saved = StorageUtils.getSavedPins();
    saved.forEach((p) => {
      if (p.title) addCand(p.title);
      if (Array.isArray(p.tags)) {
        p.tags.forEach((t) => {
          const raw = typeof t === "string" ? t : t.query || t.label;
          if (StorageUtils.isThematicTag(raw, dynamicKnownTags)) addCand(raw);
        });
      }
    });

    const viewed = StorageUtils.getViewedPins();
    viewed.forEach((p) => {
      if (p.title) addCand(p.title);
      if (Array.isArray(p.tags)) {
        p.tags.forEach((t) => {
          const raw = typeof t === "string" ? t : t.query || t.label;
          if (StorageUtils.isThematicTag(raw, dynamicKnownTags)) addCand(raw);
        });
      }
    });

    const searches = StorageUtils.getRecentSearches();
    searches.forEach((s) => {
      if (StorageUtils.isThematicTag(s, dynamicKnownTags)) addCand(s);
    });

    if (candidates.length < 5) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);
        const res = await fetch(`${API_CONFIG.safebooruProxyEndpoint}?tags=&limit=25`, {
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (res.ok) {
          const posts = await res.json();
          const freq = new Map();
          if (Array.isArray(posts)) {
            posts.forEach((p) => {
              (p.tags || "").split(" ").forEach((t) => {
                const clean = t.trim().toLowerCase();
                if (StorageUtils.isThematicTag(clean, dynamicKnownTags)) {
                  freq.set(clean, (freq.get(clean) || 0) + 1);
                }
              });
            });
            [...freq.entries()]
              .sort((a, b) => b[1] - a[1])
              .forEach(([tag]) => addCand(tag));
          }
        }
      } catch {}
    }

    return candidates;
  }

  async fetchSectionForTag(tag) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);
      const res = await fetch(`${API_CONFIG.safebooruProxyEndpoint}?tags=${encodeURIComponent(tag)}&limit=6`, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (!res.ok) return null;
      const posts = await res.json();
      if (!Array.isArray(posts) || posts.length < 4) return null;
      const thumbnails = posts.map((p) => ({
        url: p.sample_url || p.preview_url,
        width: p.sample_width || p.width || 240,
        height: p.sample_height || p.height || 320
      }));
      return {
        id: `pop-rep-${Date.now()}-${tag.replace(/[^a-z0-9]/gi, "_")}`,
        title: this.formatTitle(tag),
        tag: tag,
        query: tag,
        thumbnails: thumbnails
      };
    } catch {
      return null;
    }
  }
}
