import { API_CONFIG } from "../../../app/app.config.js?v=5.0";
import { PinModel } from "../../shared/models/pin.model.js?v=5.0";
import { StorageUtils, isCharacterTag } from "../../shared/utils/storage.utils.js?v=5.0";

export class PinService {
  constructor() {
    this.cache = new Map();
    this.translationCache = new Map();
    this.tagResolutionCache = new Map();
    this.sessionSeenIds = new Set();
    this.sessionSeenArtworks = new Set();
    this.resetSession();
  }

  resetSession() {
    this.sessionOffset = Math.floor(Math.random() * 1500) + 1;
    this.sessionSeenIds = StorageUtils.getFeedSeenIds();
    this.sessionSeenArtworks = new Set();
    this.resetTopicSession();
    this.resetSearchSession();
    if (this.cache) {
      this.cache.clear();
    }
  }

  resetTopicSession() {
    this.topicOffset = Math.floor(Math.random() * 15);
  }

  resetSearchSession() {
    this.searchOffset = Math.floor(Math.random() * 4);
  }

  normalizeQuery(q) {
    const clean = (q || "").trim().toLowerCase();
    if (!clean) return "";

    const xFixed = clean.replace(/([a-z0-9]+)\s*x\s*([a-z0-9]+)/gi, (m, g1, g2) => `${g1}_x_${g2}`);
    if (xFixed !== clean) {
      return xFixed.replace(/[\s-]+/g, "_");
    }

    if (/\(series\)$/i.test(clean) || /_series$/i.test(clean) || /\s+series$/i.test(clean)) {
      const base = clean.replace(/[\s_]*\(?series\)?$/i, "").trim().replace(/[\s-]+/g, "_");
      if (base) return `${base}_(series)`;
    }

    return clean.replace(/[\s-]+/g, "_");
  }

  toSingular(word) {
    if (!word) return "";
    if (word.endsWith("ies") && word.length > 4) return word.slice(0, -3) + "y";
    if (word.endsWith("es") && !word.endsWith("les") && word.length > 4) return word.slice(0, -2);
    if (word.endsWith("s") && !word.endsWith("ss") && word.length > 3) return word.slice(0, -1);
    return word;
  }

