/** Shared bits for windows and documents: dialogs, our folders, opening a document by UUID. */
import { ID, esc } from "./const.mjs";
import { UI_CLASSES as CORE_UI } from "../vendor/wanderers-core/index.mjs";

export const DialogV2 = () => foundry.applications.api.DialogV2;
export const TextEditorImpl = () => foundry.applications.ux?.TextEditor?.implementation ?? /** @type {any} */ (globalThis).TextEditor;
/** Every Red Book window carries this class: no backdrop blur (styles/red-book.css), shared colours. */
export const WINDOW = "rb-window";
/** wanderers-core's shared look (styles/wanderers-ui.css): put on every Red Book window next to WINDOW. */
export const UI_CLASSES = [...CORE_UI];
/** Plain text escaped for HTML. */
export const escText = s => esc(s);

/** A yes/no dialog; resolves true, false or null (closed). `options` go to DialogV2 (e.g. an `id` to find and close it later). */
export function confirm(title, content, options = {}) {
  return DialogV2().confirm({ classes: [WINDOW, ...UI_CLASSES], window: { title }, content, rejectClose: false, ...options });
}
/** A one-form dialog; resolves to the form's values or null. */
export function form(title, content, label = "OK", width = 460) {
  return DialogV2().prompt({
    classes: [WINDOW, ...UI_CLASSES], window: { title }, content, position: { width },
    ok: { label, callback: (ev, btn) => new foundry.applications.ux.FormDataExtended(btn.form).object }, rejectClose: false
  });
}
export const gmOnly = () => { if (game.user?.isGM) return true; ui.notifications.warn("Red Book: GM only."); return false; };

/** A journal folder by name, made (and marked ours, so cleanup can find it) when missing. */
export async function folder(name) {
  const f = game.folders.find(x => x.type === "JournalEntry" && x.name === name);
  if (f) return f;
  return Folder.create({ name, type: "JournalEntry", flags: { [ID]: { folder: true } } });
}

const safeSync = uuid => { try { return fromUuidSync(uuid, { strict: false }); } catch { return null; } };
export { safeSync };
/** Opens a document's sheet by UUID (journal pages open in their entry). */
export async function openUuid(uuid) {
  /** @type {any} */ let d = null; try { d = await fromUuid(uuid); } catch { }
  if (!d) return ui.notifications.warn("Red Book: that document no longer exists.");
  if (d.documentName === "JournalEntryPage") return d.parent?.sheet?.render(true, { pageId: d.id });
  if (d.documentName === "Scene") return d.sheet?.render(true);
  return d.sheet?.render(true);
}
export const link = (uuid, name) => `<a class="rb-open" data-uuid="${esc(uuid)}">${esc(name)}</a>`;
