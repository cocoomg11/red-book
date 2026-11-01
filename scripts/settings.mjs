/** Registers every setting from settings-model.mjs (feature toggles live in features.mjs). Nothing is listed in the core settings list. */
import { ID } from "./const.mjs";
import { SETTINGS } from "./settings-model.mjs";

const TYPE = { bool: Boolean, text: String, number: Number, object: Object };

export function register() {
  for (const s of SETTINGS) {
    const cfg = { scope: s.client ? "client" : "world", config: false, type: TYPE[s.type], default: s.default };
    if (s.label) { cfg.name = s.label; cfg.hint = s.hint; }
    if (s.type === "number" && s.min !== undefined) cfg.range = { min: s.min, max: s.max, step: s.step ?? 1 };
    game.settings.register(ID, s.key, cfg);
  }
}

export const get = key => { try { return game.settings.get(ID, key); } catch { return undefined; } };
export const set = (key, v) => game.settings.set(ID, key, v);
