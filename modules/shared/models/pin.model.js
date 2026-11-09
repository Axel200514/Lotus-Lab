const ATTR_REGEX = /(?:^|_)(hair|streaks|eyes|skin|clothes|dress|skirt|shirt|pants|shoes|socks|boots|sleeves|sweater|jacket|coat|hoodie|uniform|swimsuit|bikini|gloves|ribbon|bow|belt|scarf|hat|cap|body|torso|arm|leg|hand|fingers|neck|mouth|smile|blush|ahoge|twintails|ponytail|bangs|braid|holding|eyebrows|teeth|tongue|breasts|ass|belly|pocket|print|clenched|cropped|symbol|character_name|commentary|request|style|view|pose|solo|focus|looking|background|monochrome|greyscale|highres|absurdres|watermark|signature|text)(?:_|$)/i;
const NON_CHARACTER_SUFFIX_REGEX = /\((?:mtf|ftm|style|cosplay|medium|concept|clothing|artist|parody|meme|object|anatomy|organ|symbol|pose|view|scenery|room)\)$/i;

const isCleanName = (tag) => {
  return tag.length > 2 && !/^\d/.test(tag) && !tag.startsWith("&") && !ATTR_REGEX.test(tag);
};

const isSafeHttpUrl = (url) => {
  return typeof url === "string" && /^https?:\/\//i.test(url.trim());
};

export class PinModel {
  constructor(data = {}) {
    this.id = data.id || String(Date.now());
    this.title = data.title || (data.author ? `Illustration by ${data.author}` : "Digital Illustration");
    this.previewUrl = data.previewUrl || "";
    this.fullUrl = data.fullUrl || this.previewUrl;
    this.sampleUrl = data.sampleUrl || this.previewUrl;
    this.width = Number(data.width) || 1200;
    this.height = Number(data.height) || 1600;
    this.tags = Array.isArray(data.tags) ? data.tags : [];
    this.author = data.author || "Visual Artist";
    this.authorHref = isSafeHttpUrl(data.authorHref) ? data.authorHref.trim() : "";
    this.source = isSafeHttpUrl(data.source) ? data.source.trim() : this.fullUrl;
    this.sourceDomain = data.sourceDomain || "pixiv.net";
    this.createdAt = data.createdAt || new Date().toISOString();
    this.artworkKey = data.artworkKey || `sb_${this.id}`;
  }

  static fromSafebooru(item) {
    const rawTags = (item.tags || "")
      .split(" ")
      .map((t) => t.trim())
      .filter((t) => t.length > 1);

    const filteredTags = rawTags.filter(isCleanName);

    let characterTag = item.character || "";
    if (!characterTag) {
      characterTag =
        filteredTags.find((t) => t.includes("(") && t.includes(")") && !NON_CHARACTER_SUFFIX_REGEX.test(t)) ||
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
    const full = fileUrl || sampleUrl || item.preview_url || "";
    const preview = sampleUrl || fileUrl || item.preview_url || "";
    const formattedTags = rawTags.slice(0, 24).map((t) => ({
      label: t.replace(/_/g, " "),
      query: t
    }));

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
    } else if (!authorName && item.owner && item.owner !== "danbooru") {
      authorName = `@${item.owner}`;
    }

    if (!authorName) {
      const candidateArtistTag = filteredTags.find((t) => t !== characterTag && !t.includes(":") && t !== "triforce");
      if (candidateArtistTag) {
        const cleanArtist = candidateArtistTag.replace(/_\(artist\)$/, "");
        authorName = `@${cleanArtist}`;
        authorHref = `https://safebooru.org/index.php?page=post&s=list&tags=${encodeURIComponent(cleanArtist)}`;
      } else {
        authorName = "Digital Artist";
        domain = "Digital Illustration";
      }
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
