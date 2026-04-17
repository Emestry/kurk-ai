import OpenAI from "openai";
import { ApiError } from "@/lib/errors.js";
import { getEnv } from "@/lib/env.js";

const env = getEnv();

const client = env.openAiApiKey
  ? new OpenAI({
      apiKey: env.openAiApiKey,
    })
  : null;

/**
 * Transcribes an uploaded guest audio clip into text using OpenAI speech-to-text.
 */
export async function transcribeGuestAudio(audioFile: File) {
  if (!client) {
    throw new ApiError(500, "OPENAI_API_KEY is not configured");
  }

  if (!audioFile.size) {
    throw new ApiError(400, "Audio file is empty");
  }

  const transcription = await client.audio.transcriptions.create({
    file: audioFile,
    model: "gpt-4o-mini-transcribe",
  });

  const transcript = transcription.text.trim();

  if (!transcript) {
    throw new ApiError(422, "Could not transcribe the audio");
  }

  return {
    transcript,
  };
}
