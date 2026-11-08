const USE_LOCAL_PROXY = false;
const LOCAL_PORT = 8787;
const host = typeof window !== "undefined" && window.location.hostname ? window.location.hostname : "127.0.0.1";
const BASE_URL = USE_LOCAL_PROXY
  ? `http://${host}:${LOCAL_PORT}`
  : "https://lotus-proxy.marcuslvl13.workers.dev";

export const API_CONFIG = {
  safebooruProxyEndpoint: `${BASE_URL}/api/safebooru`,
  downloadProxyEndpoint: `${BASE_URL}/api/download`,
  trendingEndpoint: `${BASE_URL}/api/trending`,
  timeoutMs: 9500,
  defaultLimit: 24
};

export const APP_ROUTES = {
  home: "",
  explore: "explore",
  saved: "saved"
};
