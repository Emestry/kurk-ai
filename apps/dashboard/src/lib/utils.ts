import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merges conditional Tailwind class fragments into one deduplicated className.
 *
 * @param inputs - Class values produced by `clsx`.
 * @returns A Tailwind-safe class string.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
