import { describe, it, expect } from "vitest";
import { interestSuggest, MAX_SUGGESTIONS } from "./interestSuggest.js";
import { MAX_INTERESTS } from "../../../interests.js";

describe("interestSuggest", () => {
  it("offers the vocabulary when nothing is typed", () => {
    const { suggestions, canAddTyped } = interestSuggest("", []);
    expect(suggestions).toHaveLength(MAX_SUGGESTIONS);
    expect(canAddTyped).toBe(false);
  });

  it("filters suggestions by what is typed", () => {
    const { suggestions } = interestSuggest("chess", []);
    expect(suggestions.map((t) => t.slug)).toEqual(["chess"]);
  });

  it("never suggests something already picked", () => {
    const { suggestions } = interestSuggest("chess", ["chess"]);
    expect(suggestions).toEqual([]);
  });

  it("offers to add words the vocabulary does not have", () => {
    const { canAddTyped, typed } = interestSuggest("Lo-fi Beats", []);
    expect(canAddTyped).toBe(true);
    expect(typed).toBe("lo-fi-beats");
  });

  it("does not offer the same word as both a suggestion and a new tag", () => {
    // This is the double-render trap: "chess" matches the vocabulary chip, so
    // a "+ chess" chip beside it would be two buttons doing the same thing.
    const { suggestions, canAddTyped } = interestSuggest("chess", []);
    expect(suggestions.map((t) => t.slug)).toContain("chess");
    expect(canAddTyped).toBe(false);
  });

  it("does not offer to add a word already picked", () => {
    // It is filtered out of suggestions, so only this check stops it coming
    // back as a "+" chip that would silently do nothing.
    const { suggestions, canAddTyped } = interestSuggest("chess", ["chess"]);
    expect(suggestions).toEqual([]);
    expect(canAddTyped).toBe(false);
  });

  it("treats a typed vocabulary word with odd casing as the existing tag", () => {
    const { canAddTyped } = interestSuggest("  CHESS ", []);
    expect(canAddTyped).toBe(false);
  });

  it("offers nothing to add for text with no letters or digits", () => {
    for (const junk of ["   ", "!!!", "🔥"]) {
      expect(interestSuggest(junk, []).canAddTyped).toBe(false);
    }
  });

  it("stops offering new tags once the board is full", () => {
    const eight = Array.from({ length: MAX_INTERESTS }, (_, i) => `tag-${i}`);
    const { full, canAddTyped } = interestSuggest("something new", eight);
    expect(full).toBe(true);
    expect(canAddTyped).toBe(false);
  });
});
