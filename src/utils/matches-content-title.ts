import { isWithinOneEdit } from "./is-within-one-edit/is-within-one-edit.js";

export function matchesContentTitle(
  title: string,
  normalizedQuery: string,
): boolean {
  const normalizedTitle = title.toLowerCase();
  return (
    normalizedTitle.includes(normalizedQuery) ||
    (normalizedQuery.length >= 4 &&
      // Typo tolerance is only supported for single word queries.
      !/\s/u.test(normalizedQuery) &&
      normalizedTitle
        .split(/\s+/u)
        .some((word) => isWithinOneEdit(normalizedQuery, word)))
  );
}
