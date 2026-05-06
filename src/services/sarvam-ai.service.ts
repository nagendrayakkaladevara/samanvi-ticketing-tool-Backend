import { env } from "../config/env";
import { AppError } from "../core/errors/app-error";

interface SarvamMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface SarvamChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

const requestTimeoutMs = 20_000;

function buildEnhancementPrompt(input: string): SarvamMessage[] {
  return [
    {
      role: "system",
      content:
        "You are an assistant that improves ticket descriptions. Correct grammar and sentence formation. Return only English and Telugu output using exactly this format:\nEnglish: <improved english text>\n\nTelugu: <improved telugu text>.\nKeep intent same and do not add extra explanation.The Telugu should be in simple, natural, everyday spoken language.",
    },
    {
      role: "user",
      content: input,
    },
  ];
}

function extractEnhancedText(payload: SarvamChatCompletionResponse): string {
  const content = payload.choices?.[0]?.message?.content;
  if (!content || content.trim().length === 0) {
    throw new AppError({
      message: "AI provider returned an empty response",
      statusCode: 502,
      code: "AI_UPSTREAM_INVALID_RESPONSE",
    });
  }
  return content.trim();
}

export async function enhanceTicketDescriptionWithSarvam(
  description: string,
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

  try {
    const response = await fetch(env.sarvamApiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.sarvamApiKey}`,
      },
      body: JSON.stringify({
        model: env.sarvamModel,
        messages: buildEnhancementPrompt(description),
        temperature: 0.2,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new AppError({
        message: "Failed to get response from AI provider",
        statusCode: 502,
        code: "AI_UPSTREAM_ERROR",
        details: {
          upstreamStatus: response.status,
          upstreamBody: errorText.slice(0, 500),
        },
      });
    }

    const payload = (await response.json()) as SarvamChatCompletionResponse;
    return extractEnhancedText(payload);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    if (error instanceof Error && error.name === "AbortError") {
      throw new AppError({
        message: "AI request timed out",
        statusCode: 504,
        code: "AI_UPSTREAM_TIMEOUT",
      });
    }

    throw new AppError({
      message: "Unable to process AI enhancement right now",
      statusCode: 502,
      code: "AI_ENHANCEMENT_FAILED",
      details: error instanceof Error ? { cause: error.message } : undefined,
    });
  } finally {
    clearTimeout(timeout);
  }
}
