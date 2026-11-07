document.addEventListener("DOMContentLoaded", () => {
  const tabs = document.querySelectorAll(".legal-tab-btn");
  const indicator = document.querySelector(".legal-segmented-indicator");
  const track = document.querySelector(".legal-segmented-track");
  const sections = Array.from(document.querySelectorAll(".legal-card"));

  let isManualScroll = false;
  let scrollTimeout = null;

  const updateIndicator = (activeBtn) => {
    if (!indicator || !activeBtn || !track) return;
    const offsetLeft = activeBtn.offsetLeft;
    const width = activeBtn.offsetWidth;
    indicator.style.width = `${width}px`;
    indicator.style.transform = `translate3d(${offsetLeft}px, 0, 0)`;

    const trackLeft = track.scrollLeft;
    const trackWidth = track.clientWidth;

    if (offsetLeft < trackLeft || offsetLeft + width > trackLeft + trackWidth) {
      track.scrollTo({
        left: Math.max(0, offsetLeft - (trackWidth - width) / 2),
        behavior: "smooth"
      });
    }
  };

  const initialActive = document.querySelector(".legal-tab-btn.active") || tabs[0];
  if (initialActive) {
    updateIndicator(initialActive);
  }

  const activateTab = (targetId) => {
    const matchingTab = document.querySelector(`.legal-tab-btn[data-target="${targetId}"]`);
    if (!matchingTab || matchingTab.classList.contains("active")) return;
    tabs.forEach((t) => t.classList.remove("active"));
    matchingTab.classList.add("active");
    updateIndicator(matchingTab);
  };

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const targetId = tab.dataset.target;
      const targetEl = document.getElementById(targetId);
      if (!targetEl) return;

      isManualScroll = true;
      clearTimeout(scrollTimeout);
      tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      updateIndicator(tab);

      const header = document.querySelector(".legal-header");
      const navContainer = document.querySelector(".legal-segmented-container");
      const offsetPadding = (header?.offsetHeight || 0) + (navContainer?.offsetHeight || 0) + 16;
      const elementPosition = targetEl.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - offsetPadding;

      window.scrollTo({
        top: Math.max(0, offsetPosition),
        behavior: "smooth"
      });

      scrollTimeout = setTimeout(() => {
        isManualScroll = false;
      }, 750);
    });
  });

  const onScroll = () => {
    if (isManualScroll || sections.length === 0) return;

    const viewportHeight = window.innerHeight;
    const scrollY = window.pageYOffset || document.documentElement.scrollTop;
    const docHeight = document.documentElement.scrollHeight;

    const lastSection = sections[sections.length - 1];
    const lastRect = lastSection.getBoundingClientRect();

    if (
      scrollY + viewportHeight >= docHeight - 48 ||
      (lastRect.bottom <= viewportHeight + 12 && lastRect.top < viewportHeight * 0.75)
    ) {
      activateTab(lastSection.id);
      return;
    }

    const midPoint = viewportHeight * 0.45;
    let closestSection = sections[0];
    let minDistance = Infinity;

    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];
      const rect = section.getBoundingClientRect();

      if (rect.top <= midPoint && rect.bottom >= midPoint) {
        closestSection = section;
        break;
      }

      const center = rect.top + rect.height / 2;
      const distance = Math.abs(center - midPoint);
      if (distance < minDistance) {
        minDistance = distance;
        closestSection = section;
      }
    }

    activateTab(closestSection.id);
  };

  let ticking = false;
  window.addEventListener(
    "scroll",
    () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          onScroll();
          ticking = false;
        });
        ticking = true;
      }
    },
    { passive: true }
  );

  window.addEventListener("resize", () => {
    const currentActive = document.querySelector(".legal-tab-btn.active");
    if (currentActive) updateIndicator(currentActive);
  });
});
