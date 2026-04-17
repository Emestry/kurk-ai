import OpenAI from "openai";
import { ApiError } from "@/lib/errors.js";
import { getEnv } from "@/lib/env.js";

const env = getEnv();

const client = env.openAiApiKey
  ? new OpenAI({
      apiKey: env.openAiApiKey,
    })
  : null;

const LANGUAGE_LABELS = {
  en: "English",
  et: "Estonian",
  es: "Spanish",
  fr: "French",
  ru: "Russian",
  de: "German",
} as const;

export type TranslationLanguageCode = keyof typeof LANGUAGE_LABELS;

export async function translateGuestTexts(
  texts: string[],
  language: TranslationLanguageCode,
) {
  if (!client) {
    throw new ApiError(500, "OPENAI_API_KEY is not configured");
  }

  const normalized = texts.map((text) => text.trim());

  if (normalized.length === 0) {
    return [];
  }

  const response = await client.responses.create({
    model: "gpt-4o-mini",
    input: `Translate each hotel guest-facing string into ${LANGUAGE_LABELS[language]}.

Rules:
- Return a translation for every input string in the same order.
- Preserve meaning and tone.
- Preserve numbers, room numbers, names, punctuation, and short codes.
- Keep strings concise when the source is concise.
- If a string is already in the target language, keep it natural.
- Return strict JSON only.

Strings:
${normalized.map((text, index) => `${index + 1}. ${text}`).join("\n")}`,
    text: {
      format: {
        type: "json_schema",
        name: "guest_text_translations",
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            translations: {
              type: "array",
              items: {
                type: "string",
              },
            },
          },
          required: ["translations"],
        },
      },
    },
  });

  let parsed: { translations?: string[] };

  try {
    parsed = JSON.parse(response.output_text);
  } catch {
    throw new ApiError(422, "Could not translate the text");
  }

  const translations = parsed.translations ?? [];

  if (translations.length !== normalized.length) {
    throw new ApiError(422, "Could not translate the text");
  }

  return translations;
}
