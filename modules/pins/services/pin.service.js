import { API_CONFIG } from "../../../app/app.config.js?v=3.7";
import { PinModel } from "../../shared/models/pin.model.js?v=3.7";

const ANCHOR_ATTR_REGEX = /(hair|streaks|eyes|skin|clothes|dress|skirt|shirt|pants|shoes|socks|boots|sleeves|sweater|jacket|coat|hoodie|uniform|swimsuit|bikini|gloves|ribbon|bow|belt|scarf|hat|cap|body|torso|arm|leg|hand|fingers|neck|apple|mouth|smile|blush|ahoge|twintails|ponytail|bangs|braid|holding|eyebrows|teeth|tongue|breasts|ass|belly|pocket|print|clenched|cropped|symbol|character_name|commentary|request|style|view|pose|solo|focus|looking|background|monochrome|greyscale|highres|absurdres|watermark|signature|text|safebooru|pixiv|twitter|resolución|vertical|horizontal|digital|ilustración|anime)/i;

const BOORU_SPECIAL = {
  goku: "son_goku",
  luffy: "monkey_d._luffy",
  naruto: "uzumaki_naruto",
  sasuke: "uchiha_sasuke",
  vegeta: "vegeta",
  miku: "hatsune_miku",
  tanjiro: "kamado_tanjirou",
  nezuko: "kamado_nezuko",
  gojo: "gojou_satoru",
  rem: "rem_(re:zero)",
  asuka: "souryuu_asuka_langley",
  shinji: "ikari_shinji",
  deku: "midoriya_izuku",
  bakugo: "bakugou_katsuki",
  todoroki: "todoroki_shouto",
  levi: "levi_(shingeki_no_kyojin)",
  eren: "eren_yeager",
  chica: "1girl",
  chicas: "multiple_girls",
  chico: "1boy",
  chicos: "multiple_boys",
  fondo: "wallpaper",
  fondos: "wallpaper",
  paisaje: "scenery",
  paisajes: "scenery",
  ilustracion: "waifu",
  ilustraciones: "waifu",
  personaje: "solo",
  personajes: "solo",
  zorro: "fox_ears",
  zorros: "fox_ears",
  kitsune: "fox_ears",
  genshin: "genshin_impact"
};

const STOP_WORDS = new Set(["the", "no", "la", "de", "of", "and", "in", "to", "a", "on", "at", "by", "or", "is", "it", "wa"]);
const SPANISH_WORDS = new Set(["fondo", "pantalla", "chica", "chico", "paisaje", "cielo", "ojos", "pelo", "cabello", "armadura", "vestido", "espada", "del", "las", "los", "una", "con", "por", "para"]);

export class PinService {
  constructor() {
    this.cache = new Map();
    this.translationCache = new Map();
    this.tagResolutionCache = new Map();
    this.sessionSeenIds = new Set();
    this.resetSession();
  }

