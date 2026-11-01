/**
 * Wanderer's Satchel registration, pure (tested in Node). The Satchel is an optional GM hub (module id `wanderers-satchel`); when it
 * is active, Red Book registers itself through its `api.register()` (see the Satchel's README, "Registration fields"). A
 * registration replaces the Satchel's built-in Red Book adapter. No hard dependency: nothing here runs without the Satchel.
 */
export const SATCHEL_ID = "wanderers-satchel";
/** The hook the Satchel fires once, with its api, when it is ready. */
export const SATCHEL_READY = `${SATCHEL_ID}.ready`;

/**
 * The object passed to `api.register()`. `fns`: { openPanel(), health({ timeoutMs }) } bound to Red Book; `records`: the hidden
 * record settings (never exported or imported); `debugKey`: the Boolean debug setting.
 * Only fields the Satchel knows are passed (it warns about unknown ones).
 * `fixes` (0.7.0): { actionId: () => result } for the health lines' Fix buttons (left out when empty).
 * @param {{ id: string, title: string, openPanel: () => unknown, health: (o?: { timeoutMs?: number }) => unknown, records: readonly string[], debugKey: string, fixes?: Record<string, () => unknown> }} o
 */
export function registration({ id, title, openPanel, health, records, debugKey, fixes }) {
  const fx = Object.fromEntries(Object.entries(fixes ?? {}).filter(([, f]) => typeof f === "function"));
  return {
    id, title,
    openPanel: () => openPanel(),
    health: (opts = {}) => health(opts),
    debugSetting: { namespace: id, key: debugKey },
    skipSettings: [...new Set(records)],
    ...(Object.keys(fx).length ? { fixes: fx } : {})
  };
}

/**
 * Registers with the Satchel when it is active: at once when its api is there, and again on its ready hook (a second registration
 * for the same id just replaces the first). `env`: { active(), api(), once(hook, fn), warn(msg, e) }. Resolves to what register()
 * returned, or null when the Satchel isn't active or has no register().
 */
export function registerWith(reg, env) {
  if (!env.active()) return null;
  const go = api => {
    if (typeof api?.register !== "function") return null;
    try {
      const r = api.register(reg);
      if (r && r.ok === false) env.warn(`Wanderer's Satchel refused the registration: ${r.error}`);
      else if (r?.warnings?.length) env.warn(`Wanderer's Satchel: ${r.warnings.join("; ")}`);
      return r ?? null;
    } catch (e) { env.warn("Wanderer's Satchel registration failed", e); return null; }
  };
  env.once(SATCHEL_READY, api => go(api ?? env.api()));
  return go(env.api());
}
