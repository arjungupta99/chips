import type { NotificationSettings } from "@chipschat/protocol";
import { DEFAULT_NOTIFICATION_SETTINGS } from "@chipschat/protocol";
import { describe, expect, it } from "vitest";
import type { NeedsYouItem } from "./model.js";
import {
  agentsWords,
  bucketOf,
  digestTitle,
  inQuietHours,
  momentOf,
  planNotices,
  quietSub,
  quietWords,
} from "./notifications.js";

const item = (overrides: Partial<NeedsYouItem>): NeedsYouItem => ({
  kind: "approval",
  tier: "decide",
  id: "apr_1",
  spaceId: "spc_1",
  harnessId: "hrn_scout",
  title: "Email Northwind",
  seq: 1,
  ...overrides,
});

/** Tuesday 10:30, which is nobody's quiet hours by default. */
const DAY = {
  nowMs: Date.parse("2026-09-08T10:30:00.000Z"),
  localMinutes: 10 * 60 + 30,
  localDate: "2026-09-08",
};
/** The same day at 23:15 local: inside a 22:00 to 07:00 window. */
const NIGHT = {
  nowMs: Date.parse("2026-09-08T23:15:00.000Z"),
  localMinutes: 23 * 60 + 15,
  localDate: "2026-09-08",
};

const waiting = [
  item({}),
  item({ id: "apr_2", harnessId: "hrn_ledger", title: "Pay the invoice" }),
  item({ kind: "summary", tier: "review", id: "run_1", title: "PO-4471 confirmed" }),
  item({ kind: "question", tier: "review", id: "ask_1", harnessId: "hrn_ledger" }),
  item({ kind: "checkpoint", tier: "fyi", id: "evt_9", title: "Half way" }),
];

describe("what to notify, by the defaults", () => {
  it("asks about each decision at once, and rolls the rest into one digest per tier", () => {
    const notices = planNotices(waiting, DEFAULT_NOTIFICATION_SETTINGS, DAY);
    expect(notices.map((notice) => notice.key)).toEqual([
      "decision:apr_1",
      "decision:apr_2",
      "digest:review:2026-09-08T10",
      "digest:fyi:2026-09-08",
    ]);
    const review = notices[2];
    expect(review?.kind === "digest" && review.items.map((each) => each.id)).toEqual([
      "run_1",
      "ask_1",
    ]);
    expect(review?.kind === "digest" ? digestTitle(review) : "").toBe("2 things to review");
    const fyi = notices[3];
    expect(fyi?.kind === "digest" ? digestTitle(fyi) : "").toBe("1 thing for later");
  });

  it("names a bucket by the device's own clock: the hour for review, the day for FYI", () => {
    expect(bucketOf("review", DAY)).toBe("2026-09-08T10");
    expect(bucketOf("fyi", DAY)).toBe("2026-09-08");
    expect(bucketOf("decide", DAY)).toBe("2026-09-08");
    // 17:30 on Tuesday in California is already Wednesday in UTC; the person's day is Tuesday.
    const evening = {
      nowMs: Date.parse("2026-09-09T00:30:00.000Z"),
      localMinutes: 17 * 60 + 30,
      localDate: "2026-09-08",
    };
    expect(bucketOf("fyi", evening)).toBe("2026-09-08");
    expect(bucketOf("review", evening)).toBe("2026-09-08T17");
  });
});

