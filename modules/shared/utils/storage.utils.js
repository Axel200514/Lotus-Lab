const STORAGE_KEY = "lotus_saved_pins";
const RECENT_SEARCHES_KEY = "lotus_recent_searches";
const VIEWED_PINS_KEY = "lotus_viewed_pins_history";
const IDEAS_CACHE_KEY = "lotus_ideas_cache_v20";

export const ATTR_REGEX = /(?:^|_)(hair|streaks|eyes|skin|clothes|dress|skirt|shirt|pants|shoes|socks|boots|sleeves|sweater|jacket|coat|hoodie|uniform|swimsuit|bikini|gloves|ribbon|bow|belt|scarf|hat|cap|body|torso|arm|leg|hand|fingers|neck|mouth|smile|blush|ahoge|twintails|ponytail|bangs|braid|holding|eyebrows|teeth|tongue|breasts|ass|belly|pocket|print|clenched|cropped|symbol|character_name|commentary|request|style|view|pose|solo|focus|looking|background|monochrome|greyscale|highres|absurdres|watermark|signature|text)(?:_|$)/i;

export class StorageUtils {
  static isThematicTag(tag, dynamicKnownTags = null) {
    if (!tag || typeof tag !== "string") return false;
    const clean = tag.trim().toLowerCase();
    if (clean.length < 3 || /^\d/.test(clean)) return false;
    if (ATTR_REGEX.test(clean)) return false;
    if (clean.includes("(") && clean.includes(")")) return true;
    if (clean.includes(":")) return true;
    if (clean.includes("/")) return true;
    if (clean.endsWith("_(series)") || clean.endsWith("_(game)") || clean.endsWith("_(anime)")) return true;
    if (dynamicKnownTags && dynamicKnownTags.has(clean)) return true;
    return false;
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

    this.clearIdeasCache();
    if (index >= 0) {
      list.splice(index, 1);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
      return false;
    } else {
      list.unshift(pin);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
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

  static clearIdeasCache() {
    try {
      localStorage.removeItem(IDEAS_CACHE_KEY);
      localStorage.removeItem("lotus_ideas_cache_v19");
      localStorage.removeItem("lotus_ideas_cache_v18");
      localStorage.removeItem("lotus_ideas_cache_v17");
      localStorage.removeItem("lotus_ideas_cache_v16");
      localStorage.removeItem("lotus_ideas_cache_v15");
      localStorage.removeItem("lotus_ideas_for_you_cache");
    } catch {}
  }

  static getUserTasteTags(dynamicKnownTags = null) {
    const saved = this.getSavedPins();
    const viewed = this.getViewedPins();
    const tagCounts = new Map();

    const processTags = (list, weight) => {
      list.forEach((pin) => {
        if (pin.title) {
          const titleTag = pin.title.trim().toLowerCase().replace(/\s+/g, "_");
          if (titleTag && titleTag.length > 2 && this.isThematicTag(titleTag, dynamicKnownTags)) {
            tagCounts.set(titleTag, (tagCounts.get(titleTag) || 0) + weight * 2);
          }
        }
        if (Array.isArray(pin.tags)) {
          pin.tags.forEach((t) => {
            const raw = typeof t === "string" ? t : t.query || t.label;
            if (!raw) return;
            const clean = raw.trim().toLowerCase();
            if (this.isThematicTag(clean, dynamicKnownTags)) {
              tagCounts.set(clean, (tagCounts.get(clean) || 0) + weight);

              const m = clean.match(/^(.+)\(([^)]+)\)$/);
              if (m) {
                const franchise = m[2].trim();
                if (franchise.length >= 3) {
                  tagCounts.set(franchise, (tagCounts.get(franchise) || 0) + weight);
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
      if (clean && clean.length > 2 && this.isThematicTag(clean, dynamicKnownTags)) {
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
