import { LLMProvider, ImageInput, RecognitionResult, CardDetectionResult, OrientationResult, LLMLogEntry } from "./types";
import { CARD_RECOGNITION_PROMPT, CARD_DETECTION_PROMPT, CARD_ORIENTATION_PROMPT } from "./prompt";

export class ClaudeProvider implements LLMProvider {
  private baseUrl: string;
  private apiKey: string;
  private model: string;

  constructor() {
    this.baseUrl = process.env.CLAUDE_BASE_URL || "https://api.anthropic.com";
    this.apiKey = process.env.CLAUDE_API_KEY || "";
    this.model = process.env.CLAUDE_MODEL || "claude-sonnet-4.6";
  }

  async recognizeCard(
    images: ImageInput[]
  ): Promise<{ result: RecognitionResult; log: LLMLogEntry }> {
    const startTime = Date.now();

    // Build image content blocks
    const imageBlocks = images.map((img) => ({
      type: "image" as const,
      source: {
        type: "base64" as const,
        media_type: img.mimeType,
        data: img.base64 || "",
      },
    }));

    const requestBody = {
      model: this.model,
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: [
            ...imageBlocks,
            {
              type: "text",
              text: CARD_RECOGNITION_PROMPT,
            },
          ],
        },
      ],
    };

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "x-api-key": this.apiKey,
      "anthropic-version": "2023-06-01",
    };

    // Sanitized headers for logging
    const sanitizedHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      "x-api-key": `***${this.apiKey.slice(-4)}`,
      "anthropic-version": "2023-06-01",
    };

    let responseBody: unknown = null;
    let responseStatus = 0;
    let errorMessage: string | undefined;

    try {
      const response = await fetch(`${this.baseUrl}/v1/messages`, {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody),
      });

      responseStatus = response.status;
      responseBody = await response.json();

      if (!response.ok) {
        throw new Error(
          `Claude API error: ${response.status} - ${JSON.stringify(responseBody)}`
        );
      }

      const text = (responseBody as { content: { text: string }[] }).content[0]?.text || "";
      const result = parseJSON(text);
      const durationMs = Date.now() - startTime;

      return {
        result,
        log: {
          provider: "claude",
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
          provider: "claude",
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

    const imageBlock = {
      type: "image" as const,
      source: {
        type: "base64" as const,
        media_type: image.mimeType,
        data: image.base64 || "",
      },
    };

    const requestBody = {
      model: this.model,
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            imageBlock,
            { type: "text", text: CARD_DETECTION_PROMPT },
          ],
        },
      ],
    };

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "x-api-key": this.apiKey,
      "anthropic-version": "2023-06-01",
    };

    const sanitizedHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      "x-api-key": `***${this.apiKey.slice(-4)}`,
      "anthropic-version": "2023-06-01",
    };

    let responseBody: unknown = null;
    let responseStatus = 0;
    let errorMessage: string | undefined;

    try {
      const response = await fetch(`${this.baseUrl}/v1/messages`, {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody),
      });

      responseStatus = response.status;
      responseBody = await response.json();

      if (!response.ok) {
        throw new Error(
          `Claude API error: ${response.status} - ${JSON.stringify(responseBody)}`
        );
      }

      const text = (responseBody as { content: { text: string }[] }).content[0]?.text || "";
      const result = parseDetectionJSON(text);
      const durationMs = Date.now() - startTime;

      return {
        result,
        log: {
          provider: "claude",
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
          provider: "claude",
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

  async detectOrientation(
    image: ImageInput
  ): Promise<{ result: OrientationResult; log: LLMLogEntry }> {
    const startTime = Date.now();

    const imageBlock = {
      type: "image" as const,
      source: {
        type: "base64" as const,
        media_type: image.mimeType,
        data: image.base64 || "",
      },
    };

    const requestBody = {
      model: this.model,
      max_tokens: 256,
      messages: [
        {
          role: "user",
          content: [
            imageBlock,
            { type: "text", text: CARD_ORIENTATION_PROMPT },
          ],
        },
      ],
    };

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "x-api-key": this.apiKey,
      "anthropic-version": "2023-06-01",
    };

    const sanitizedHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      "x-api-key": `***${this.apiKey.slice(-4)}`,
      "anthropic-version": "2023-06-01",
    };

    let responseBody: unknown = null;
    let responseStatus = 0;
    let errorMessage: string | undefined;

    try {
      const response = await fetch(`${this.baseUrl}/v1/messages`, {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody),
      });

      responseStatus = response.status;
      responseBody = await response.json();

      if (!response.ok) {
        throw new Error(
          `Claude API error: ${response.status} - ${JSON.stringify(responseBody)}`
        );
      }

      const text = (responseBody as { content: { text: string }[] }).content[0]?.text || "";
      const result = parseOrientationJSON(text);
      const durationMs = Date.now() - startTime;

      return {
        result,
        log: {
          provider: "claude",
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
        result: { rotation: 0 },
        log: {
          provider: "claude",
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
  // Try to extract JSON from the response
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch {
      // If JSON parsing fails, return raw text as notes
      return { rawText: text, notes: text };
    }
  }
  return { rawText: text, notes: text };
}

function parseOrientationJSON(text: string): OrientationResult {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      const rotation = parsed.rotation;
      if (rotation === 0 || rotation === 90 || rotation === 180 || rotation === 270) {
        return { rotation };
      }
    } catch {
      // fall through
    }
  }
  return { rotation: 0 };
}