describe("the settings", () => {
  it("turn a tier off, and keep a decision through quiet hours unless told nothing breaks through", () => {
    const quiet: NotificationSettings = {
      ...DEFAULT_NOTIFICATION_SETTINGS,
      quiet: { from: "22:00", to: "07:00", breakthrough: "decide" },
    };
    expect(planNotices(waiting, quiet, NIGHT).map((notice) => notice.key)).toEqual([
      "decision:apr_1",
      "decision:apr_2",
    ]);
    const silent: NotificationSettings = {
      ...quiet,
      quiet: { from: "22:00", to: "07:00", breakthrough: "none" },
    };
    expect(planNotices(waiting, silent, NIGHT)).toEqual([]);
    expect(planNotices(waiting, quiet, DAY)).toHaveLength(4);

    const off: NotificationSettings = {
      ...DEFAULT_NOTIFICATION_SETTINGS,
      decide: "off",
      review: "off",
      fyi: "off",
    };
    expect(planNotices(waiting, off, DAY)).toEqual([]);
  });

  it("hear a harness in full, only for its decisions, or not at all", () => {
    const perHarness: NotificationSettings = {
      ...DEFAULT_NOTIFICATION_SETTINGS,
      harnesses: { hrn_ledger: "decide", hrn_scout: "none" },
    };
    // Ledger's question is Review today, which "only its decisions" leaves out; Scout's
    // checkpoint would be the FYI digest, and Scout is muted.
    const notices = planNotices(waiting, perHarness, DAY);
    expect(notices.map((notice) => notice.key)).toEqual(["decision:apr_2"]);
  });
});

describe("quiet hours", () => {
  it("run across midnight, and a window of no width is no window", () => {
    const night = { from: "22:00", to: "07:00", breakthrough: "decide" as const };
    expect(inQuietHours(night, 23 * 60)).toBe(true);
    expect(inQuietHours(night, 3 * 60)).toBe(true);
    expect(inQuietHours(night, 7 * 60)).toBe(false);
    expect(inQuietHours(night, 12 * 60)).toBe(false);
    const lunch = { from: "12:00", to: "13:00", breakthrough: "decide" as const };
    expect(inQuietHours(lunch, 12 * 60 + 30)).toBe(true);
    expect(inQuietHours(lunch, 13 * 60)).toBe(false);
    expect(inQuietHours({ ...lunch, to: "12:00" }, 12 * 60)).toBe(false);
    expect(inQuietHours(undefined, 0)).toBe(false);
  });

  it("read the device's own clock, and so does a digest's day", () => {
    const moment = momentOf(new Date(2026, 8, 8, 23, 15));
    expect(moment.localMinutes).toBe(23 * 60 + 15);
    expect(moment.localDate).toBe("2026-09-08");
    expect(bucketOf("review", momentOf(new Date(2026, 0, 5, 7, 59)))).toBe("2026-01-05T07");
  });
});

describe("what You's rows say of the settings (ADR 0265)", () => {
  it("says quiet hours as their window, or Off", () => {
    expect(quietWords(undefined)).toBe("Off");
    // Said as the device says times: twelve-hour or twenty-four, whichever it keeps.
    expect(quietWords({ from: "22:00", to: "07:00", breakthrough: "decide" })).toMatch(
      /^(10:00\s?PM|22:00)–(7:00\s?AM|0?7:00)$/,
    );
  });

  it("says under Quiet hours what gets through them", () => {
    expect(quietSub(undefined)).toBe("Notifications can come at any hour");
    expect(quietSub({ from: "22:00", to: "07:00", breakthrough: "decide" })).toBe(
      "Only decisions get through",
    );
    expect(quietSub({ from: "22:00", to: "07:00", breakthrough: "none" })).toBe(
      "Nothing gets through, not even decisions",
    );
  });

  it("says what is turned down among the agents, by name when it is one", () => {
    const agents = [
      { id: "a", name: "Kit" },
      { id: "b", name: "Lux" },
      { id: "c", name: "Scout" },
    ];
    expect(agentsWords(agents, {})).toBe("Everything");
    expect(agentsWords(agents, { a: "all" })).toBe("Everything");
    expect(agentsWords(agents, { b: "none" })).toBe("Lux muted");
    expect(agentsWords(agents, { b: "none", c: "none", a: "decide" })).toBe(
      "2 muted, Kit decisions only",
    );
  });
});
