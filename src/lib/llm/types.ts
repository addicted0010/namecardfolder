export interface ImageInput {
  url: string;
  base64?: string;
  mimeType: string;
  side: "FRONT" | "BACK";
}

export interface RecognitionResult {
  fullName?: string;
  nameReading?: string;
  company?: string;
  title?: string;
  email?: string;
  phone?: string;
  mobilePhone?: string;
  address?: string;
  website?: string;
  department?: string;
  fax?: string;
  notes?: string;
  rawText?: string;
}

export interface LLMLogEntry {
  provider: string;
  model: string;
  requestHeaders: Record<string, string>;
  requestBody: unknown;
  responseBody: unknown;
  responseStatus: number;
  durationMs: number;
  errorMessage?: string;
}

export interface CardDetectionResult {
  isCard: boolean;
  confidence: number;
  boundingBox: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  } | null;
}

export interface OrientationResult {
  rotation: 0 | 90 | 180 | 270;
}

export interface LLMProvider {
  recognizeCard(
    images: ImageInput[]
  ): Promise<{ result: RecognitionResult; log: LLMLogEntry }>;

  detectCard(
    image: ImageInput
  ): Promise<{ result: CardDetectionResult; log: LLMLogEntry }>;

  detectOrientation(
    image: ImageInput
  ): Promise<{ result: OrientationResult; log: LLMLogEntry }>;
}