  async translateQuery(query) {
    const clean = (query || "").trim().toLowerCase();
    if (!clean) return "";

    if (this.translationCache.has(clean)) {
      return this.translationCache.get(clean);
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=es&tl=en&dt=t&q=${encodeURIComponent(clean)}`;
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (res.ok) {
        const text = await res.text();
        const data = JSON.parse(text);
        if (data && data[0]) {
          const raw = data[0].map((s) => s[0]).join("").replace(/[.,/#!$%^&*;:{}=`~()]/g, "").trim().toLowerCase();
          if (raw) {
            this.translationCache.set(clean, raw);
            return raw;
          }
        }
      }
    } catch {}

    this.translationCache.set(clean, clean);
    return clean;
  }

  buildTagCandidates(translated) {
    const clean = (translated || "").trim().toLowerCase();
    if (!clean) return [];

    const candidates = new Set();
    const tokens = clean.split(/[\s_]+/).filter(Boolean);
    const underscored = tokens.join("_");
    const spaced = tokens.join(" ");

    candidates.add(underscored);
    if (spaced !== underscored) {
      candidates.add(spaced);
    }

    const singularTokens = tokens.map((t) => this.toSingular(t));
    const singularUnderscored = singularTokens.join("_");
    const singularSpaced = singularTokens.join(" ");

    if (singularUnderscored !== underscored) {
      candidates.add(singularUnderscored);
    }
    if (singularSpaced !== spaced && singularSpaced !== singularUnderscored) {
      candidates.add(singularSpaced);
    }

    const wildcard = tokens.map((t) => (t.endsWith("*") ? t : `${t}*`)).join(" ");
    candidates.add(wildcard);
    candidates.add(`${underscored}_(series)`);
    candidates.add(`${underscored}_(game)`);
    candidates.add(`${underscored}_(anime)`);

    if (tokens.length > 1) {
      for (const t of tokens) {
        if (t.length >= 3 && !["and", "the", "with", "for", "from"].includes(t)) {
          candidates.add(t);
        }
      }
    }

    return Array.from(candidates);
  }

  isSpanish(text) {
    return /[áéíóúüñ]/i.test(text || "");
  }

  async translateToRomaji(text) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=ja&dt=t&dt=rm&q=${encodeURIComponent(text)}`;
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (res.ok) {
        const data = await res.json();
        const romaji = data[0]?.find((item) => item && item[2])?.[2] || "";
        return romaji.toLowerCase().replace(/[^\w\s]/g, " ").trim();
      }
    } catch {}
    return "";
  }

  extractSignificantTokens(query) {
    return (query || "")
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 2);
  }

  buildSearchCandidates(raw) {
    const clean = (raw || "").trim().toLowerCase();
    const candidates = new Set();

    const normalized = this.normalizeQuery(clean);
    if (normalized) {
      candidates.add(normalized);
      candidates.add(normalized.replace(/[\s-]+/g, "_"));
    }

    if (/\(series\)$/i.test(clean) || /_series$/i.test(clean) || /\s+series$/i.test(clean)) {
      const base = clean.replace(/[\s_]*\(?series\)?$/i, "").trim().replace(/[\s-]+/g, "_");
      if (base) {
        candidates.add(`${base}_(series)`);
        candidates.add(base);
        candidates.add(`${base}_(anime)`);
        candidates.add(`${base}_(game)`);
      }
    }

    const xFixed = clean.replace(/([a-z0-9]+)\s*x\s*([a-z0-9]+)/gi, (m, g1, g2) => `${g1}_x_${g2}`);
    if (xFixed !== clean) {
      candidates.add(xFixed);
      candidates.add(xFixed.replace(/[\s-]+/g, "_"));
    }

    const words = clean.split(/[\s_-]+/).filter(Boolean);
    const underscored = words.join("_");
    candidates.add(underscored);
    candidates.add(clean);

    if (words.length === 2 && !clean.includes("series")) {
      candidates.add(`${words[1]}_${words[0]}`);
    }

    return Array.from(candidates);
  }

  extractParenFranchise(items) {
    if (!Array.isArray(items) || items.length === 0) return null;
    for (const item of items) {
      const rawTags = typeof item.tags === "string" ? item.tags.split(/\s+/) : Array.isArray(item.tags) ? item.tags : [];
      for (const tag of rawTags) {
        const match = tag.match(/\(([^)]+)\)$/);
        if (match && match[1] && !match[1].match(/cosplay|style|medium|mtf/i)) {
          return match[1];
        }
      }
    }
    return null;
  }

  async resolveFranchiseFromCharacterPost(items) {
    if (!Array.isArray(items) || items.length === 0) return null;
    const candidateTags = [];
    for (const post of items) {
      const rawTags = typeof post.tags === "string" ? post.tags.split(/\s+/) : Array.isArray(post.tags) ? post.tags : [];
      for (const tag of rawTags) {
        if (tag.includes("_") && !tag.match(/hair|eyes|skin|clothes|shirt|dress|skirt|solo|highres|looking|smile/)) {
          candidateTags.push(tag);
        }
      }
    }
    for (const c of candidateTags.slice(0, 4)) {
      const data = await this.executeSafebooruFetch(c, 1, 3);
      for (const p of data) {
        const pTags = typeof p.tags === "string" ? p.tags.split(/\s+/) : Array.isArray(p.tags) ? p.tags : [];
        for (const t of pTags) {
          if (t.endsWith("_(series)") || t.endsWith("_(anime)") || t.endsWith("_(game)") || t.endsWith("_(manga)") || t.endsWith("_(novel)")) {
            return t;
          }
        }
      }
    }
    return null;
  }

  findBestAlternativeTag(items, tokens, currentTag) {
    if (!Array.isArray(items) || items.length === 0 || !tokens || tokens.length === 0) return null;
    const tagScores = new Map();
    const cleanCurrent = (currentTag || "").trim().toLowerCase();

    for (const item of items) {
      const rawTags = typeof item.tags === "string" ? item.tags.split(/\s+/) : Array.isArray(item.tags) ? item.tags : [];
      for (const tag of rawTags) {
        const cleanTag = (tag || "").trim().toLowerCase();
        if (!cleanTag || cleanTag.length < 3 || cleanTag === cleanCurrent) continue;
        if (!isCharacterTag(cleanTag)) continue;

        let matches = 0;
        for (const token of tokens) {
          if (cleanTag.includes(token)) {
            matches++;
          }
        }

        const isFranchise = cleanTag.endsWith("_(series)") || cleanTag.endsWith("_(anime)") || cleanTag.endsWith("_(game)") || cleanTag.endsWith("_(manga)");
        if (tokens.length >= 2 && matches < 2 && !isFranchise) continue;

        if (matches > 0) {
          let score = matches * 10;
          if (matches === tokens.length) score += 50;
          if (isFranchise) score += 35;
          tagScores.set(cleanTag, (tagScores.get(cleanTag) || 0) + score);
        }
      }
    }

    if (tagScores.size === 0) return null;
    const sorted = Array.from(tagScores.entries()).sort((a, b) => b[1] - a[1]);
    return sorted[0] ? sorted[0][0] : null;
  }

  async executeSafebooruFetch(tag, page = 1, limit = API_CONFIG.defaultLimit, retryCount = 2, signal = null) {
    const cleanTag = (tag || "").trim();
    const url = `${API_CONFIG.safebooruProxyEndpoint}?tags=${encodeURIComponent(cleanTag)}&page=${page}&limit=${limit}`;
    for (let attempt = 0; attempt <= retryCount; attempt++) {
      if (signal && signal.aborted) return [];
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 9500);
        const onAbort = () => controller.abort();
        if (signal) {
          signal.addEventListener("abort", onAbort, { once: true });
        }
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (signal) {
          signal.removeEventListener("abort", onAbort);
        }

        if (res.ok) {
          const text = await res.text();
          const safeText = (text || "").trim();
          if (safeText.startsWith("[")) {
            const data = JSON.parse(safeText);
            if (Array.isArray(data)) {
              return data;
            }
          }
        }
      } catch {}
    }
    return [];
  }

  async getPins(query = "", page = 1, limit = API_CONFIG.defaultLimit) {
    const cleanQuery = query.trim().toLowerCase();
    const cacheKey = `${cleanQuery}_${page}_${limit}`;

    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    let result;
    if (cleanQuery && cleanQuery.length >= 2) {
      result = await this.searchPins(cleanQuery, page, limit);
    } else {
      result = await this.getFeedPins(page, limit);
    }

    if (result && Array.isArray(result.pins) && result.pins.length > 0) {
      this.cache.set(cacheKey, result);
    }

    return result;
  }

  async getPinById(pinId) {
    const cleanId = String(pinId || "").replace(/^sb_/, "").trim();
    if (!cleanId) return null;

    const cacheKey = `pin_${cleanId}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const url = `${API_CONFIG.safebooruProxyEndpoint}?tags=id:${encodeURIComponent(cleanId)}&limit=1`;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (res.ok) {
        const text = await res.text();
        const safeText = (text || "").trim();
        if (safeText.startsWith("[")) {
          const data = JSON.parse(safeText);
          if (Array.isArray(data) && data.length > 0) {
            const pin = PinModel.fromSafebooru(data[0]);
            this.cache.set(cacheKey, pin);
            return pin;
          }
        }
      }
    } catch {}

    return null;
  }

  async getFeedPins(page = 1, limit = API_CONFIG.defaultLimit, signal = null) {
    const targetPage = page + this.sessionOffset;
    const list = await this.fetchSafebooru("", targetPage, limit, signal);
    const seen = new Set();
    const seenArtworks = new Set();
    const combined = [];
    const feedSeen = StorageUtils.getFeedSeenIds();

    for (const item of list) {
      if (!item || !item.id) continue;
      const artKey = item.artworkKey || item.id;
      if (
        !this.sessionSeenIds.has(item.id) && !this.sessionSeenArtworks.has(artKey) && !feedSeen.has(item.id) && !seen.has(item.id)
      ) {
        seen.add(item.id);
        this.sessionSeenArtworks.add(artKey);
        this.sessionSeenIds.add(item.id);
        combined.push(item);
      }
    }

    if (combined.length < limit) {
      const fallback = await this.fetchSafebooru("", targetPage + 1, limit, signal);
      for (const item of fallback) {
        if (!item || !item.id) continue;
        const artKey = item.artworkKey || item.id;
        if (
          !this.sessionSeenIds.has(item.id) && !this.sessionSeenArtworks.has(artKey) && !feedSeen.has(item.id) && !seen.has(item.id)
        ) {
          seen.add(item.id);
          this.sessionSeenArtworks.add(artKey);
          this.sessionSeenIds.add(item.id);
          combined.push(item);
          if (combined.length >= limit) break;
        }
      }
    }

    if (combined.length === 0) {
      const emergency = await this.fetchSafebooru("", 1, limit, signal);
      for (const item of emergency) {
        if (!item || !item.id) continue;
        const artKey = item.artworkKey || item.id;
        if (!seen.has(item.id) && !seenArtworks.has(artKey)) {
          seen.add(item.id);
          this.sessionSeenArtworks.add(artKey);
          combined.push(item);
        }
      }
    }

    return {
      pins: this.shuffle(combined),
      hasNextPage: true,
      totalPages: 99
    };
  }

  async searchPins(query, page = 1, limit = API_CONFIG.defaultLimit, signal = null) {
    const safebooruResults = await this.fetchSafebooru(query, page, limit, signal);
    const seenArtworks = new Set();
    const filtered = [];
    for (const item of safebooruResults) {
      if (!item || !item.id) continue;
      const artKey = item.artworkKey || item.id;
      if (!seenArtworks.has(artKey)) {
        seenArtworks.add(artKey);
        filtered.push(item);
      }
    }
    const pins = this.shuffle(filtered);

    return {
      pins,
      hasNextPage: safebooruResults.length >= limit,
      totalPages: 25
    };
  }

  async getTopicPins(topic, page = 1, limit = API_CONFIG.defaultLimit, signal = null) {
    const cleanTopic = (topic || "").trim().toLowerCase();
    const cacheKey = `topic_${cleanTopic}_${page}_${limit}`;

    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const results = await this.fetchSafebooru(cleanTopic, page, limit, signal);
    const seenArtworks = new Set();
    const filtered = [];
    for (const item of results) {
      if (!item || !item.id) continue;
      const artKey = item.artworkKey || item.id;
      if (!seenArtworks.has(artKey)) {
        seenArtworks.add(artKey);
        filtered.push(item);
      }
    }
    const pins = this.shuffle(filtered);

    const result = {
      pins,
      hasNextPage: results.length >= limit,
      totalPages: 25
    };

    if (pins.length > 0) {
      this.cache.set(cacheKey, result);
    }

    return result;
  }

  async fetchSafebooru(query, page, limit, signal = null) {
    let raw = (query || "").trim().toLowerCase();
    if (!raw) {
      const data = await this.executeSafebooruFetch("", page, limit, 2, signal);
      return data.map((item) => PinModel.fromSafebooru(item));
    }

    if (this.tagResolutionCache.has(raw)) {
      const resolvedTag = this.tagResolutionCache.get(raw);
      const data = await this.executeSafebooruFetch(resolvedTag, page, limit, 2, signal);
      if (signal && signal.aborted) {
        return [];
      }
      if (data.length > 0) {
        return data.map((item) => PinModel.fromSafebooru(item));
      }
      return [];
    }

    if (page > 1) {
      const norm = this.normalizeQuery(raw) || raw;
      const data = await this.executeSafebooruFetch(norm, page, limit, 2, signal);
      return data.map((item) => PinModel.fromSafebooru(item));
    }

    let fallbackBatch = null;
    const normalized = this.normalizeQuery(raw);
    if (normalized && normalized !== raw) {
      if (this.tagResolutionCache.has(normalized)) {
        const cachedTag = this.tagResolutionCache.get(normalized);
        const data = await this.executeSafebooruFetch(cachedTag, page, limit, 2, signal);
        if (data.length > 0) {
          this.tagResolutionCache.set(raw, cachedTag);
          return data.map((item) => PinModel.fromSafebooru(item));
        }
      }

      const normData = await this.executeSafebooruFetch(normalized, page, limit, 2, signal);
      if (normData.length >= 16) {
        this.tagResolutionCache.set(raw, normalized);
        return normData.map((item) => PinModel.fromSafebooru(item));
      }
      if (normData.length > 0) {
        fallbackBatch = { tag: normalized, data: normData };
      }
    }

    if (this.isSpanish(raw)) {
      const trans = await this.translateQuery(raw);
      if (trans && trans !== raw) {
        if (trans === "anime girl") raw = "1girl";
        else if (trans === "wallpaper") raw = "wallpaper";
        else raw = trans;
      }
    }

    const tokens = this.extractSignificantTokens(raw);
    const directCandidates = this.buildSearchCandidates(raw);

    const uniqueCandidates = Array.from(new Set(directCandidates.filter(Boolean)));
    if (uniqueCandidates.length > 0) {
      const primaryBatch = uniqueCandidates.slice(0, 3);
      const batchResults = await Promise.allSettled(
        primaryBatch.map((candidateTag) => this.executeSafebooruFetch(candidateTag, page, limit, 2, signal))
      );

      const seenIds = new Set();
      const mergedItems = [];
      let bestTag = primaryBatch[0];
      let bestCount = 0;

      batchResults.forEach((res, idx) => {
        if (res.status === "fulfilled" && Array.isArray(res.value)) {
          const candidateTag = primaryBatch[idx];
          if (res.value.length > bestCount) {
            bestCount = res.value.length;
            bestTag = candidateTag;
          }
          for (const item of res.value) {
            if (item && item.id && !seenIds.has(item.id)) {
              seenIds.add(item.id);
              mergedItems.push(item);
            }
          }
        }
      });

      if (mergedItems.length > 0) {
        this.tagResolutionCache.set(raw, bestTag);
        return mergedItems.slice(0, limit).map((item) => PinModel.fromSafebooru(item));
      }

      for (const directTag of uniqueCandidates.slice(3)) {
        const data = await this.executeSafebooruFetch(directTag, page, limit, 2, signal);
        if (signal && signal.aborted) return [];
        if (data.length > 0) {
          this.tagResolutionCache.set(raw, directTag);
          return data.map((item) => PinModel.fromSafebooru(item));
        }
      }
    }

    if (tokens.length > 0) {
      for (const token of tokens) {
        const wildTag = `${token}*`;
        const wildData = await this.executeSafebooruFetch(wildTag, 1, 10, 2, signal);
        if (signal && signal.aborted) return [];
        if (wildData.length > 0) {
          const altTag = this.findBestAlternativeTag(wildData, tokens, directCandidates[0]);
          if (altTag) {
            const altData = await this.executeSafebooruFetch(altTag, page, limit, 2, signal);
            if (altData.length > 0) {
              this.tagResolutionCache.set(raw, altTag);
              return altData.map((item) => PinModel.fromSafebooru(item));
            }
          }
          const parenFranchise = this.extractParenFranchise(wildData);
          if (parenFranchise && tokens.some((t) => parenFranchise.toLowerCase().includes(t))) {
            const pData = await this.executeSafebooruFetch(parenFranchise, page, limit, 2, signal);
            if (pData.length > 0) {
              this.tagResolutionCache.set(raw, parenFranchise);
              return pData.map((item) => PinModel.fromSafebooru(item));
            }
          }
        }
      }
    }

    const romaji = await this.translateToRomaji(raw);
    if (romaji) {
      const romajiTag = romaji.replace(/\s+/g, "_");
      const rData = await this.executeSafebooruFetch(romajiTag, page, limit, 2, signal);
      if (rData.length > 0) {
        this.tagResolutionCache.set(raw, romajiTag);
        return rData.map((item) => PinModel.fromSafebooru(item));
      }
    }

    const translated = await this.translateQuery(raw);
    const candidates = this.buildTagCandidates(translated);

    for (const tag of candidates) {
      const data = await this.executeSafebooruFetch(tag, page, limit, 2, signal);
      if (data.length > 0) {
        this.tagResolutionCache.set(raw, tag);
        return data.map((item) => PinModel.fromSafebooru(item));
      }
    }

    if (fallbackBatch && Array.isArray(fallbackBatch.data) && fallbackBatch.data.length > 0) {
      this.tagResolutionCache.set(raw, fallbackBatch.tag);
      return fallbackBatch.data.map((item) => PinModel.fromSafebooru(item));
    }

    return [];
  }

  determinePinAnchors(pin) {
    const cleanTags = (pin.tags || [])
      .map((t) => (typeof t === "object" && t.query ? t.query : t || "").trim().toLowerCase().replace(/\s+/g, "_"))
      .filter(isCharacterTag);

    const characterTags = [];
    const seriesTags = [];
    const themeTags = [];

    if (pin.character) {
      const c = pin.character.trim().toLowerCase().replace(/\s+/g, "_");
      if (isCharacterTag(c)) {
        characterTags.push(c);
      }
    }

    const titleNormalized = (pin.title || "")
      .replace(/&#039;/g, "'")
      .replace(/&amp;/g, "&")
      .trim();

    const titleMatch = titleNormalized.match(/^(.+?)\s*\(([^)]+)\)$/);
    if (titleMatch) {
      const c = titleMatch[1].trim().toLowerCase().replace(/\s+/g, "_");
      const s = titleMatch[2].trim().toLowerCase().replace(/\s+/g, "_");
      if (isCharacterTag(c) && !characterTags.includes(c)) characterTags.push(c);
      if (isCharacterTag(s) && !seriesTags.includes(s)) seriesTags.push(s);
    } else if (titleNormalized && !titleNormalized.includes("Illustration") && !titleNormalized.includes("Digital Artist")) {
      const c = titleNormalized.toLowerCase().replace(/\s+/g, "_");
      if (isCharacterTag(c) && !characterTags.includes(c)) {
        characterTags.push(c);
      }
    }

    for (const t of cleanTags) {
      if (t.includes("(") && t.includes(")")) {
        if (!characterTags.includes(t)) characterTags.push(t);
        const match = t.match(/\(([^)]+)\)/);
        if (match && match[1] && !seriesTags.includes(match[1])) {
          seriesTags.push(match[1]);
        }
      } else if (characterTags.includes(t)) {
        continue;
      } else if (t.includes("_")) {
        themeTags.push(t);
      }
    }

    let primaryArtist = null;
    if (
      pin.author &&
      !pin.author.includes("Digital Artist") &&
      !pin.author.includes("Visual Artist") &&
      !pin.author.includes("Pixiv Artist") &&
      !pin.author.includes("Artista Digital") &&
      !pin.author.includes("Artista Visual")
    ) {
      const cleanArtist = pin.author.replace(/^@/, "").trim().toLowerCase();
      if (cleanArtist && cleanArtist !== "pixiv" && cleanArtist !== "danbooru" && isCharacterTag(cleanArtist)) {
        primaryArtist = cleanArtist;
      }
    }

    const anchorsPool = [...characterTags, ...seriesTags, ...themeTags];
    if (primaryArtist && !anchorsPool.includes(primaryArtist)) {
      anchorsPool.push(primaryArtist);
    }

    return {
      primarySeries: seriesTags[0] || null,
      primaryCharacter: characterTags[0] || null,
      primaryArtist: primaryArtist,
      allAnchors: anchorsPool
    };
  }

  async getRelatedPins(pin, page = 1, limit = 8, excludeIds = null) {
    if (!pin) return [];

    const cacheKey = `rel_${pin.id}_${page}_${limit}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const anchors = this.determinePinAnchors(pin);
    const results = [];
    const collectedIds = new Set(excludeIds ? [...excludeIds] : []);
    collectedIds.add(pin.id);

    const queryTags = [];
    if (anchors.primaryCharacter && anchors.primarySeries) {
      queryTags.push(`${anchors.primaryCharacter}+${anchors.primarySeries}`);
    }
    if (anchors.primaryCharacter) {
      queryTags.push(anchors.primaryCharacter);
    }
    if (anchors.primarySeries && !queryTags.includes(anchors.primarySeries)) {
      queryTags.push(anchors.primarySeries);
    }
    for (const a of anchors.allAnchors) {
      if (!queryTags.includes(a)) {
        queryTags.push(a);
      }
    }

    const fetchAmount = Math.max(12, limit * 2);

    for (let i = 0; i < queryTags.length; i++) {
      if (results.length >= limit) break;
      const tag = queryTags[i];
      const clean = tag.replace(/\s+/g, "_").replace(/[*]+/g, "");
      const targetPage = Math.max(0, page - 1);
      const url = `${API_CONFIG.safebooruProxyEndpoint}?tags=${encodeURIComponent(clean)}&page=${targetPage}&limit=${fetchAmount}`;

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4500);
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (res.ok) {
          const text = await res.text();
          const safeText = (text || "").trim();
          if (safeText.startsWith("[")) {
            const data = JSON.parse(safeText);
            if (Array.isArray(data) && data.length > 0) {
              const mapped = data.map((item) => PinModel.fromSafebooru(item));
              for (const item of mapped) {
                if (!collectedIds.has(item.id)) {
                  collectedIds.add(item.id);
                  results.push(item);
                  if (results.length >= limit) break;
                }
              }
              if (i === 0 && results.length >= 2) {
                break;
              }
            }
          }
        }
      } catch {}
    }

    if (results.length > 0) {
      this.cache.set(cacheKey, results);
    }

    return results;
  }

  shuffle(array) {
    if (!Array.isArray(array)) return [];
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}
