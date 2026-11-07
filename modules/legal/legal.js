document.addEventListener("DOMContentLoaded", () => {
  const tabs = document.querySelectorAll(".legal-tab-btn");
  const indicator = document.querySelector(".legal-segmented-indicator");
  const track = document.querySelector(".legal-segmented-track");
  const sections = Array.from(document.querySelectorAll(".legal-card"));

  let isManualScroll = false;
  let scrollTimeout = null;

  const updateIndicator = (activeBtn) => {
    if (!indicator || !activeBtn || !track) return;
    const trackRect = track.getBoundingClientRect();
    const btnRect = activeBtn.getBoundingClientRect();
    const offsetLeft = btnRect.left - trackRect.left + track.scrollLeft;
    indicator.style.width = `${btnRect.width}px`;
    indicator.style.transform = `translate3d(${offsetLeft}px, 0, 0)`;

    const trackLeft = track.scrollLeft;
    const trackWidth = track.clientWidth;
    const btnLeft = activeBtn.offsetLeft;
    const btnWidth = activeBtn.offsetWidth;

    if (btnLeft < trackLeft || btnLeft + btnWidth > trackLeft + trackWidth) {
      track.scrollTo({
        left: Math.max(0, btnLeft - (trackWidth - btnWidth) / 2),
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
      const offsetPadding = (header?.offsetHeight || 56) + (navContainer?.offsetHeight || 48) + 16;
      const elementPosition = targetEl.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - offsetPadding;

      window.scrollTo({
        top: Math.max(0, offsetPosition),
        behavior: "smooth"
      });

      scrollTimeout = setTimeout(() => {
        isManualScroll = false;
      }, 700);
    });
  });

  const onScroll = () => {
    if (isManualScroll || sections.length === 0) return;

    const scrollY = window.pageYOffset || document.documentElement.scrollTop;
    const viewportHeight = window.innerHeight;
    const docHeight = document.documentElement.scrollHeight;

    if (scrollY + viewportHeight >= docHeight - 40) {
      activateTab(sections[sections.length - 1].id);
      return;
    }

    const header = document.querySelector(".legal-header");
    const navContainer = document.querySelector(".legal-segmented-container");
    const threshold = (header?.offsetHeight || 56) + (navContainer?.offsetHeight || 48) + 24;

    let currentSectionId = sections[0].id;
    for (let i = 0; i < sections.length; i++) {
      const rect = sections[i].getBoundingClientRect();
      if (rect.top <= threshold) {
        currentSectionId = sections[i].id;
      } else {
        break;
      }
    }

    activateTab(currentSectionId);
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
