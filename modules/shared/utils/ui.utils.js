export function showToast(options, customDuration, customType) {
  let opts = {};
  if (typeof options === "string") {
    opts = {
      title: options,
      subtitle: "",
      duration: customDuration || 2800,
      type: customType || "default",
      icon: customType === "success" ? "sparkle" : "default"
    };
  } else if (options && typeof options === "object") {
    opts = {
      title: options.title || options.message || "",
      subtitle: options.subtitle || "",
      duration: options.duration || 3000,
      type: options.type || "default",
      icon: options.icon || (options.type === "success" ? "sparkle" : "default")
    };
  }

  let toast = document.getElementById("toast-notification");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "toast-notification";
    toast.className = "toast-notification";
    document.body.appendChild(toast);
  }

  toast.textContent = "";

  const inner = document.createElement("div");
  inner.className = "toast-inner";

  const iconWrap = document.createElement("div");
  iconWrap.className = `toast-icon-badge ${opts.type}`;

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "16");
  svg.setAttribute("height", "16");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2.4");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");

  if (opts.icon === "sparkle" || opts.type === "success") {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z");
    svg.appendChild(path);
  } else if (opts.icon === "download") {
    const path1 = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path1.setAttribute("d", "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4");
    const poly = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    poly.setAttribute("points", "7 10 12 15 17 10");
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", "12");
    line.setAttribute("y1", "15");
    line.setAttribute("x2", "12");
    line.setAttribute("y2", "3");
    svg.appendChild(path1);
    svg.appendChild(poly);
    svg.appendChild(line);
  } else if (opts.icon === "check") {
    const poly = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    poly.setAttribute("points", "20 6 9 17 4 12");
    svg.appendChild(poly);
  } else {
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", "12");
    circle.setAttribute("cy", "12");
    circle.setAttribute("r", "10");
    const line1 = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line1.setAttribute("x1", "12");
    line1.setAttribute("y1", "16");
    line1.setAttribute("x2", "12");
    line1.setAttribute("y2", "12");
    const line2 = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line2.setAttribute("x1", "12");
    line2.setAttribute("y1", "8");
    line2.setAttribute("x2", "12.01");
    line2.setAttribute("y2", "8");
    svg.appendChild(circle);
    svg.appendChild(line1);
    svg.appendChild(line2);
  }
  iconWrap.appendChild(svg);
  inner.appendChild(iconWrap);

  const textWrap = document.createElement("div");
  textWrap.className = "toast-text-wrap";

  const titleEl = document.createElement("span");
  titleEl.className = "toast-title";
  titleEl.textContent = opts.title;
  textWrap.appendChild(titleEl);

  if (opts.subtitle) {
    const subEl = document.createElement("span");
    subEl.className = "toast-subtitle";
    subEl.textContent = opts.subtitle;
    textWrap.appendChild(subEl);
  }
  inner.appendChild(textWrap);

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "toast-close-btn";
  closeBtn.textContent = "×";
  closeBtn.title = "Dismiss";
  inner.appendChild(closeBtn);

  toast.appendChild(inner);

  const progressWrap = document.createElement("div");
  progressWrap.className = "toast-progress";
  const progressBar = document.createElement("div");
  progressBar.className = "toast-progress-bar";
  progressBar.style.animationDuration = `${opts.duration}ms`;
  progressWrap.appendChild(progressBar);
  toast.appendChild(progressWrap);

  toast.className = `toast-notification toast-${opts.type} d-none`;
  void toast.offsetWidth;
  toast.classList.remove("d-none");
  toast.classList.add("show");

  const dismiss = () => {
    if (window._toastTimeout) {
      clearTimeout(window._toastTimeout);
      window._toastTimeout = null;
    }
    toast.classList.remove("show");
    setTimeout(() => toast.classList.add("d-none"), 220);
  };

  closeBtn.onclick = (e) => {
    e.stopPropagation();
    dismiss();
  };

  toast.onclick = () => dismiss();

  if (window._toastTimeout) {
    clearTimeout(window._toastTimeout);
  }
  window._toastTimeout = setTimeout(() => dismiss(), opts.duration);
}

export async function copyToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {}
  }

  try {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.className = "visually-hidden";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    textArea.setSelectionRange(0, 99999);
    document.execCommand("copy");
    document.body.removeChild(textArea);
    return true;
  } catch {
    return false;
  }
}
