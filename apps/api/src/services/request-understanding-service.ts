import { withDbTransaction } from "@/lib/db.js";
import { ApiError } from "@/lib/errors.js";
import { getEnv } from "@/lib/env.js";
import OpenAI from "openai";

const env = getEnv();

const client = env.openAiApiKey
  ? new OpenAI({
      apiKey: env.openAiApiKey,
    })
  : null;

type Category = "room_service" | "housekeeping" | "maintenance" | "reception";

interface ParsedInventoryItem {
  inventoryItemId: string;
  inventoryItemName: string;
  quantity: number;
  category: Category;
}

interface ParsedGuestRequest {
  items: ParsedInventoryItem[];
  category: Category;
  clarification?: {
    prompt: string;
    options: ParsedInventoryItem[];
  };
}

interface InventoryEntry {
  id: string;
  name: string;
  category: Category;
}

const QUANTITY_WORDS = new Map<string, number>([
  ["a", 1], ["an", 1], ["one", 1],
  ["two", 2], ["three", 3], ["four", 4], ["five", 5],
  ["six", 6], ["seven", 7], ["eight", 8], ["nine", 9], ["ten", 10],
  ["extra", 1], ["another", 1], ["some", 1], ["couple", 2], ["pair", 2],
]);

function normalizeForSubstring(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function inferQuantity(normalizedText: string, normalizedName: string): number {
  const tokens = normalizedText.split(" ");
  const nameTokens = normalizedName.split(" ");

  for (let i = 0; i <= tokens.length - nameTokens.length; i += 1) {
    if (tokens.slice(i, i + nameTokens.length).join(" ") !== normalizedName) {
      continue;
    }

    const prev = tokens[i - 1];
    if (!prev) return 1;

    const numeric = Number(prev);
    if (Number.isInteger(numeric) && numeric > 0) return numeric;

    return QUANTITY_WORDS.get(prev) ?? 1;
  }

  return 1;
}

function singularizeToken(token: string) {
  const normalized = token.trim().toLowerCase();

  if (normalized.endsWith("ies") && normalized.length > 3) {
    return `${normalized.slice(0, -3)}y`;
  }

  if (normalized.endsWith("ses") && normalized.length > 3) {
    return normalized.slice(0, -2);
  }

  if (normalized.endsWith("s") && !normalized.endsWith("ss") && normalized.length > 2) {
    return normalized.slice(0, -1);
  }

  return normalized;
}

function tokenizeNormalizedText(value: string) {
  return normalizeForSubstring(value)
    .split(" ")
    .map((token) => singularizeToken(token))
    .filter(Boolean);
}

function findAmbiguousInventoryOptions(
  rawText: string,
  inventory: InventoryEntry[],
): ParsedGuestRequest["clarification"] | undefined {
  const normalized = normalizeForSubstring(rawText);

  if (!normalized) {
    return undefined;
  }

  const transcriptTokens = new Set(tokenizeNormalizedText(normalized));

  for (const token of transcriptTokens) {
    if (token.length < 3) {
      continue;
    }

    const matchingItems = inventory.filter((item) =>
      tokenizeNormalizedText(item.name).includes(token),
    );

    if (matchingItems.length < 2) {
      continue;
    }

    const options = matchingItems.map((item) => {
      const normalizedName = normalizeForSubstring(item.name);

      return {
        inventoryItemId: item.id,
        inventoryItemName: item.name,
        quantity: inferQuantity(normalized, normalizedName) || 1,
        category: item.category,
      };
    });

    const distinguishingTokens = new Set(
      options.flatMap((option) =>
        tokenizeNormalizedText(option.inventoryItemName).filter((nameToken) => nameToken !== token),
      ),
    );

    const hasSpecificModifier = [...distinguishingTokens].some((nameToken) => transcriptTokens.has(nameToken));

    if (hasSpecificModifier) {
      continue;
    }

    return {
      prompt: `Which ${token} would you like?`,
      options,
    };
  }

  return undefined;
}

/**
 * Plain substring match over English inventory names. Cheap last-resort when
 * the LLM returns an empty selection — whisper transcripts often contain the
 * item word verbatim even when the surrounding phrase confuses the model.
 */
function fallbackSubstringMatch(
  rawText: string,
  inventory: InventoryEntry[],
): ParsedInventoryItem[] {
  const normalized = normalizeForSubstring(rawText);
  if (!normalized) return [];

  const seen = new Set<string>();
  const matches: ParsedInventoryItem[] = [];

  for (const item of inventory) {
    const normalizedName = normalizeForSubstring(item.name);
    if (!normalizedName) continue;
    if (!normalized.includes(normalizedName)) continue;
    if (seen.has(item.id)) continue;

    seen.add(item.id);
    matches.push({
      inventoryItemId: item.id,
      inventoryItemName: item.name,
      quantity: inferQuantity(normalized, normalizedName),
      category: item.category,
    });
  }

  return matches;
}

/**
 * Uses an LLM to understand multilingual guest requests and map them to real inventory.
 */
export async function understandGuestRequest(rawText: string): Promise<ParsedGuestRequest> {
  if (!client) {
    throw new ApiError(500, "OPENAI_API_KEY is not configured");
  }

  const normalized = rawText.trim();

  if (!normalized) {
    throw new ApiError(400, "Request text is required");
  }

  const inventoryRaw = await withDbTransaction((db) =>
    db.inventoryItem.findMany({
      where: { isActive: true },
      orderBy: [{ category: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        category: true,
      },
    }),
  );

  const inventory: InventoryEntry[] = inventoryRaw.map((item) => ({
    id: item.id,
    name: item.name,
    category: item.category as Category,
  }));
  const clarification = findAmbiguousInventoryOptions(normalized, inventory);

  if (clarification) {
    return {
      items: [],
      category: clarification.options[0]!.category,
      clarification,
    };
  }

  const inventoryPrompt = inventory
    .map((item) => `${item.id} | ${item.name} | ${item.category}`)
    .join("\n");

  const response = await client.responses.create({
    model: "gpt-4o",
    input: `You are a multilingual hotel room-service interpreter. Your job: turn a guest's spoken or typed request into a list of items picked from a fixed inventory.

How to reason:
1. If the request is not in English, first translate it mentally. Guests may speak Estonian, Finnish, Russian, German, French, Spanish, Italian, or any other language.
2. Identify every physical item the guest is asking for. Ignore greetings, fillers, wake words ("hey Charlie", "Charlie"), and politeness phrases ("please", "thank you", "could you").
3. For each item, pick the closest inventory entry. Prefer sensible defaults: "water" → Bottled Water, "coffee" → Coffee Pod, "tea" → Tea Bag, "towel" → Bath Towel (unless "hand towel" is specified), "pillow" → Pillow, "blanket" → Blanket, "sandwich" → Club Sandwich, "iron" → Iron, "shampoo" → Shampoo, "toothbrush" or "toothpaste" → Toothbrush Kit, "light bulb" or "bulb" → Light Bulb, "charger" or "adapter" → Power Adapter, "robe" → Bathrobe.
4. Infer quantity from the request. "two towels" → 2, "a pillow" → 1, "some water" → 1, "a couple" → 2, "a pair of" → 2. Default to 1 if no quantity is stated.

Be decisive. If a reasonable inventory match exists, include it — a 60%-confidence match is better than refusing, because the guest sees a confirmation screen and can cancel. Return an empty items array ONLY when the request is clearly unrelated to anything in the inventory (e.g. "what time is it", "open the window", "call a taxi", pure silence or gibberish).

Common multilingual cues:
- Estonian: "rätik" / "käterätik" / "vannirätik" → Bath Towel; "padi" → Pillow; "vesi" → Bottled Water; "kohv" → Coffee Pod; "tee" → Tea Bag; "tekk" → Blanket; "triikraud" → Iron; "šampoon" → Shampoo; "hambahari" → Toothbrush Kit; "pirn" → Light Bulb.
- Spanish: "toalla" → Bath Towel; "agua" → Bottled Water; "café" → Coffee Pod; "almohada" → Pillow.
- French: "serviette" → Bath Towel; "eau" → Bottled Water; "café" → Coffee Pod; "oreiller" → Pillow.
- German: "Handtuch" → Bath Towel; "Wasser" → Bottled Water; "Kaffee" → Coffee Pod; "Kissen" → Pillow.
- Russian: "полотенце" → Bath Towel; "вода" → Bottled Water; "кофе" → Coffee Pod; "подушка" → Pillow.

Output JSON exactly in this shape:
{"items":[{"inventoryItemId":"<one of the ids below>","quantity":<positive integer>}],"category":"<room_service|housekeeping|maintenance|reception>"}

Inventory (id | name | category):
${inventoryPrompt}

Guest request:
${normalized}`,
    text: {
      format: {
        type: "json_schema",
        name: "guest_request_understanding",
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            items: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  inventoryItemId: { type: "string" },
                  quantity: { type: "integer" },
                },
                required: ["inventoryItemId", "quantity"],
              },
            },
            category: {
              type: "string",
              enum: ["room_service", "housekeeping", "maintenance", "reception"],
            },
          },
          required: ["items", "category"],
        },
      },
    },
  });

  const output = response.output_text.trim();

  let parsed: {
    items?: Array<{ inventoryItemId?: string; quantity?: number }>;
    category?: ParsedInventoryItem["category"];
  };

  try {
    parsed = JSON.parse(output);
  } catch {
    throw new ApiError(422, "Could not understand the request");
  }

  const itemLookup = new Map(inventory.map((item) => [item.id, item]));
  let items = (parsed.items ?? [])
    .map((item) => {
      const matched = item.inventoryItemId ? itemLookup.get(item.inventoryItemId) : null;

      if (
        !matched ||
        !Number.isInteger(item.quantity) ||
        (item.quantity ?? 0) <= 0
      ) {
        return null;
      }

      return {
        inventoryItemId: matched.id,
        inventoryItemName: matched.name,
        quantity: item.quantity!,
        category: matched.category,
      };
    })
    .filter((item): item is ParsedInventoryItem => item !== null);

  // Fallback: the LLM can return empty for short or noisy transcripts that
  // still contain the item word plainly. Try substring-matching the inventory
  // names against the raw text before giving up.
  if (items.length === 0) {
    const fallback = fallbackSubstringMatch(normalized, inventory);
    if (fallback.length > 0) {
      console.info("[parse-request] LLM empty, substring fallback matched", {
        rawText: normalized,
        matchedCount: fallback.length,
      });
      items = fallback;
    }
  }

  if (items.length === 0) {
    console.warn("[parse-request] no match", {
      rawText: normalized,
      llmOutput: output,
      inventoryCount: inventory.length,
    });
    throw new ApiError(422, "Could not match the request to inventory items");
  }

  return {
    items,
    category: parsed.category ?? items[0]!.category,
  };
}
