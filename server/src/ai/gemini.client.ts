// The only file that imports the Gemini SDK. No prompts, no parsing, no caching — one function
// that sends a prompt plus a JSON response schema and returns the raw text Gemini replied with.
import { GoogleGenAI } from '@google/genai';
import { env } from '../config/env.ts';
import { AppError } from '../lib/app-error.ts';

let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  if (!env.GEMINI_API_KEY || !env.GEMINI_MODEL) {
    throw new AppError({
      code: 'AI_NOT_CONFIGURED',
      message: 'GEMINI_API_KEY and GEMINI_MODEL must both be set — see SETUP.md.',
      statusCode: 503,
    });
  }
  client ??= new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  return client;
}

export interface GenerateJsonParams {
  prompt: string;
  responseSchema: Record<string, unknown>;
}

/** Sends a prompt to Gemini requesting JSON matching responseSchema, and returns the raw response text. Never parses or validates it — that's the caller's job. */
export async function generateJson(params: GenerateJsonParams): Promise<string> {
  const { prompt, responseSchema } = params;

  const response = await getClient().models.generateContent({
    model: env.GEMINI_MODEL as string,
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema,
      temperature: env.AI_TEMPERATURE,
      maxOutputTokens: env.AI_MAX_OUTPUT_TOKENS,
    },
  });

  const text = response.text;
  if (!text) {
    throw new AppError({ code: 'AI_EMPTY_RESPONSE', message: 'Gemini returned an empty response.', statusCode: 502 });
  }
  return text;
}
