const STORAGE_KEY = "lotus_saved_pins";
const RECENT_SEARCHES_KEY = "lotus_recent_searches";
const VIEWED_PINS_KEY = "lotus_viewed_pins_history";
export const IDEAS_CACHE_KEY = "lotus_ideas_cache_v32";
const FEED_SEEN_KEY = "lotus_feed_seen_ids";

export const ATTR_REGEX = /(?:^|_)(hair|streaks|eyes|skin|clothes|dress|skirt|shirt|pants|shoes|socks|boots|sleeves|sweater|jacket|coat|hoodie|uniform|lapels|collar|cuffs|zipper|earrings|necklace|cape|cloak|swimsuit|bikini|gloves|ribbon|bow|belt|scarf|hat|cap|body|torso|arm|leg|hand|fingers|neck|mouth|smile|blush|ahoge|twintails|ponytail|bangs|braid|holding|eyebrows|teeth|tongue|breasts|ass|belly|pocket|print|clenched|cropped|symbol|character_name|commentary|request|style|view|pose|solo|focus|looking|background|monochrome|greyscale|highres|absurdres|watermark|signature|text|sky|scenery|weapon|sword|tree|clouds|flowers|food|animal|room|window|outdoors|indoors|night|day|sunlight|sunset|light|shadow|gradient)(?:_|$)/i;
export const NON_CHARACTER_SUFFIX_REGEX = /\((?:mtf|ftm|style|cosplay|medium|concept|clothing|artist|parody|meme|object|anatomy|organ|symbol|pose|view|scenery|room|series)\)$/i;

export const KNOWN_CHARACTER_SERIES_REGEX = /^(?:sword_art_online|animal_crossing|light_yagami|spice_&_wolf|spice_and_wolf|blue_archive|dark_souls|hollow_knight|angel_beats|black_rock_shooter)(?:_|$)/i;

