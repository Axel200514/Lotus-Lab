import { ExploreService } from "../../services/explore.service.js?v=5.4";
import { StorageUtils } from "../../../shared/utils/storage.utils.js?v=5.4";

export class ExploreMainComponent {
  constructor(container, onTopicSelect, service = null) {
    this.container = container;
    this.onTopicSelect = onTopicSelect;
    this.service = service || new ExploreService();
    this.boardTemplate = document.getElementById("explore-board-card-template");
    this.popularTemplate = document.getElementById("explore-popular-section-template");
    this.thumbTemplate = document.getElementById("explore-popular-thumb-template");
    this.recentTemplate = document.getElementById("explore-recent-searches-template");
    this.ideasTemplate = document.getElementById("explore-ideas-template");
    this.ideaCardTemplate = document.getElementById("explore-idea-card-template");
  }

  async render(forceRefresh = false) {
    this.container.textContent = "";

    const [boards, popularSections, ideas] = await Promise.all([
      this.service.getFeaturedBoards(forceRefresh),
      this.service.getPopularSections(forceRefresh),
      this.service.getIdeasForYou(forceRefresh)
    ]);

    const recentSearches = StorageUtils.getRecentSearches();

    const wrapper = document.createElement("div");
    wrapper.className = "explore-container";

    const fragment = document.createDocumentFragment();

    if (Array.isArray(recentSearches) && recentSearches.length > 0) {
      const recentSection = this.buildRecentSearchesSection(recentSearches);
      if (recentSection) fragment.appendChild(recentSection);
    }

    if (Array.isArray(ideas) && ideas.length > 0) {
      const ideasSection = this.buildIdeasForYouSection(ideas);
      if (ideasSection) fragment.appendChild(ideasSection);
    }

    if (Array.isArray(boards) && boards.length > 0) {
      const boardsSection = this.buildFeaturedBoards(boards);
      if (boardsSection) fragment.appendChild(boardsSection);
    }

    const normalizeTopicKey = (str) =>
      String(str || "")
        .toLowerCase()
        .replace(/&#039;/g, "'")
        .replace(/&amp;/g, "&")
        .replace(/\([^)]*\)/g, "")
        .replace(/[^a-z0-9]/g, "");

    const existingBoardKeys = new Set(
      (boards || []).flatMap((b) => [normalizeTopicKey(b.title), normalizeTopicKey(b.tag)]).filter(Boolean)
    );

    const seenPopularKeys = new Set();
    const validSections = popularSections.filter((s) => {
      if (!s || !Array.isArray(s.thumbnails) || s.thumbnails.length < 4) return false;
      const normTitle = normalizeTopicKey(s.title);
      const normTag = normalizeTopicKey(s.tag);
      if (existingBoardKeys.has(normTitle) || existingBoardKeys.has(normTag)) return false;
      if (seenPopularKeys.has(normTitle)) return false;
      seenPopularKeys.add(normTitle);
      return true;
    });

    if (validSections.length < 4) {
      for (const s of popularSections) {
        if (!s || !Array.isArray(s.thumbnails) || s.thumbnails.length < 4) continue;
        const normTitle = normalizeTopicKey(s.title);
        if (seenPopularKeys.has(normTitle)) continue;
        seenPopularKeys.add(normTitle);
        validSections.push(s);
        if (validSections.length >= 4) break;
      }
    }

    validSections.forEach((section) => {
      const sectionNode = this.buildPopularSection(section);
      fragment.appendChild(sectionNode);
    });

    wrapper.appendChild(fragment);
    this.container.appendChild(wrapper);
    return Array.isArray(boards) && boards.length > 0;
  }

