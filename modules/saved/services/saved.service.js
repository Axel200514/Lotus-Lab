import { StorageUtils } from "../../shared/utils/storage.utils.js?v=5.0";
import { PinModel } from "../../shared/models/pin.model.js?v=5.0";

export class SavedService {
  getSavedPins() {
    const rawList = StorageUtils.getSavedPins();
    return rawList.map((item) => new PinModel(item));
  }

  getAllSaved() {
    return this.getSavedPins();
  }

  isSaved(pinId) {
    return StorageUtils.isSaved(pinId);
  }

  toggleSave(pin) {
    return StorageUtils.toggleSave(pin);
  }

  importPins(importedData) {
    let pinList = [];
    if (importedData && typeof importedData === "object" && !Array.isArray(importedData)) {
      if (importedData.app && importedData.app !== "Lotus") {
        throw new Error("Invalid format: collection does not match Lotus signature");
      }
      if (Array.isArray(importedData.pins)) {
        pinList = importedData.pins;
      } else {
        throw new Error("Invalid format: collection has no pins");
      }
    } else if (Array.isArray(importedData)) {
      pinList = importedData;
    } else {
      throw new Error("Invalid format: expected a Lotus collection (.json)");
    }

    const currentPins = StorageUtils.getSavedPins();
    const existingIds = new Set(currentPins.map((p) => String(p.id)));
    const existingArtKeys = new Set(
      currentPins.map((p) => p.artworkKey || `sb_${p.id}`).filter(Boolean)
    );

    const newPins = [];
    let skippedCount = 0;

    for (const raw of pinList) {
      if (!raw || typeof raw !== "object") {
        skippedCount++;
        continue;
      }

      const rawImg = raw.previewUrl || raw.image || raw.sampleUrl || raw.fullUrl || "";
      if (!rawImg || typeof rawImg !== "string" || !/^https?:\/\//i.test(rawImg.trim())) {
        skippedCount++;
        continue;
      }

      const strId = String(raw.id || "");
      const artKey = raw.artworkKey || (strId ? `sb_${strId}` : "");

      if ((strId && existingIds.has(strId)) || (artKey && existingArtKeys.has(artKey))) {
        skippedCount++;
        continue;
      }

      const model = new PinModel(raw);
      if (!model.previewUrl) {
        skippedCount++;
        continue;
      }

      if (model.id) {
        existingIds.add(String(model.id));
      }
      if (model.artworkKey) {
        existingArtKeys.add(model.artworkKey);
      }
      newPins.push(model.toCompact());
    }

    if (newPins.length > 0) {
      const compactedCurrent = currentPins.map((p) => new PinModel(p).toCompact());
      const merged = [...newPins, ...compactedCurrent];
      try {
        localStorage.setItem("lotus_saved_pins", JSON.stringify(merged));
      } catch {
        throw new Error("Local storage quota exceeded");
      }
      StorageUtils.clearIdeasCache();
    }

    return {
      addedCount: newPins.length,
      skippedCount,
      totalCount: currentPins.length + newPins.length
    };
  }

  exportCollection() {
    const pins = StorageUtils.getSavedPins();
    if (pins.length === 0) return 0;

    const compactPins = pins.map((p) => {
      const model = p instanceof PinModel ? p : new PinModel(p);
      return model.toCompact();
    });

    const payload = {
      app: "Lotus",
      version: 2,
      count: compactPins.length,
      pins: compactPins
    };
    const jsonStr = JSON.stringify(payload, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const dateStr = new Date().toISOString().slice(0, 10);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lotus-collection-${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return compactPins.length;
  }
}
