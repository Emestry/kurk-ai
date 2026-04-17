import { ApiError } from "@/lib/errors.js";
import { getEnv } from "@/lib/env.js";

const env = getEnv();

/**
 * Creates a Realtime transcription session SDP answer for a browser WebRTC offer.
 */
export async function createRealtimeTranscriptionSession(offerSdp: string) {
  if (!env.openAiApiKey) {
    throw new ApiError(500, "OPENAI_API_KEY is not configured");
  }

  if (!offerSdp.trim()) {
    throw new ApiError(400, "SDP offer is required");
  }

  const formData = new FormData();
  formData.set("sdp", offerSdp);
  formData.set(
    "session",
    JSON.stringify({
      type: "transcription",
      audio: {
        input: {
          transcription: {
            model: "gpt-4o-mini-transcribe",
          },
          turn_detection: {
            type: "server_vad",
            threshold: 0.5,
            prefix_padding_ms: 300,
            silence_duration_ms: 500,
          },
          noise_reduction: {
            type: "near_field",
          },
        },
      },
    }),
  );

  const response = await fetch("https://api.openai.com/v1/realtime/calls", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.openAiApiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new ApiError(
      502,
      detail || "Failed to create realtime transcription session",
    );
  }

  return response.text();
}