  buildRecentSearchesSection(searches) {
    if (!this.recentTemplate) return null;
    const clone = this.recentTemplate.content.cloneNode(true);
    const section = clone.querySelector(".explore-recent-section");
    const chipsRow = clone.querySelector(".recent-chips-row");
    const clearBtn = clone.querySelector(".recent-clear-btn");

    clearBtn.addEventListener("click", () => {
      StorageUtils.clearRecentSearches();
      section.remove();
    });

    searches.forEach((query) => {
      const chip = document.createElement("div");
      chip.className = "recent-chip";

      const text = document.createElement("span");
      text.className = "recent-chip-text";
      text.textContent = query;
      text.addEventListener("click", () => {
        if (typeof this.onTopicSelect === "function") {
          this.onTopicSelect(query, query);
        }
      });

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "recent-chip-remove";
      removeBtn.textContent = "×";
      removeBtn.title = `Remove ${query}`;
      removeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        StorageUtils.removeRecentSearch(query);
        chip.remove();
        if (chipsRow.children.length === 0) {
          section.remove();
        }
      });

      chip.appendChild(text);
      chip.appendChild(removeBtn);
      chipsRow.appendChild(chip);
    });

    return section;
  }

  cleanText(str) {
    return String(str || "")
      .replace(/&#039;/g, "'")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"');
  }

  buildIdeasForYouSection(ideas) {
    if (!this.ideasTemplate || !this.ideaCardTemplate) return null;
    const clone = this.ideasTemplate.content.cloneNode(true);
    const section = clone.querySelector(".explore-ideas-section");
    const grid = clone.querySelector(".ideas-grid");
    const fragment = document.createDocumentFragment();

    ideas.forEach((idea) => {
      const cardClone = this.ideaCardTemplate.content.cloneNode(true);
      const card = cardClone.querySelector(".idea-card");
      const img = cardClone.querySelector(".idea-img");
      const title = cardClone.querySelector(".idea-title");
      const badge = cardClone.querySelector(".idea-badge");

      const displayTitle = this.cleanText(idea.title);
      img.src = idea.previewUrl;
      img.alt = displayTitle;
      title.textContent = displayTitle;
      badge.textContent = idea.badge || "Idea for you";

      card.addEventListener("click", () => {
        if (typeof this.onTopicSelect === "function") {
          this.onTopicSelect(idea.query, idea.title);
        }
      });

      fragment.appendChild(cardClone);
    });

    grid.appendChild(fragment);
    return section;
  }

  buildFeaturedBoards(boards) {
    if (!this.boardTemplate || !Array.isArray(boards) || boards.length === 0) return null;
    const section = document.createElement("section");

    const header = document.createElement("div");
    header.className = "explore-section-header";

    const title = document.createElement("h2");
    title.className = "explore-section-title";
    title.textContent = "Visual Trends on Lotus";

    header.appendChild(title);
    section.appendChild(header);

    const grid = document.createElement("div");
    grid.className = "boards-grid";

    const boardsFragment = document.createDocumentFragment();

    boards.forEach((board) => {
      const clone = this.boardTemplate.content.cloneNode(true);
      const card = clone.querySelector(".board-card");
      const mainImg = clone.querySelector(".board-main-img");
      const sub1 = clone.querySelector(".board-sub-1");
      const sub2 = clone.querySelector(".board-sub-2");
      const bTitle = clone.querySelector(".board-title");
      const bAuthorName = clone.querySelector(".author-name");
      const stats = clone.querySelector(".board-stats");

      const displayTitle = this.cleanText(board.title);
      mainImg.src = board.previews[0];
      mainImg.alt = displayTitle;
      mainImg.onerror = () => {
        if (board.previews[1]) mainImg.src = board.previews[1];
      };

      sub1.src = board.previews[1] || board.previews[0];
      sub1.alt = displayTitle;
      sub1.onerror = () => {
        if (board.previews[0]) sub1.src = board.previews[0];
      };

      sub2.src = board.previews[2] || board.previews[0];
      sub2.alt = displayTitle;
      sub2.onerror = () => {
        if (board.previews[0]) sub2.src = board.previews[0];
      };

      bTitle.textContent = displayTitle;
      bAuthorName.textContent = `${board.author} `;
      const countFormatted = new Intl.NumberFormat("en", {
        notation: "compact",
        maximumFractionDigits: 1
      }).format(board.pinCount || 0);
      stats.textContent = `${countFormatted} Pins · Active`;

      card.addEventListener("click", () => {
        if (typeof this.onTopicSelect === "function") {
          this.onTopicSelect(board.tag, board.title);
        }
      });

      boardsFragment.appendChild(clone);
    });

    grid.appendChild(boardsFragment);
    section.appendChild(grid);
    return section;
  }

  buildPopularSection(item) {
    const clone = this.popularTemplate.content.cloneNode(true);
    const section = clone.querySelector("section");
    const titleText = clone.querySelector(".explore-popular-title");
    const shortcutBtn = clone.querySelector(".explore-search-shortcut");
    const row = clone.querySelector(".popular-row");

    const displayTitle = this.cleanText(item.title);
    titleText.textContent = displayTitle;
    shortcutBtn.title = `Explore ${displayTitle}`;

    const thumbsFragment = document.createDocumentFragment();
    const seenThumbKeys = new Set();

    item.thumbnails.forEach((thumb) => {
      const src = typeof thumb === "string" ? thumb : (thumb ? thumb.url : "");
      if (!src) return;
      const m = src.match(/([a-f0-9]{32})/i);
      const thumbKey = m ? m[1].toLowerCase() : src.split("/").pop().toLowerCase();
      if (seenThumbKeys.has(thumbKey)) return;
      seenThumbKeys.add(thumbKey);

      const thumbClone = this.thumbTemplate.content.cloneNode(true);
      const wrapper = thumbClone.querySelector(".popular-thumb-wrapper");
      const img = thumbClone.querySelector(".popular-thumb");

      const w = typeof thumb === "object" ? Number(thumb.width) : 0;
      const h = typeof thumb === "object" ? Number(thumb.height) : 0;

      img.width = w || 240;
      img.height = h || 320;
      img.src = src;
      img.alt = item.title;

      img.onerror = () => {
        if (wrapper && wrapper.parentNode) {
          wrapper.remove();
        }
      };

      thumbsFragment.appendChild(thumbClone);
    });

    row.appendChild(thumbsFragment);

    section.addEventListener("click", () => {
      if (typeof this.onTopicSelect === "function") {
        this.onTopicSelect(item.query || item.tag, item.title);
      }
    });

    return section;
  }
}
