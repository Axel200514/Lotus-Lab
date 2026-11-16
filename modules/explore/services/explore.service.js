import { API_CONFIG } from "../../../app/app.config.js?v=6.0";
import { StorageUtils, isCharacterTag, IDEAS_CACHE_KEY } from "../../shared/utils/storage.utils.js?v=6.0";

const CACHE_KEY = "lotus_explore_cache_v33";
const CACHE_TTL_MS = 4 * 60 * 60 * 1000;

export class ExploreService {
  constructor() {
    this.memoryCache = null;
    this.memoryCacheTimestamp = 0;
    this.pendingPromise = null;
    this.ideasMemoryCache = null;
    this.ideasMemoryTimestamp = 0;
    try {
      for (let i = 1; i <= 32; i++) {
        localStorage.removeItem(`lotus_explore_cache_v${i}`);
        if (i <= 31) {
          localStorage.removeItem(`lotus_ideas_cache_v${i}`);
        }
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
          return this.memoryCache || data;
        })
        .catch(() => {
          return this.getStoredCache() || { boards: [], popularSections: [] };
        })
        .finally(() => {
          this.pendingPromise = null;
        });
    }
    return this.pendingPromise;
  }

  getStoredCache() {
    if (this.memoryCache && (!this.memoryCacheTimestamp || Date.now() - this.memoryCacheTimestamp <= CACHE_TTL_MS)) {
      return this.memoryCache;
    }
    this.memoryCache = null;
    this.memoryCacheTimestamp = 0;
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
        this.memoryCacheTimestamp = parsed.timestamp;
        return parsed.data;
      }
      localStorage.removeItem(CACHE_KEY);
      return null;
    } catch {
      return null;
    }
  }

  saveStoredCache(data) {
    const timestamp = Date.now();
    this.memoryCacheTimestamp = timestamp;
    try {
      localStorage.setItem(
        CACHE_KEY,
        JSON.stringify({
          timestamp,
          data
        })
      );
    } catch {}
  }

  isValidPayload(data) {
    return Boolean(data && Array.isArray(data.boards) && data.boards.length >= 4);
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

  needsIdeasRefresh() {
    if (!this.ideasMemoryCache) return true;
    try {
      if (!localStorage.getItem(IDEAS_CACHE_KEY)) return true;
    } catch {}
    return StorageUtils.shouldRefreshIdeas(this.ideasMemoryTimestamp);
  }

  async getIdeasForYou(forceRefresh = false, preloadedExploreData = null) {
    try {
      localStorage.removeItem("lotus_ideas_for_you_cache");
    } catch {}

    if (!forceRefresh) {
      let hasStoredIdeas = false;
      try {
        hasStoredIdeas = Boolean(localStorage.getItem(IDEAS_CACHE_KEY));
      } catch {}

      if (this.ideasMemoryCache && hasStoredIdeas && !StorageUtils.shouldRefreshIdeas(this.ideasMemoryTimestamp)) {
        return this.ideasMemoryCache;
      }
      try {
        const raw = localStorage.getItem(IDEAS_CACHE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && parsed.timestamp && Array.isArray(parsed.data) && parsed.data.length > 0) {
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

    const ideas = await this.buildIdeasForYouPayload(preloadedExploreData);
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

  async buildIdeasForYouPayload(preloadedExploreData = null) {
    const exploreData = preloadedExploreData || (await this.getExploreData());
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
    this.ideasMemoryTimestamp = 0;
    StorageUtils.clearIdeasCache();
  }

  getPinImageUrl(pin) {
    if (!pin || typeof pin !== "object") return "";
    return pin.previewUrl || pin.image || pin.sampleUrl || pin.fullUrl || "";
  }

  pinMatchesQuery(pin, cleanQ) {
    if (!pin || typeof pin !== "object") return false;
    if (Array.isArray(pin.tags)) {
      const hasTag = pin.tags.some((t) => {
        const raw = typeof t === "string" ? t : t.query || t.label;
        return (raw || "").toLowerCase().includes(cleanQ);
      });
      if (hasTag) return true;
    }
    const cleanTitle = (pin.title || "").trim().toLowerCase().replace(/\s+/g, "_");
    if (cleanTitle && cleanTitle.includes(cleanQ)) return true;
    const cleanChar = (pin.character || "").trim().toLowerCase().replace(/\s+/g, "_");
    return Boolean(cleanChar && cleanChar.includes(cleanQ));
  }

  findPreviewForQuery(query, savedPins, exploreData, usedPreviews = new Set()) {
    const cleanQ = query.toLowerCase();

    const matchingSaved = savedPins.find((p) => {
      const img = this.getPinImageUrl(p);
      if (!img || usedPreviews.has(img)) return false;
      return this.pinMatchesQuery(p, cleanQ);
    });
    if (matchingSaved) {
      return this.getPinImageUrl(matchingSaved);
    }

    const viewedPins = StorageUtils.getViewedPins();
    const matchingViewed = viewedPins.find((p) => {
      const img = this.getPinImageUrl(p);
      if (!img || usedPreviews.has(img)) return false;
      return this.pinMatchesQuery(p, cleanQ);
    });
    if (matchingViewed) {
      return this.getPinImageUrl(matchingViewed);
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

  shuffleList(list) {
    const arr = [...list];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
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

    const targetCount = Math.max(6, rawSections.length);
    if (validSections.length < targetCount) {
      const candidates = await this.getReplacementCandidates(existingBoardKeys, seenSectionKeys);
      let cursor = 0;
      while (validSections.length < targetCount && cursor < candidates.length && cursor < 18) {
        const batch = candidates.slice(cursor, cursor + 3);
        cursor += batch.length;
        const settled = await Promise.allSettled(
          batch.map((candTag) => {
            const page = Math.floor(Math.random() * 3) + 1;
            return this.fetchSectionForTag(candTag, page);
          })
        );
        for (const res of settled) {
          if (validSections.length >= targetCount) break;
          if (res.status !== "fulfilled" || !res.value) continue;
          const section = res.value;
          const normTitle = this.normalizeTopicKey(section.title);
          const normTag = this.normalizeTopicKey(section.tag);
          if (!normTitle || existingBoardKeys.has(normTitle) || existingBoardKeys.has(normTag) || seenSectionKeys.has(normTitle)) {
            continue;
          }
          seenSectionKeys.add(normTitle);
          validSections.push(section);
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
    const discoveryCandidates = [];
    const personalCandidates = [];
    const seen = new Set();

    const ideaKeys = new Set();
    try {
      const rawIdeas = localStorage.getItem(IDEAS_CACHE_KEY);
      if (rawIdeas) {
        const parsed = JSON.parse(rawIdeas);
        if (parsed && Array.isArray(parsed.data)) {
          parsed.data.forEach((item) => {
            const kt = this.normalizeTopicKey(item?.title);
            const kq = this.normalizeTopicKey(item?.query);
            if (kt) ideaKeys.add(kt);
            if (kq) ideaKeys.add(kq);
          });
        }
      }
    } catch {}

    const GENERIC_SECTION_NOISE = /^(?:original|multiple_views|comic|4koma|genderswap|photo|skull|meme|artist_name|monochrome|wallpaper)$/i;

    const tryRegister = (rawTag, targetList, skipIdeas = false) => {
      if (!rawTag || typeof rawTag !== "string") return;
      const clean = rawTag.trim().toLowerCase().replace(/\s+/g, "_");
      if (!isCharacterTag(clean) || GENERIC_SECTION_NOISE.test(clean)) return;
      const norm = this.normalizeTopicKey(clean);
      if (!norm || norm.length < 3) return;
      if (existingBoardKeys.has(norm) || seenSectionKeys.has(norm) || seen.has(norm)) return;
      if (skipIdeas && ideaKeys.has(norm)) return;
      seen.add(norm);
      targetList.push(clean);
    };

    try {
      const randomPage = Math.floor(Math.random() * 25) + 1;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);
      const res = await fetch(`${API_CONFIG.safebooruProxyEndpoint}?tags=&page=${randomPage}&limit=50`, {
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

          const highPriority = [];
          const secondary = [];
          for (const [tag, count] of freq.entries()) {
            if (count >= 2 || (tag.includes("(") && tag.includes(")"))) {
              highPriority.push(tag);
            } else {
              secondary.push(tag);
            }
          }
          this.shuffleList(highPriority).forEach((tag) => tryRegister(tag, discoveryCandidates, true));
          this.shuffleList(secondary).forEach((tag) => tryRegister(tag, discoveryCandidates, true));
        }
      }
    } catch {}

    const userTaste = StorageUtils.getUserTasteTags(dynamicKnownTags);
    const rawPersonal = [...userTaste];

    const saved = StorageUtils.getSavedPins();
    saved.forEach((p) => {
      if (p.title) rawPersonal.push(p.title);
      if (Array.isArray(p.tags)) {
        p.tags.forEach((t) => {
          const raw = typeof t === "string" ? t : t.query || t.label;
          if (StorageUtils.isThematicTag(raw, dynamicKnownTags)) rawPersonal.push(raw);
        });
      }
    });

    const viewed = StorageUtils.getViewedPins();
    viewed.forEach((p) => {
      if (p.title) rawPersonal.push(p.title);
      if (Array.isArray(p.tags)) {
        p.tags.forEach((t) => {
          const raw = typeof t === "string" ? t : t.query || t.label;
          if (StorageUtils.isThematicTag(raw, dynamicKnownTags)) rawPersonal.push(raw);
        });
      }
    });

    const searches = StorageUtils.getRecentSearches();
    searches.forEach((s) => {
      if (StorageUtils.isThematicTag(s, dynamicKnownTags)) rawPersonal.push(s);
    });

    this.shuffleList(rawPersonal).forEach((tag) => tryRegister(tag, personalCandidates, false));

    return [...discoveryCandidates, ...personalCandidates];
  }

  async fetchSectionForTag(tag, page = 1) {
    try {
      const fetchPosts = async (targetPage) => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);
        const res = await fetch(`${API_CONFIG.safebooruProxyEndpoint}?tags=${encodeURIComponent(tag)}&page=${targetPage}&limit=16`, {
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (!res.ok) return [];
        const data = await res.json();
        return Array.isArray(data) ? data : [];
      };

      let posts = await fetchPosts(page);
      if (posts.length < 4 && page > 1) {
        posts = await fetchPosts(1);
      }
      if (!Array.isArray(posts) || posts.length < 4) return null;

      const extractHash = (p, url) => {
        if (p && p.hash) return String(p.hash).toLowerCase();
        const m = (url || "").match(/([a-f0-9]{32})/i);
        return m ? m[1].toLowerCase() : (url ? url.split("/").pop().toLowerCase() : String(p.id));
      };

      const extractSourceId = (src) => {
        if (!src) return "";
        const m = src.match(/(?:status\/|illust_id=|\/artworks\/)(\d+)/i);
        return m ? m[1] : "";
      };

      const seenHashes = new Set();
      const seenSources = new Set();
      const acceptedArtworks = [];
      const thumbnails = [];

      for (const p of posts) {
        const url = p.sample_url || p.preview_url || p.file_url;
        if (!url || /\.(gif|mp4|webm)$/i.test(url)) continue;
        const hash = extractHash(p, url);
        if (seenHashes.has(hash)) continue;

        const sourceId = extractSourceId(p.source);
        if (sourceId && seenSources.has(sourceId)) continue;

        const w = Number(p.sample_width || p.width) || 240;
        const h = Number(p.sample_height || p.height) || 320;
        const ratio = w / Math.max(1, h);
        const tags = (p.tags || "").split(" ").filter(Boolean);

        let isDuplicate = false;
        for (const accepted of acceptedArtworks) {
          if (Math.abs(accepted.ratio - ratio) < 0.015) {
            let shared = 0;
            for (const t of tags) {
              if (accepted.tags.has(t)) shared++;
            }
            if (shared >= 8 || shared / Math.max(1, Math.min(tags.length, accepted.tags.size)) > 0.6) {
              isDuplicate = true;
              break;
            }
          }
        }
        if (isDuplicate) continue;

        seenHashes.add(hash);
        if (sourceId) seenSources.add(sourceId);
        acceptedArtworks.push({ ratio, tags: new Set(tags) });
        thumbnails.push({
          url,
          width: w,
          height: h
        });
        if (thumbnails.length >= 6) break;
      }

      if (thumbnails.length < 4) return null;

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
