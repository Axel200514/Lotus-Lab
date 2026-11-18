import { API_CONFIG } from "../../../app/app.config.js?v=6.1";

export class HttpService {
  static async fetchWithTimeout(url, options = {}) {
    const { timeoutMs = API_CONFIG.timeoutMs, signal = null, ...fetchOptions } = options;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const onAbort = () => controller.abort();

    if (signal) {
      if (signal.aborted) {
        clearTimeout(timeoutId);
        controller.abort();
      } else {
        signal.addEventListener("abort", onAbort, { once: true });
      }
    }

    try {
      return await fetch(url, {
        ...fetchOptions,
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeoutId);
      if (signal) {
        signal.removeEventListener("abort", onAbort);
      }
    }
  }

  async request(url, options = {}) {
    const response = await HttpService.fetchWithTimeout(url, options);
    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }
    return await response.json();
  }

  get(url, params = {}, options = {}) {
    const query = new URLSearchParams(params).toString();
    const fullUrl = query ? `${url}?${query}` : url;
    return this.request(fullUrl, {
      method: "GET",
      ...options
    });
  }
}
