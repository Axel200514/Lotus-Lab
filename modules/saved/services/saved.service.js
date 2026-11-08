import { StorageUtils } from "../../shared/utils/storage.utils.js?v=3.4";
import { PinModel } from "../../shared/models/pin.model.js?v=3.4";

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
}
