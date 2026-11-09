# Lotus

Lotus is a modern, high-performance visual art discovery client inspired by Pinterest. It allows users to explore trending anime and video game franchises, search community tags, filter artwork, save favorite pins locally, and view creator attribution.

🌐 **Live Demo**: [https://lotus-lab.pages.dev/](https://lotus-lab.pages.dev/)

> **Disclaimer**: This is a personal, non-commercial educational study project built to demonstrate high-performance Vanilla JavaScript SPA architecture, clean code, and GPU-accelerated rendering. It does not host, store, or sell any media files; all metadata is parsed from public imageboard APIs (Safebooru).

---

## Interface & Preview

### 1. Main Feed (Masonry Layout)
Staggered multi-column gallery with infinite scrolling, category chips, and zero layout shift.

| Desktop View | Mobile View |
| :---: | :---: |
| ![Lotus Home Feed Desktop](docs/assets/pc-home.png) | <img src="docs/assets/mobile-home.jpg" width="320" alt="Lotus Home Feed Mobile"> |

### 2. Search & Tag Filtering
Real-time search with natural language query normalization and interactive tag suggestion chips.

| Desktop View | Mobile View |
| :---: | :---: |
| ![Lotus Search Desktop](docs/assets/pc-search.png) | <img src="docs/assets/mobile-search.jpg" width="320" alt="Lotus Search Mobile"> |

### 3. Pin Detail & Artist Attribution
Fullscreen modal inspection with real image dimensions, verified artist links (Pixiv, Twitter / X), direct download, and one-tap bookmarking.

| Desktop View | Mobile View |
| :---: | :---: |
| ![Lotus Pin Detail Desktop](docs/assets/pc-modal.png) | <img src="docs/assets/mobile-modal.jpg" width="320" alt="Lotus Pin Detail Mobile"> |

### 4. Explore & Visual Trends
Curated franchise boards with live pin counters, recent search history, and personalized idea recommendations.

| Desktop View | Mobile View |
| :---: | :---: |
| ![Lotus Explore Desktop](docs/assets/pc-explore.png) | <img src="docs/assets/mobile-explore.jpg" width="320" alt="Lotus Explore Mobile"> |

### 5. Collections (Saved Pins)
Private, local device pin bookmarking stored via `localStorage` without accounts or tracking.

| Desktop View | Mobile View |
| :---: | :---: |
| ![Lotus Collections Desktop](docs/assets/pc-collections.png) | <img src="docs/assets/mobile-collections.jpg" width="320" alt="Lotus Collections Mobile"> |

---

## Features

- **Dynamic Visual Trends**: Real-time franchise aggregation and official pin count resolution directly from public imageboards.
- **Fluid Masonry Feed**: Responsive, staggered multi-column image grid with infinite scroll and touch-enabled pull-to-refresh on mobile.
- **Instant Search & Tag Filtering**: Search by tags with interactive category chips and instant debounced queries.
- **Local Pin Collection**: Save, bookmark, and manage favorite pins locally on your device with no accounts, trackers, or databases required.
- **Rich Pin Detail Modal**: Fullscreen visual inspection with download options, image dimensions, and direct artist attribution links (Pixiv, Twitter / X, ArtStation, etc.).
- **Mobile First & Glassmorphic UI**: Custom Outfit typography, GPU-accelerated backdrop blurs, tactile spring animations, and zero-layout-shift (CLS) image pre-sizing.

---

## Tech Stack

- **Language**: Vanilla JavaScript (ES Modules, modern ES2022+)
- **Architecture**: Single Page Application (SPA) with Hash-based Router
- **DOM Engine**: Native `<template>` cloning and `DocumentFragment` batch insertions for minimum reflows and repaints
- **Styling**: Modern CSS3 (Custom Properties / CSS Variables, Flexbox, Multi-column CSS layouts, Media Queries)
- **Animation**: 100% GPU compositor-driven animations (`transform`, `opacity`) running at 60–120 FPS
- **Typography**: Local Outfit font family (Light, Regular, SemiBold, ExtraBold)
- **State & Caching**: Client-side `localStorage` with versioned cache busting and strict payload validation
- **Data Source**: Safebooru Public DAPI (`post` and `tag` endpoints)

---

## Project Structure

```text
Lotus-Lab/
├── index.html                      # Main entry point and HTML templates
├── legal.html                      # Standalone Legal, Terms, and Attribution page
├── data/                           # Decoupled tag resolution dictionary (CDN static)
├── docs/                           # Documentation and visual preview assets
├── styles/                         # Global design system & styles
│   ├── Fonts/                      # Outfit font files (.ttf)
│   ├── variables.css               # Design tokens, color palette, and font declarations
│   ├── reset.css                   # Normalization and scroll behaviors
│   ├── layout.css                  # Header, navigation, and masonry grid layouts
│   └── utilities.css               # Utility classes
├── modules/
│   ├── shared/                     # Reusable UI components, modals, and utilities
│   ├── pins/                       # Pin masonry grid and card components
│   ├── explore/                    # Visual trend boards and ideas carousel
│   ├── search/                     # Search bar and tag chip filters
│   ├── saved/                      # Bookmarking and saved pins collection
│   └── legal/                      # Legal page scroll spy controller
└── app/
    ├── app.js                      # Application bootstrap and lifecycle
    ├── app.routes.js               # Route mapping
    └── app.config.js               # Application endpoints and configuration
```
