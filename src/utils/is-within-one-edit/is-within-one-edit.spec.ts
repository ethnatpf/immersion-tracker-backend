import { isWithinOneEdit } from "./is-within-one-edit.js";

describe("isWithinOneEdit", () => {
  it.each(["", "a", "anime", "letter"])(
    "accepts identical strings: %j",
    (value) => {
      expect(isWithinOneEdit(value, value)).toBe(true);
    },
  );

  describe.each([
    {
      edit: "insertion or deletion",
      pairs: [
        ["", "a"],
        ["book", "xbook"],
        ["book", "bozok"],
        ["book", "books"],
        ["let", "lett"],
      ],
    },
    {
      edit: "substitution",
      pairs: [
        ["a", "b"],
        ["book", "cook"],
        ["book", "boak"],
        ["book", "boot"],
      ],
    },
    {
      edit: "adjacent transposition",
      pairs: [
        ["ab", "ba"],
        ["abcd", "bacd"],
        ["abcd", "acbd"],
        ["abcd", "abdc"],
        ["aab", "aba"],
      ],
    },
  ])("one $edit", ({ pairs }) => {
    it.each(pairs)("accepts %j and %j in either order", (first, second) => {
      expect(isWithinOneEdit(first, second)).toBe(true);
      expect(isWithinOneEdit(second, first)).toBe(true);
    });
  });

  it.each([
    ["", "ab"],
    ["book", "bookcase"],
    ["book", "back"],
    ["abcd", "abxy"],
    ["abcd", "badc"],
    ["abcd", "cbad"],
    ["book", "cooks"],
    ["abcd", "xbacd"],
  ])(
    "rejects multiple edits between %j and %j in either order",
    (first, second) => {
      expect(isWithinOneEdit(first, second)).toBe(false);
      expect(isWithinOneEdit(second, first)).toBe(false);
    },
  );
});