  resetSession() {
    this.sessionOffset = Math.floor(Math.random() * 250) + 1;
    this.sessionSeenIds = new Set();
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
    const cleanUnderscored = clean.replace(/[\s-]+/g, "_");
    const cleanSpaced = clean.replace(/[_-]+/g, " ");
    return BOORU_SPECIAL[clean] || BOORU_SPECIAL[cleanUnderscored] || BOORU_SPECIAL[cleanSpaced] || clean;
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

    if (BOORU_SPECIAL[clean]) {
      this.translationCache.set(clean, BOORU_SPECIAL[clean]);
      return BOORU_SPECIAL[clean];
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
          const raw = data[0].map((s) => s[0]).join("").replace(/[.,/#!$%^&*;:{}=\`~()]/g, "").trim().toLowerCase();
          const resolved = BOORU_SPECIAL[raw] || raw;
          if (resolved) {
            this.translationCache.set(clean, resolved);
            return resolved;
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
    if (/[áéíóúüñ]/i.test(text)) return true;
    const words = (text || "").toLowerCase().split(/\s+/);
    return words.some((w) => SPANISH_WORDS.has(w));
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
      .filter((t) => t.length >= 2 && !STOP_WORDS.has(t));
  }

  buildSearchCandidates(raw) {
    const clean = (raw || "").trim().toLowerCase();
    const words = clean.split(/[\s_-]+/).filter(Boolean);
    const candidates = new Set();

    candidates.add(clean.replace(/\s+/g, "_"));
    candidates.add(clean);

    if (words.length >= 2) {
      candidates.add(words.join("_"));
      if (words.length === 2) {
        candidates.add(`${words[1]}_${words[0]}`);
      }
      candidates.add(`${words[0]}:${words.slice(1).join("_")}`);
      candidates.add(`${words[0]}:_${words.slice(1).join("_")}`);
      candidates.add(`${words[0]}/${words.slice(1).join("_")}`);
      candidates.add(words.join(";"));
      candidates.add(words.join("-"));
      candidates.add(`${words.join("_")}!`);
      candidates.add(`${words.join("_")}!!`);
    } else if (words.length === 1) {
      candidates.add(`${words[0]}!`);
      candidates.add(`${words[0]}!!`);
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
        let matches = 0;
        for (const token of tokens) {
          if (cleanTag.includes(token)) {
            matches++;
          }
        }
        if (matches > 0) {
          let score = matches * 10;
          if (matches === tokens.length) score += 50;
          if (cleanTag.endsWith("_(series)") || cleanTag.endsWith("_(anime)") || cleanTag.endsWith("_(game)")) score += 25;
          tagScores.set(cleanTag, (tagScores.get(cleanTag) || 0) + score);
        }
      }
    }

    if (tagScores.size === 0) return null;
    const sorted = Array.from(tagScores.entries()).sort((a, b) => b[1] - a[1]);
    return sorted[0] ? sorted[0][0] : null;
  }

  async executeSafebooruFetch(tag, page = 1, limit = API_CONFIG.defaultLimit, retryCount = 1) {
    const cleanTag = (tag || "").trim();
    const url = `${API_CONFIG.safebooruProxyEndpoint}?tags=${encodeURIComponent(cleanTag)}&page=${page}&limit=${limit}`;
    for (let attempt = 0; attempt <= retryCount; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 9500);
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);

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

  async getFeedPins(page = 1, limit = API_CONFIG.defaultLimit) {
    const half = Math.max(6, Math.floor(limit / 2));
    const pageA = (page * 2 - 1) + this.sessionOffset;
    const pageB = (page * 2) + this.sessionOffset + 27;

    const [batchA, batchB] = await Promise.allSettled([
      this.fetchSafebooru("", pageA, half),
      this.fetchSafebooru("", pageB, limit - half)
    ]);

    const listA = batchA.status === "fulfilled" ? batchA.value : [];
    const listB = batchB.status === "fulfilled" ? batchB.value : [];
    const seen = new Set();
    const combined = [];

    for (const item of [...listA, ...listB]) {
      if (!this.sessionSeenIds.has(item.id) && !seen.has(item.id)) {
        seen.add(item.id);
        this.sessionSeenIds.add(item.id);
        combined.push(item);
      }
    }

    if (combined.length < limit) {
      const extraPage = pageB + page + 5;
      const fallback = await this.fetchSafebooru("", extraPage, limit);
      for (const item of fallback) {
        if (!this.sessionSeenIds.has(item.id) && !seen.has(item.id)) {
          seen.add(item.id);
          this.sessionSeenIds.add(item.id);
          combined.push(item);
          if (combined.length >= limit) break;
        }
      }
    }

    if (combined.length === 0) {
      const emergency = await this.fetchSafebooru("", 1, limit);
      for (const item of emergency) {
        if (!this.sessionSeenIds.has(item.id) && !seen.has(item.id)) {
          seen.add(item.id);
          this.sessionSeenIds.add(item.id);
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

  async searchPins(query, page = 1, limit = API_CONFIG.defaultLimit) {
    const safebooruResults = await this.fetchSafebooru(query, page, limit);
    const pins = this.shuffle(safebooruResults);

    return {
      pins,
      hasNextPage: safebooruResults.length >= limit,
      totalPages: 25
    };
  }

  async getTopicPins(topic, page = 1, limit = API_CONFIG.defaultLimit) {
    const cleanTopic = (topic || "").trim().toLowerCase();
    const cacheKey = `topic_${cleanTopic}_${page}_${limit}`;

    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const results = await this.fetchSafebooru(cleanTopic, page, limit);
    const pins = this.shuffle(results);

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

  async fetchSafebooru(query, page, limit) {
    let raw = (query || "").trim().toLowerCase();
    if (!raw) {
      const data = await this.executeSafebooruFetch("", page, limit);
      return data.map((item) => PinModel.fromSafebooru(item));
    }

    if (this.tagResolutionCache.has(raw)) {
      const resolvedTag = this.tagResolutionCache.get(raw);
      const data = await this.executeSafebooruFetch(resolvedTag, page, limit);
      if (data.length > 0) {
        return data.map((item) => PinModel.fromSafebooru(item));
      }
      this.tagResolutionCache.delete(raw);
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

    let fallbackBatch = null;

    for (const directTag of directCandidates) {
      const data = await this.executeSafebooruFetch(directTag, page, limit);
      if (data.length >= 16) {
        this.tagResolutionCache.set(raw, directTag);
        return data.map((item) => PinModel.fromSafebooru(item));
      }
      if (data.length > 0) {
        if (!fallbackBatch) {
          fallbackBatch = { tag: directTag, data };
        }
        const altTag = this.findBestAlternativeTag(data, tokens, directTag);
        if (altTag) {
          const altData = await this.executeSafebooruFetch(altTag, page, limit);
          if (altData.length >= data.length) {
            this.tagResolutionCache.set(raw, altTag);
            return altData.map((item) => PinModel.fromSafebooru(item));
          }
        }
        const parenFranchise = this.extractParenFranchise(data);
        if (parenFranchise) {
          const pData = await this.executeSafebooruFetch(parenFranchise, page, limit);
          if (pData.length >= data.length) {
            this.tagResolutionCache.set(raw, parenFranchise);
            return pData.map((item) => PinModel.fromSafebooru(item));
          }
        }
        const deepFranchise = await this.resolveFranchiseFromCharacterPost(data);
        if (deepFranchise) {
          const dData = await this.executeSafebooruFetch(deepFranchise, page, limit);
          if (dData.length > 0) {
            this.tagResolutionCache.set(raw, deepFranchise);
            return dData.map((item) => PinModel.fromSafebooru(item));
          }
        }
      }
    }

    if (tokens.length > 0) {
      for (const token of tokens) {
        const wildTag = `${token}*`;
        const wildData = await this.executeSafebooruFetch(wildTag, 1, 10);
        if (wildData.length > 0) {
          const altTag = this.findBestAlternativeTag(wildData, tokens, directCandidates[0]);
          if (altTag) {
            const altData = await this.executeSafebooruFetch(altTag, page, limit);
            if (altData.length > 0) {
              this.tagResolutionCache.set(raw, altTag);
              return altData.map((item) => PinModel.fromSafebooru(item));
            }
          }
          const parenFranchise = this.extractParenFranchise(wildData);
          if (parenFranchise) {
            const pData = await this.executeSafebooruFetch(parenFranchise, page, limit);
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
      const rData = await this.executeSafebooruFetch(romajiTag, page, limit);
      if (rData.length > 0) {
        this.tagResolutionCache.set(raw, romajiTag);
        return rData.map((item) => PinModel.fromSafebooru(item));
      }
    }

    const translated = await this.translateQuery(raw);
    const candidates = this.buildTagCandidates(translated);

    for (const tag of candidates) {
      const data = await this.executeSafebooruFetch(tag, page, limit);
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
      .filter((t) => t.length > 2 && !/^\d/.test(t) && !t.startsWith("&") && !ANCHOR_ATTR_REGEX.test(t));

    const characterTags = [];
    const seriesTags = [];
    const themeTags = [];

    for (const t of cleanTags) {
      if (t.includes("(") && t.includes(")")) {
        characterTags.push(t);
        const match = t.match(/\(([^)]+)\)/);
        if (match && match[1] && !seriesTags.includes(match[1])) {
          seriesTags.push(match[1]);
        }
      } else if (t.includes("_")) {
        themeTags.push(t);
      }
    }

    let primaryArtist = null;
    if (
      pin.author &&
      !pin.author.includes("Digital Artist") &&
      !pin.author.includes("Visual Artist") &&
      !pin.author.includes("Artista Digital") &&
      !pin.author.includes("Artista Visual")
    ) {
      const cleanArtist = pin.author.replace(/^@/, "").trim().toLowerCase();
      if (cleanArtist && cleanArtist !== "pixiv" && cleanArtist !== "danbooru") {
        primaryArtist = cleanArtist;
      }
    }

    const anchorsPool = [...seriesTags, ...characterTags, ...themeTags];
    if (primaryArtist && !anchorsPool.includes(primaryArtist)) {
      anchorsPool.unshift(primaryArtist);
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

    const pinNum = parseInt(String(pin.id).replace(/\D/g, ""), 10) || 1;
    const seedOffset = (pinNum % 12);

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
    if (anchors.primaryArtist && !queryTags.includes(anchors.primaryArtist)) {
      queryTags.push(anchors.primaryArtist);
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
      const targetPage = page + seedOffset + (i * 2);
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
