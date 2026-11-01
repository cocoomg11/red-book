/**
 * Socket request schemas (pure; tested in Node). Every request another client sends to the recording (leader) client is read through
 * these by wanderers-core before a handler runs: unknown kinds, wrong types, unknown fields, oversized payloads and malformed request
 * ids are refused, and the sender is Foundry's sender id only (there is no payload user field to fall back to). `from: "gm"` kinds
 * are refused from players. Core also rate-limits requests per user.
 */
import { defineRequests } from "../vendor/wanderers-core/index.mjs";

/** Event types another module may log (session-model TYPES keys); checked loosely here, strictly by the model. */
/** @type {import("../vendor/wanderers-core/socket-model.mjs").Field} */
const TYPE = { type: "string", min: 1, max: 40, pattern: /^[A-Za-z]+$/ };

export const REQUESTS = defineRequests({
  start: { fields: {}, from: "gm" },
  end: { fields: {}, from: "gm" },
  note: { fields: { text: { type: "string", min: 1, max: 2000 }, thread: { type: "boolean", optional: true }, private: { type: "boolean", optional: true } }, from: "gm", maxBytes: 8192 },
  log: {
    fields: {
      type: TYPE, text: { type: "string", max: 2000 },
      refs: { type: "array", of: { type: "uuid" }, max: 20, optional: true }, private: { type: "boolean", optional: true }
    },
    from: "gm", maxBytes: 16384
  },
  /** 0.5.0: the toolkit's quest hook heard on another GM tab, relayed to the recording tab (ids only, like the hook). */
  quest: { fields: { questId: { type: "id" }, change: { type: "string", oneOf: ["started", "completed", "failed", "objective", "updated", "assigned"] } }, from: "gm", maxBytes: 512 },
  /**
   * 0.5.0: the toolkit's journey hook heard on another GM tab, relayed to the recording tab (GMs only; players' clients never relay).
   * The same fields as the hook (see README, Integrations); session-model readJourney() reads them again.
   */
  journey: {
    fields: {
      kind: { type: "string", oneOf: ["hex", "flight"] },
      fromId: { type: "string", max: 64, optional: true }, toId: { type: "string", max: 64, optional: true },
      fromName: { type: "string", max: 200, optional: true }, toName: { type: "string", max: 200, optional: true },
      hours: { type: "number", min: 0, max: 100000, optional: true },
      cost: { type: "object", fields: { gp: { type: "number", min: 0, optional: true }, sp: { type: "number", min: 0, optional: true }, cp: { type: "number", min: 0, optional: true } }, optional: true },
      partyId: { type: "string", max: 64, optional: true }
    },
    from: "gm", maxBytes: 2048
  },
  /** A rest finished on whichever client took it (players too); the handler checks the sender owns the actor. */
  rest: { fields: { uuid: { type: "uuid" }, long: { type: "boolean" } }, maxBytes: 1024 },
  /** A journal or page shown with Journal.show; the handler checks the sender owns the document. */
  journal: { fields: { uuid: { type: "uuid" }, force: { type: "boolean" }, users: { type: "number", int: true, min: 0, max: 10000 } }, maxBytes: 1024 }
});
