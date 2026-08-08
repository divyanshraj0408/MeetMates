import { describe, it, expect } from "vitest";
import { groupMessages } from "./groupMessages";

// Helper: build a message at a given minute offset from a fixed base.
const BASE = new Date("2026-08-08T12:00:00.000Z").getTime();
const msg = (id, uid, minutes) => ({
  id,
  uid,
  name: uid,
  text: `msg ${id}`,
  timestamp: new Date(BASE + minutes * 60000).toISOString(),
  reactions: {},
});

describe("groupMessages", () => {
  it("returns an empty array for no messages", () => {
    expect(groupMessages([])).toEqual([]);
    expect(groupMessages(undefined)).toEqual([]);
  });

  it("groups consecutive messages from the same uid", () => {
    const groups = groupMessages([
      msg("a", "u1", 0),
      msg("b", "u1", 1),
      msg("c", "u1", 2),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].messages.map((m) => m.id)).toEqual(["a", "b", "c"]);
  });

  it("starts a new group when the sender changes", () => {
    const groups = groupMessages([
      msg("a", "u1", 0),
      msg("b", "u2", 1),
      msg("c", "u1", 2),
    ]);
    expect(groups.map((g) => g.uid)).toEqual(["u1", "u2", "u1"]);
  });

  it("starts a new group after a gap longer than 5 minutes", () => {
    const groups = groupMessages([
      msg("a", "u1", 0),
      msg("b", "u1", 4),
      msg("c", "u1", 10),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0].messages.map((m) => m.id)).toEqual(["a", "b"]);
    expect(groups[1].messages.map((m) => m.id)).toEqual(["c"]);
  });

  it("gives each group a stable key from its first message", () => {
    const groups = groupMessages([msg("a", "u1", 0), msg("b", "u2", 1)]);
    expect(groups[0].key).toBe("a");
    expect(groups[1].key).toBe("b");
  });

  it("tolerates a message with no timestamp", () => {
    const broken = { id: "x", uid: "u1", name: "u1", text: "hi", reactions: {} };
    expect(() => groupMessages([broken])).not.toThrow();
    expect(groupMessages([broken])).toHaveLength(1);
  });
});