export const isCharacterTag = (tag) => {
  if (!tag || typeof tag !== "string") return false;
  const clean = tag
    .replace(/&amp;/gi, "&")
    .replace(/&#039;/g, "'")
    .trim()
    .toLowerCase();
  if (clean.length < 3) return false;
  if (/^\d+$/.test(clean) || /^\d+\+?(?:girls?|boys?|others?|koma|\+)$/i.test(clean) || /^\d+x\d+$/i.test(clean) || /^\d+:\d+$/.test(clean)) {
    return false;
  }
  if (clean.startsWith("&") || /&[a-z0-9#]+;/i.test(clean)) return false;
  if (NON_CHARACTER_SUFFIX_REGEX.test(clean)) return false;
  if (/^\(?series\)?$/i.test(clean)) return false;
  if (KNOWN_CHARACTER_SERIES_REGEX.test(clean)) return true;
  if (clean.includes("(") && clean.includes(")")) return true;
  if (ATTR_REGEX.test(clean)) return false;
  return true;
};

export const isArtworkDuplicate = (a, b) => {
  if (!a || !b) return false;
  if (a.id && b.id && a.id === b.id) return true;
  if (a.artworkKey && b.artworkKey && !a.artworkKey.startsWith("sb_") && a.artworkKey === b.artworkKey) return true;

  const getHash = (p) => ((p.previewUrl || p.sampleUrl || p.fullUrl || p.image || "").match(/([a-f0-9]{32})/i) || [])[1]?.toLowerCase() || "";
  const hA = getHash(a), hB = getHash(b);
  if (hA && hB && hA === hB) return true;

  const srcA = typeof a.source === "string" ? a.source : "";
  const srcB = typeof b.source === "string" ? b.source : "";
  const rA = a.width && a.height ? a.width / a.height : 0;
  const rB = b.width && b.height ? b.width / b.height : 0;
  const ratioDiff = rA && rB ? Math.abs(rA - rB) : 1;

  if (srcA && srcB && (srcA.includes("x.com") || srcA.includes("twitter.com")) && (srcB.includes("x.com") || srcB.includes("twitter.com"))) {
    const root = (s) => (s.match(/(?:twitter\.com|x\.com)\/([a-zA-Z0-9_]+)/i)?.[1] || "").toLowerCase().replace(/(?:_?jp|_?en|_?kr|_?cn|_?tw|_?official|_?pr)$/i, "");
    if (root(srcA) && root(srcA) === root(srcB) && ratioDiff < 0.02) return true;
  }

  const charA = (a.character || a.title || "").toLowerCase().trim();
  const charB = (b.character || b.title || "").toLowerCase().trim();
  if (charA && charB && charA === charB) {
    const setA = new Set((a.tags || []).map((t) => (typeof t === "object" ? t.query || t.label : String(t)).toLowerCase().trim()).filter(Boolean));
    const setB = new Set((b.tags || []).map((t) => (typeof t === "object" ? t.query || t.label : String(t)).toLowerCase().trim()).filter(Boolean));
    const common = [...setA].filter((t) => setB.has(t)).length;
    const union = setA.size + setB.size - common;
    const jaccard = union > 0 ? common / union : 0;

    if (a.width === b.width && a.height === b.height && a.width > 0 && jaccard >= 0.75 && common >= 11) return true;
    if (ratioDiff < 0.01 && a.width > 0 && b.width > 0 && jaccard >= 0.85 && common >= 13) return true;
  }

  return false;
};

export class StorageUtils {
  static isThematicTag(tag) {
    return isCharacterTag(tag);
  }

  static getSavedPins() {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  static isSaved(pinId) {
    const list = this.getSavedPins();
    return list.some((p) => String(p.id) === String(pinId));
  }

  static toggleSave(pin) {
    const list = this.getSavedPins();
    const index = list.findIndex((p) => String(p.id) === String(pin.id));

    if (index >= 0) {
      list.splice(index, 1);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
      } catch {
        return true;
      }
      this.notifyTasteDirty();
      return false;
    } else {
      const strId = String(pin.id || "");
      const defaultKey = strId.startsWith("sb_") ? strId : `sb_${strId}`;
      const compact = typeof pin.toCompact === "function" ? pin.toCompact() : {
        id: pin.id,
        title: pin.title,
        image: pin.previewUrl || pin.sampleUrl || pin.image,
        width: pin.width,
        height: pin.height,
        ...(pin.artworkKey && pin.artworkKey !== defaultKey ? { artworkKey: pin.artworkKey } : {}),
        ...(pin.fullUrl && pin.fullUrl !== (pin.previewUrl || pin.sampleUrl || pin.image) ? { fullUrl: pin.fullUrl } : {}),
        ...(pin.author && pin.author !== "Visual Artist" ? { author: pin.author } : {}),
        ...(pin.authorHref ? { authorHref: pin.authorHref } : {}),
        ...(pin.sourceDomain ? { sourceDomain: pin.sourceDomain } : {}),
        ...(pin.source ? { source: pin.source } : {}),
        ...(Array.isArray(pin.tags) && pin.tags.length > 0 ? { tags: pin.tags.slice(0, 16) } : {})
      };
      list.unshift(compact);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
      } catch {
        return false;
      }
      this.notifyTasteDirty();
      return true;
    }
  }

  static getViewedPins() {
    try {
      const data = localStorage.getItem(VIEWED_PINS_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  static recordViewedPin(pin) {
    if (!pin || !pin.id) return;
    const list = this.getViewedPins().filter((p) => String(p.id) !== String(pin.id));
    const cleanTags = Array.isArray(pin.tags)
      ? pin.tags.map((t) => (typeof t === "string" ? t : t.query || t.label || "")).filter(Boolean)
      : [];
    list.unshift({
      id: String(pin.id),
      title: pin.title || "",
      previewUrl: pin.previewUrl || pin.sampleUrl || "",
      tags: cleanTags
    });
    const capped = list.slice(0, 30);
    try {
      localStorage.setItem(VIEWED_PINS_KEY, JSON.stringify(capped));
    } catch {}
  }

  static getRecentSearches() {
    try {
      const raw = localStorage.getItem(RECENT_SEARCHES_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  static addRecentSearch(query) {
    const clean = (query || "").trim();
    if (!clean || clean.length < 2) return;
    const list = this.getRecentSearches().filter(
      (item) => item.toLowerCase() !== clean.toLowerCase()
    );
    list.unshift(clean);
    const capped = list.slice(0, 10);
    try {
      localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(capped));
    } catch {}
  }

  static removeRecentSearch(query) {
    const clean = (query || "").trim().toLowerCase();
    const list = this.getRecentSearches().filter(
      (item) => item.toLowerCase() !== clean
    );
    try {
      localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(list));
    } catch {}
  }

  static clearRecentSearches() {
    try {
      localStorage.removeItem(RECENT_SEARCHES_KEY);
    } catch {}
  }

  static notifyTasteDirty() {
    try {
      const pending = Number(localStorage.getItem("lotus_taste_pending_saves") || 0) + 1;
      localStorage.setItem("lotus_taste_pending_saves", String(pending));
      if (!localStorage.getItem("lotus_taste_dirty_since")) {
        localStorage.setItem("lotus_taste_dirty_since", String(Date.now()));
      }
    } catch {}
  }

  static shouldRefreshIdeas(cachedTimestamp) {
    if (!cachedTimestamp) return true;
    const now = Date.now();
    if (now - cachedTimestamp > 24 * 60 * 60 * 1000) return true;
    try {
      const pending = Number(localStorage.getItem("lotus_taste_pending_saves") || 0);
      const dirtySince = Number(localStorage.getItem("lotus_taste_dirty_since") || 0);
      if (pending >= 3 || (dirtySince && now - dirtySince > 15 * 60 * 1000)) {
        return true;
      }
    } catch {}
    return false;
  }

  static resetTasteDirty() {
    try {
      localStorage.removeItem("lotus_taste_pending_saves");
      localStorage.removeItem("lotus_taste_dirty_since");
    } catch {}
  }

  static clearIdeasCache() {
    try {
      localStorage.removeItem(IDEAS_CACHE_KEY);
      localStorage.removeItem("lotus_ideas_cache_v22");
      localStorage.removeItem("lotus_ideas_cache_v21");
      localStorage.removeItem("lotus_ideas_cache_v20");
      localStorage.removeItem("lotus_ideas_cache_v19");
      localStorage.removeItem("lotus_ideas_cache_v18");
      localStorage.removeItem("lotus_ideas_cache_v17");
      localStorage.removeItem("lotus_ideas_cache_v16");
      localStorage.removeItem("lotus_ideas_cache_v15");
      localStorage.removeItem("lotus_ideas_for_you_cache");
      this.resetTasteDirty();
    } catch {}
  }

  static getFeedSeenIds() {
    try {
      const raw = localStorage.getItem(FEED_SEEN_KEY);
      const list = raw ? JSON.parse(raw) : [];
      return new Set(Array.isArray(list) ? list : []);
    } catch {
      return new Set();
    }
  }

  static addFeedSeenIds(ids) {
    if (!Array.isArray(ids) || ids.length === 0) return;
    try {
      const current = this.getFeedSeenIds();
      ids.forEach((id) => {
        if (id) current.add(String(id));
      });
      const arr = Array.from(current);
      const capped = arr.slice(-500);
      localStorage.setItem(FEED_SEEN_KEY, JSON.stringify(capped));
    } catch {}
  }

  static getUserTasteTags() {
    const saved = this.getSavedPins();
    const viewed = this.getViewedPins();
    const tagCounts = new Map();

    const processTags = (list, weight) => {
      list.forEach((pin) => {
        if (pin.title) {
          const titleTag = pin.title.trim().toLowerCase().replace(/\s+/g, "_");
          if (titleTag && titleTag.length > 2 && this.isThematicTag(titleTag)) {
            tagCounts.set(titleTag, (tagCounts.get(titleTag) || 0) + weight * 2);
          }
        }
        if (Array.isArray(pin.tags)) {
          pin.tags.forEach((t) => {
            const raw = typeof t === "string" ? t : t.query || t.label;
            if (!raw) return;
            const clean = raw.trim().toLowerCase();
            if (this.isThematicTag(clean)) {
              tagCounts.set(clean, (tagCounts.get(clean) || 0) + weight);

              const m = clean.match(/^(.+)\(([^)]+)\)$/);
              if (m) {
                const inner = m[2].trim();
                const outer = m[1].replace(/_+$/, "").trim();
                if (/^(series|game|anime|manga|novel|cosplay|style|medium)$/i.test(inner)) {
                  if (outer.length >= 3 && this.isThematicTag(outer)) {
                    tagCounts.set(outer, (tagCounts.get(outer) || 0) + weight);
                  }
                } else if (inner.length >= 3 && this.isThematicTag(inner)) {
                  tagCounts.set(inner, (tagCounts.get(inner) || 0) + weight);
                }
              }
            }
          });
        }
      });
    };

    processTags(saved, 3);
    processTags(viewed, 1);

    const searches = this.getRecentSearches();
    searches.forEach((s) => {
      const clean = (s || "").trim().toLowerCase();
      if (clean && clean.length > 2 && this.isThematicTag(clean)) {
        tagCounts.set(clean, (tagCounts.get(clean) || 0) + 2);
      }
    });

    const sorted = [...tagCounts.entries()]
      .filter(([_, score]) => score >= 4)
      .sort((a, b) => b[1] - a[1])
      .map(([tag]) => tag);

    return sorted.slice(0, 24);
  }
}
