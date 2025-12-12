/**
 * Title case a string (capitalize first letter of each word)
 * Example: "natural causes" → "Natural Causes"
 */
export function toTitleCase(str: string): string {
  return str
    .toLowerCase()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
}
