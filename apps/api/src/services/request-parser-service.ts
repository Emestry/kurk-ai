import { RequestCategory } from "@/generated/prisma/enums.js";
import { withDbTransaction } from "@/lib/db.js";
import { ApiError } from "@/lib/errors.js";
import { requireStoredText } from "@/lib/input.js";

const quantityWords = new Map<string, number>([
  ["a", 1],
  ["an", 1],
  ["one", 1],
  ["two", 2],
  ["three", 3],
  ["four", 4],
  ["five", 5],
  ["six", 6],
  ["seven", 7],
  ["eight", 8],
  ["nine", 9],
  ["ten", 10],
  ["extra", 1],
]);

function normalizeText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ");
}

function inferQuantity(text: string, name: string) {
  const tokens = text.split(" ");
  const nameTokens = name.split(" ");

  for (let index = 0; index <= tokens.length - nameTokens.length; index += 1) {
    const slice = tokens.slice(index, index + nameTokens.length);

    if (slice.join(" ") !== name) {
      continue;
    }

    const previous = tokens[index - 1];

    if (!previous) {
      return 1;
    }

    const numeric = Number(previous);

    if (Number.isInteger(numeric) && numeric > 0) {
      return numeric;
    }

    return quantityWords.get(previous) ?? 1;
  }

  return 1;
}

/**
 * Parses guest free-form text into concrete inventory line items using seeded inventory names.
 */
export async function parseGuestRequestText(rawText: string) {
  const normalizedText = normalizeText(requireStoredText(rawText, "Request text"));

  if (!normalizedText) {
    throw new ApiError(400, "Request text is required");
  }

  const items = await withDbTransaction((db) =>
    db.inventoryItem.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    }),
  );

  const matches = items.flatMap((item) => {
    const normalizedName = normalizeText(item.name);

    if (!normalizedText.includes(normalizedName)) {
      return [];
    }

    return [
      {
        inventoryItemId: item.id,
        quantity: inferQuantity(normalizedText, normalizedName),
        category: item.category,
      },
    ];
  });

  if (matches.length === 0) {
    throw new ApiError(422, "Could not match the request to any inventory items");
  }

  const category = matches[0]?.category ?? RequestCategory.reception;

  return {
    normalizedText,
    category,
    items: matches.map(({ inventoryItemId, quantity }) => ({
      inventoryItemId,
      quantity,
    })),
  };
}
