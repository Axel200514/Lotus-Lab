document.addEventListener("DOMContentLoaded", () => {
  const tabs = document.querySelectorAll(".legal-tab-btn");
  const indicator = document.querySelector(".legal-segmented-indicator");
  const track = document.querySelector(".legal-segmented-track");
  const sections = document.querySelectorAll(".legal-card");

  const updateIndicator = (activeBtn) => {
    if (!indicator || !activeBtn || !track) return;
    const trackRect = track.getBoundingClientRect();
    const btnRect = activeBtn.getBoundingClientRect();
    const offsetLeft = btnRect.left - trackRect.left + track.scrollLeft;
    indicator.style.width = `${btnRect.width}px`;
    indicator.style.transform = `translate3d(${offsetLeft}px, 0, 0)`;
  };

  const initialActive = document.querySelector(".legal-tab-btn.active") || tabs[0];
  if (initialActive) {
    updateIndicator(initialActive);
  }

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      updateIndicator(tab);

      const targetId = tab.dataset.target;
      const targetEl = document.getElementById(targetId);
      if (targetEl) {
        const headerOffset = 140;
        const elementPosition = targetEl.getBoundingClientRect().top;
        const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
        window.scrollTo({
          top: offsetPosition,
          behavior: "smooth"
        });
      }
    });
  });

  window.addEventListener("resize", () => {
    const currentActive = document.querySelector(".legal-tab-btn.active");
    if (currentActive) updateIndicator(currentActive);
  });

  if ("IntersectionObserver" in window && sections.length > 0) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const id = entry.target.id;
            const matchingTab = document.querySelector(`.legal-tab-btn[data-target="${id}"]`);
            if (matchingTab && !matchingTab.classList.contains("active")) {
              tabs.forEach((t) => t.classList.remove("active"));
              matchingTab.classList.add("active");
              updateIndicator(matchingTab);
            }
          }
        });
      },
      {
        rootMargin: "-20% 0px -65% 0px"
      }
    );

    sections.forEach((s) => observer.observe(s));
  }
});
