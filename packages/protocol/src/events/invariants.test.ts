/**
 * Property tests for the protocol's invariants (technical-plan 6.3). The fixtures prove the
 * happy path; these prove the shape of the edge: that validation happens once, that it cannot
 * be talked past, and that a value which survives the edge survives a trip over the wire.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ID_PREFIXES } from "../ids/index.js";
import { EVENT_TYPES, EVENTS, parseEvent } from "./catalogue.js";

const FIXTURES = fileURLToPath(new URL("../../fixtures/", import.meta.url));

function fixture(type: string): Record<string, unknown> {
  return JSON.parse(readFileSync(`${FIXTURES}${type}.json`, "utf8")) as Record<string, unknown>;
}

/** Every envelope field, so a test can knock one out and watch validation notice. */
const REQUIRED_ENVELOPE_FIELDS = ["v", "type", "id", "ts", "workspace_id", "actor"] as const;

describe("validation happens once, at the edge", () => {
  it("survives a JSON round trip unchanged", () => {
    fc.assert(
      fc.property(fc.constantFrom(...EVENT_TYPES), (type) => {
        const first = parseEvent(fixture(type));
        expect(first.ok).toBe(true);
        if (!first.ok) return;
        const second = parseEvent(JSON.parse(JSON.stringify(first.value)));
        expect(second.ok).toBe(true);
        if (second.ok) expect(second.value).toEqual(first.value);
      }),
    );
  });

  it("rejects an event missing any envelope field", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...EVENT_TYPES),
        fc.constantFrom(...REQUIRED_ENVELOPE_FIELDS),
        (type, field) => {
          const broken = fixture(type);
          delete broken[field];
          expect(parseEvent(broken).ok, `${type} without ${field} should be rejected`).toBe(false);
        },
      ),
    );
  });

  it("rejects an id whose prefix belongs to another kind", () => {
    const wrongPrefixes = Object.values(ID_PREFIXES).filter((prefix) => prefix !== "ws");
    fc.assert(
      fc.property(
        fc.constantFrom(...EVENT_TYPES),
        fc.constantFrom(...wrongPrefixes),
        (type, prefix) => {
          const event = fixture(type);
          const ulid = String(event["workspace_id"]).slice("ws_".length);
          expect(parseEvent({ ...event, workspace_id: `${prefix}_${ulid}` }).ok).toBe(false);
        },
      ),
    );
  });

  it("rejects any scalar or array where an event should be", () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.string(), fc.integer(), fc.boolean(), fc.constant(null), fc.array(fc.string())),
        (value) => {
          expect(parseEvent(value).ok).toBe(false);
        },
      ),
    );
  });

  it("rejects a type nothing in the catalogue declares", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 40 }).filter((s) => !EVENT_TYPES.includes(s)),
        (type) => {
          const result = parseEvent({ ...fixture("checkpoint"), type });
          expect(result.ok).toBe(false);
          if (!result.ok) expect(result.error.type).toBe("unknown_type");
        },
      ),
    );
  });

  it("never lets an undeclared field through, whatever it is called", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...EVENT_TYPES),
        fc.string({ minLength: 1, maxLength: 30 }).filter((key) => !key.startsWith("$")),
        fc.jsonValue(),
        (type, key, value) => {
          const event = fixture(type);
          if (key in event) return;
          const result = parseEvent({ ...event, [key]: value });
          // `Object.hasOwn` rather than `toHaveProperty`, which reads a dotted key as a path:
          // a generated field called `.` made this fail for a reason that was not the protocol's.
          if (result.ok) expect(Object.hasOwn(result.value, key)).toBe(false);
        },
      ),
    );
  });
});

describe("the catalogue's shape", () => {
  it("names every event as a dotted or single lowercase word", () => {
    for (const type of EVENT_TYPES) {
      expect(type, `${type} is not a protocol-shaped name`).toMatch(/^[a-z]+(\.[a-z_]+)?$/);
    }
  });

  it("gives every field a description, so the reference is never blank", () => {
    for (const event of EVENTS) {
      for (const [name, field] of Object.entries(event.payload.shape)) {
        expect(
          (field as { description?: string }).description,
          `${event.type}.${name} has no description`,
        ).toBeTruthy();
      }
    }
  });

  it("puts every event in exactly one direction", () => {
    for (const event of EVENTS) {
      expect(["harness_to_chips", "chips_to_harness", "workspace"]).toContain(event.direction);
    }
  });
});
