"use client";

import { useEffect, useMemo, useState } from "react";
import { translateGuestTexts } from "@/lib/api";
import type { GuestLanguageCode } from "@/lib/guest-language";

const translationCache = new Map<string, string>();

function cacheKey(language: GuestLanguageCode, text: string) {
  return `${language}:${text}`;
}

export function useTranslatedTexts(
  texts: string[],
  language: GuestLanguageCode,
) {
  const uniqueTexts = useMemo(
    () => Array.from(new Set(texts.map((text) => text.trim()).filter(Boolean))),
    [texts],
  );
  const uniqueSignature = uniqueTexts.join("\u0001");
  const [fetchedState, setFetchedState] = useState<{
    language: GuestLanguageCode;
    map: Record<string, string>;
  }>({
    language,
    map: {},
  });
  const baseMap = useMemo(
    () =>
      Object.fromEntries(
        uniqueTexts.map((text) => [
          text,
          translationCache.get(cacheKey(language, text)) ?? text,
        ]),
      ),
    [language, uniqueTexts],
  );

  useEffect(() => {
    if (language === "en" || uniqueTexts.length === 0) {
      return;
    }

    const missingTexts = uniqueTexts.filter(
      (text) => !translationCache.has(cacheKey(language, text)),
    );

    if (missingTexts.length === 0) {
      return;
    }

    let cancelled = false;

    void translateGuestTexts({
      texts: missingTexts,
      language,
    }).then((translations) => {
      if (cancelled) {
        return;
      }

      for (const [index, original] of missingTexts.entries()) {
        translationCache.set(
          cacheKey(language, original),
          translations[index] ?? original,
        );
      }

      setFetchedState({
        language,
        map: Object.fromEntries(
          uniqueTexts.map((text) => [
            text,
            translationCache.get(cacheKey(language, text)) ?? text,
          ]),
        ),
      });
    }).catch(() => {
      if (cancelled) {
        return;
      }

      setFetchedState({
        language,
        map: {},
      });
    });

    return () => {
      cancelled = true;
    };
  }, [language, uniqueSignature, uniqueTexts]);

  return useMemo(
    () => ({
      ...baseMap,
      ...(fetchedState.language === language ? fetchedState.map : {}),
    }),
    [baseMap, fetchedState, language],
  );
}
