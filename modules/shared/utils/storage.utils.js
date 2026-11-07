const STORAGE_KEY = "lotus_saved_pins";
const RECENT_SEARCHES_KEY = "lotus_recent_searches";
const VIEWED_PINS_KEY = "lotus_viewed_pins_history";
const IDEAS_CACHE_KEY = "lotus_ideas_cache_v15";

const NOISY_TAGS_REGEX = /^(1girl|1boy|multiple_girls|multiple_boys|solo|breasts|hair|eyes|dress|skirt|clothes|uniform|shirt|pants|boots|shoes|gloves|highres|absurdres|monochrome|greyscale|long_hair|short_hair|black_hair|blonde_hair|brown_hair|blue_hair|white_hair|looking_at_viewer|open_mouth|smile|blush|simple_background|white_background|commentary|english_commentary)$/i;

export class StorageUtils {
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
    this.clearIdeasCache();
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
    this.clearIdeasCache();
  }

  static removeRecentSearch(query) {
    const clean = (query || "").trim().toLowerCase();
    const list = this.getRecentSearches().filter(
      (item) => item.toLowerCase() !== clean
    );
    try {
      localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(list));
    } catch {}
    this.clearIdeasCache();
  }

  static clearRecentSearches() {
    try {
      localStorage.removeItem(RECENT_SEARCHES_KEY);
    } catch {}
    this.clearIdeasCache();
  }

  static clearIdeasCache() {
    try {
      localStorage.removeItem(IDEAS_CACHE_KEY);
      localStorage.removeItem("lotus_ideas_for_you_cache");
    } catch {}
  }

  static getUserTasteTags() {
    const saved = this.getSavedPins();
    const viewed = this.getViewedPins();
    const tagCounts = new Map();

    const processTags = (list, weight) => {
      list.forEach((pin) => {
        if (Array.isArray(pin.tags)) {
          pin.tags.forEach((t) => {
            const raw = typeof t === "string" ? t : t.query || t.label;
            if (raw && raw.length > 2 && !NOISY_TAGS_REGEX.test(raw)) {
              const normalized = raw.toLowerCase().replace(/_/g, " ").trim();
              tagCounts.set(normalized, (tagCounts.get(normalized) || 0) + weight);
            }
          });
        }
      });
    };

    processTags(saved, 3);
    processTags(viewed, 1);

    const searches = this.getRecentSearches();
    searches.forEach((s) => {
      const clean = (s || "").toLowerCase().replace(/_/g, " ").trim();
      if (clean && clean.length > 2 && !NOISY_TAGS_REGEX.test(clean)) {
        tagCounts.set(clean, (tagCounts.get(clean) || 0) + 2);
      }
    });

    const sorted = [...tagCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([tag]) => tag);

    return sorted.slice(0, 8);
  }
}
