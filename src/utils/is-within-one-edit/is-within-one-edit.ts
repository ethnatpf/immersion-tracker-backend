export function isWithinOneEdit(first: string, second: string): boolean {
  if (first === second) return true;
  if (Math.abs(first.length - second.length) > 1) return false;

  let index = 0;
  while (
    index < Math.min(first.length, second.length) &&
    first[index] === second[index]
  ) {
    index++;
  }

  if (first.length === second.length) {
    return (
      first.slice(index + 1) === second.slice(index + 1) ||
      (first[index] === second[index + 1] &&
        first[index + 1] === second[index] &&
        first.slice(index + 2) === second.slice(index + 2))
    );
  }
  const [shorter, longer] =
    first.length < second.length ? [first, second] : [second, first];
  return shorter.slice(index) === longer.slice(index + 1);
}
