import { isCharacterTag } from "../utils/storage.utils.js?v=5.4";

const decodeHtmlEntities = (str) => {
  if (typeof str !== "string" || !str.includes("&")) return str || "";
  return str
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
};

const isSafeHttpUrl = (url) => {
  return typeof url === "string" && /^https?:\/\//i.test(url.trim());
};

export class PinModel {
  constructor(data = {}) {
    this.id = String(data.id || Date.now());
    const rawTitle = data.title || (data.author ? `Illustration by ${data.author}` : "Digital Illustration");
    this.title = decodeHtmlEntities(rawTitle);
    this.character = data.character || "";
    const rawImg = data.previewUrl || data.image || data.sampleUrl || data.fullUrl || "";
    this.previewUrl = isSafeHttpUrl(rawImg) ? rawImg.trim() : "";
    this.thumbnailUrl = isSafeHttpUrl(data.thumbnailUrl) ? data.thumbnailUrl.trim() : this.previewUrl;
    this.sampleUrl = isSafeHttpUrl(data.sampleUrl) ? data.sampleUrl.trim() : this.previewUrl;
    this.fullUrl = isSafeHttpUrl(data.fullUrl) ? data.fullUrl.trim() : (this.sampleUrl || this.previewUrl);
    this.width = Number(data.width) || 1200;
    this.height = Number(data.height) || 1600;
    this.tags = Array.isArray(data.tags)
      ? data.tags.map((t) => decodeHtmlEntities(typeof t === "object" ? t.query || t.label || "" : String(t))).filter(Boolean)
      : [];
    if (this.tags.length === 0 && this.title && !this.title.includes("Illustration by") && this.title !== "Digital Illustration") {
      const matchSeries = this.title.match(/^(.+?)\s*\(([^)]+)\)$/);
      if (matchSeries) {
        this.tags = [
          matchSeries[1].trim().toLowerCase().replace(/\s+/g, "_"),
          matchSeries[2].trim().toLowerCase().replace(/\s+/g, "_")
        ].filter((t) => t.length > 1);
      } else {
        const cleanTitleTag = this.title.trim().toLowerCase().replace(/\s+/g, "_");
        if (cleanTitleTag.length > 1) {
          this.tags = [cleanTitleTag];
        }
      }
    }
    this.author = decodeHtmlEntities(data.author || "Visual Artist");
    this.authorHref = isSafeHttpUrl(data.authorHref)
      ? data.authorHref.trim()
      : (this.author && this.author.startsWith("@") ? `https://x.com/${this.author.slice(1)}` : "");
    this.source = isSafeHttpUrl(data.source) ? data.source.trim() : this.fullUrl;
    this.sourceDomain = data.sourceDomain || this.deriveDomain(this.source || this.authorHref);
    this.createdAt = data.createdAt || new Date().toISOString();
    this.artworkKey = data.artworkKey || `sb_${this.id}`;
  }

  deriveDomain(url) {
    if (!url || typeof url !== "string") return "safebooru.org";
    try {
      const parsed = new URL(url);
      return parsed.hostname.replace(/^www\./, "");
    } catch {
      return "safebooru.org";
    }
  }

  toCompact() {
    const compact = {
      id: this.id,
      title: this.title,
      image: this.previewUrl || this.sampleUrl || this.fullUrl,
      width: this.width,
      height: this.height
    };
    if (this.character) {
      compact.character = this.character;
    }
    if (this.fullUrl && this.fullUrl !== compact.image) {
      compact.fullUrl = this.fullUrl;
    }
    if (this.author && this.author !== "Visual Artist") {
      compact.author = this.author;
    }
    if (this.source && this.source !== compact.image && this.source !== this.fullUrl) {
      compact.source = this.source;
    }
    if (Array.isArray(this.tags) && this.tags.length > 0) {
      compact.tags = this.tags
        .map((t) => (typeof t === "object" ? t.query || t.label || "" : String(t)).trim().toLowerCase().replace(/\s+/g, "_"))
        .filter((t) => t.length > 1 && !/^\d+$/.test(t))
        .slice(0, 16);
    }
    return compact;
  }

  static fromSafebooru(item) {
    const rawTags = decodeHtmlEntities(item.tags || "")
      .split(" ")
      .map((t) => t.trim())
      .filter((t) => t.length > 1);

    const filteredTags = rawTags.filter(isCharacterTag);

    let characterTag = item.character ? decodeHtmlEntities(item.character) : "";
    if (!characterTag) {
      characterTag =
        filteredTags.find((t) => t.includes("(") && t.includes(")")) ||
        filteredTags.find((t) => /^(princess|queen|king|lord|lady)_/i.test(t)) ||
        filteredTags.find((t) => t.includes("_") && !t.includes(":") && t !== "triforce") ||
        filteredTags[0] ||
        "Anime Art";
    }

    const cleanTitle = characterTag
      .replace(/&#039;/g, "'")
      .replace(/&amp;/g, "&")
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());

    const fileUrl = item.file_url || (item.directory && item.image ? `https://safebooru.org/images/${item.directory}/${item.image}` : "");
    const sampleUrl = item.sample_url || (item.sample && item.directory && item.image ? `https://safebooru.org/samples/${item.directory}/sample_${item.image.replace(/\.[^.]+$/, ".jpg")}` : fileUrl);
    const thumbUrl = item.preview_url || "";
    const full = fileUrl || sampleUrl || thumbUrl;
    const preview = sampleUrl || fileUrl || thumbUrl;
    const formattedTags = rawTags.slice(0, 16);

    const src = (item.source || "").trim();
    let authorName = item.artist ? (item.artist.startsWith("@") ? item.artist : `@${item.artist}`) : "";
    let authorHref = `https://safebooru.org/index.php?page=post&s=view&id=${item.id}`;
    let domain = "safebooru.org";

    const explicitArtistTag = filteredTags.find((t) => t.endsWith("_(artist)"));
    if (!authorName && explicitArtistTag) {
      const cleanArtist = explicitArtistTag.replace(/_\(artist\)$/, "");
      authorName = `@${cleanArtist}`;
      authorHref = `https://safebooru.org/index.php?page=post&s=list&tags=${encodeURIComponent(cleanArtist)}`;
    }

    if (!authorName && (src.includes("twitter.com/") || src.includes("x.com/"))) {
      const match = src.match(/(?:twitter\.com|x\.com)\/([a-zA-Z0-9_]+)/);
      if (match && match[1] && match[1] !== "i") {
        authorName = `@${match[1]}`;
        authorHref = `https://x.com/${match[1]}`;
        domain = "x.com";
      }
    } else if (!authorName && src.includes("bsky.app/profile/")) {
      const match = src.match(/bsky\.app\/profile\/([^/?#]+)/);
      if (match && match[1]) {
        domain = "bsky.app";
        authorHref = src;
        if (!match[1].startsWith("did:plc:")) {
          authorName = `@${match[1]}`;
        }
      }
    } else if (!authorName && (src.includes("pixiv.net") || src.includes("pximg.net"))) {
      domain = "pixiv.net";
      authorName = "Pixiv Artist";
      const pixivMatch = src.match(/(?:artworks\/|illust_id=|\/|_)(\d{6,12})(?:_p|\.|$)/);
      authorHref = pixivMatch ? `https://www.pixiv.net/artworks/${pixivMatch[1]}` : (src.startsWith("http") ? src : "https://www.pixiv.net");
    } else if (!authorName && src.includes("artstation.com/")) {
      const match = src.match(/artstation\.com\/([a-zA-Z0-9_-]+)/);
      if (match && match[1]) {
        authorName = `@${match[1]}`;
        authorHref = `https://www.artstation.com/${match[1]}`;
        domain = "artstation.com";
      }
    } else if (!authorName && src.includes("deviantart.com/")) {
      const match = src.match(/deviantart\.com\/([a-zA-Z0-9_-]+)/);
      if (match && match[1]) {
        authorName = `@${match[1]}`;
        authorHref = `https://www.deviantart.com/${match[1]}`;
        domain = "deviantart.com";
      }
    } else if (!authorName && src.includes("lofter.com")) {
      domain = "lofter.com";
      const match = src.match(/https?:\/\/([a-zA-Z0-9_-]+)\.lofter\.com/);
      if (match && match[1]) {
        authorName = `@${match[1]}`;
        authorHref = `https://${match[1]}.lofter.com`;
      }
    } else if (!authorName && item.owner && item.owner !== "danbooru" && !/^\d+$/.test(item.owner)) {
      authorName = `@${item.owner}`;
    }

    if (!authorName) {
      authorName = "Digital Artist";
      domain = "Digital Illustration";
    }

    let artworkKey = "";
    if (src.includes("pixiv.net") || src.includes("pximg.net")) {
      const pm = src.match(/(?:artworks\/|illust_id=|\/|_)(\d{6,12})(?:_p|\.|$)/);
      if (pm && pm[1]) {
        artworkKey = `pixiv_${pm[1]}`;
      }
    } else if (src.includes("twitter.com/") || src.includes("x.com/")) {
      const tm = src.match(/(?:twitter\.com|x\.com)\/[^/]+\/status\/(\d+)/i);
      if (tm && tm[1]) {
        artworkKey = `x_${tm[1]}`;
      }
    }
    if (!artworkKey && item.hash) {
      artworkKey = `hash_${item.hash}`;
    }
    if (!artworkKey) {
      artworkKey = `sb_${item.id}`;
    }

    return new PinModel({
      id: `sb_${item.id}`,
      artworkKey,
      title: cleanTitle,
      character: characterTag,
      previewUrl: preview,
      fullUrl: full,
      sampleUrl: sampleUrl,
      width: Number(item.width) || 1200,
      height: Number(item.height) || 1600,
      tags: formattedTags,
      author: authorName,
      authorHref: isSafeHttpUrl(authorHref) ? authorHref : `https://safebooru.org/index.php?page=post&s=view&id=${item.id}`,
      source: isSafeHttpUrl(authorHref) && domain === "pixiv.net" ? authorHref : (isSafeHttpUrl(src) ? src : (isSafeHttpUrl(authorHref) ? authorHref : `https://safebooru.org/index.php?page=post&s=view&id=${item.id}`)),
      sourceDomain: domain,
      createdAt: item.change ? new Date(item.change * 1000).toISOString() : new Date().toISOString()
    });
  }
}
