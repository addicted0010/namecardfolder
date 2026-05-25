import { LLMProvider, ImageInput, RecognitionResult, CardDetectionResult, LLMLogEntry } from "./types";
import { CARD_RECOGNITION_PROMPT, CARD_DETECTION_PROMPT } from "./prompt";

export class AlibabaProvider implements LLMProvider {
  private baseUrl: string;
  private apiKey: string;
  private model: string;

  constructor() {
    this.baseUrl =
      process.env.ALIBABA_BASE_URL ||
      "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";
    this.apiKey = process.env.ALIBABA_API_KEY || "";
    this.model = process.env.ALIBABA_MODEL || "qwen3.7-max";
  }

  async recognizeCard(
    images: ImageInput[]
  ): Promise<{ result: RecognitionResult; log: LLMLogEntry }> {
    const startTime = Date.now();

    // Build multimodal content (OpenAI-compatible format)
    const content: Array<
      | { type: "image_url"; image_url: { url: string } }
      | { type: "text"; text: string }
    > = [];

    for (const img of images) {
      const imageUrl = img.base64
        ? `data:${img.mimeType};base64,${img.base64}`
        : img.url;
      content.push({
        type: "image_url",
        image_url: { url: imageUrl },
      });
    }

    content.push({
      type: "text",
      text: CARD_RECOGNITION_PROMPT,
    });

    const requestBody = {
      model: this.model,
      messages: [
        {
          role: "user",
          content,
        },
      ],
      max_tokens: 4096,
      enable_thinking: false,
    };

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.apiKey}`,
    };

    // Sanitized headers for logging
    const sanitizedHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ***${this.apiKey.slice(-4)}`,
    };

    let responseBody: unknown = null;
    let responseStatus = 0;
    let errorMessage: string | undefined;

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody),
      });

      responseStatus = response.status;
      responseBody = await response.json();

      if (!response.ok) {
        throw new Error(
          `Alibaba API error: ${response.status} - ${JSON.stringify(responseBody)}`
        );
      }

      const text =
        (responseBody as { choices: { message: { content: string } }[] })
          .choices[0]?.message?.content || "";
      const result = parseJSON(text);
      const durationMs = Date.now() - startTime;

      return {
        result,
        log: {
          provider: "alibaba",
          model: this.model,
          requestHeaders: sanitizedHeaders,
          requestBody,
          responseBody,
          responseStatus,
          durationMs,
        },
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      errorMessage = error instanceof Error ? error.message : "Unknown error";

      return {
        result: {},
        log: {
          provider: "alibaba",
          model: this.model,
          requestHeaders: sanitizedHeaders,
          requestBody,
          responseBody: responseBody || { error: errorMessage },
          responseStatus: responseStatus || 500,
          durationMs,
          errorMessage,
        },
      };
    }
  }

  async detectCard(
    image: ImageInput
  ): Promise<{ result: CardDetectionResult; log: LLMLogEntry }> {
    const startTime = Date.now();

    const imageUrl = image.base64
      ? `data:${image.mimeType};base64,${image.base64}`
      : image.url;

    const content = [
      { type: "image_url" as const, image_url: { url: imageUrl } },
      { type: "text" as const, text: CARD_DETECTION_PROMPT },
    ];

    const requestBody = {
      model: this.model,
      messages: [{ role: "user", content }],
      max_tokens: 1024,
      enable_thinking: false,
    };

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.apiKey}`,
    };

    const sanitizedHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ***${this.apiKey.slice(-4)}`,
    };

    let responseBody: unknown = null;
    let responseStatus = 0;
    let errorMessage: string | undefined;

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody),
      });

      responseStatus = response.status;
      responseBody = await response.json();

      if (!response.ok) {
        throw new Error(
          `Alibaba API error: ${response.status} - ${JSON.stringify(responseBody)}`
        );
      }

      const text =
        (responseBody as { choices: { message: { content: string } }[] })
          .choices[0]?.message?.content || "";
      const result = parseDetectionJSON(text);
      const durationMs = Date.now() - startTime;

      return {
        result,
        log: {
          provider: "alibaba",
          model: this.model,
          requestHeaders: sanitizedHeaders,
          requestBody,
          responseBody,
          responseStatus,
          durationMs,
        },
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      errorMessage = error instanceof Error ? error.message : "Unknown error";

      return {
        result: { isCard: false, confidence: 0, boundingBox: null },
        log: {
          provider: "alibaba",
          model: this.model,
          requestHeaders: sanitizedHeaders,
          requestBody,
          responseBody: responseBody || { error: errorMessage },
          responseStatus: responseStatus || 500,
          durationMs,
          errorMessage,
        },
      };
    }
  }
}

function parseDetectionJSON(text: string): CardDetectionResult {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch {
      return { isCard: false, confidence: 0, boundingBox: null };
    }
  }
  return { isCard: false, confidence: 0, boundingBox: null };
}

function parseJSON(text: string): RecognitionResult {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch {
      return { rawText: text, notes: text };
    }
  }
  return { rawText: text, notes: text };
}
