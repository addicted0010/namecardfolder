import { LLMProvider } from "./types";
import { ClaudeProvider } from "./claude-provider";
import { AlibabaProvider } from "./alibaba-provider";

export function getLLMProvider(): LLMProvider {
  const provider = process.env.LLM_PROVIDER || "claude";

  switch (provider) {
    case "alibaba":
      if (!process.env.ALIBABA_API_KEY) {
        throw new Error("ALIBABA_API_KEY is not configured");
      }
      return new AlibabaProvider();

    case "claude":
      if (!process.env.CLAUDE_API_KEY) {
        throw new Error("CLAUDE_API_KEY is not configured");
      }
      return new ClaudeProvider();

    default:
      throw new Error(
        `Unknown LLM provider: ${provider}. Supported: "alibaba", "claude"`
      );
  }
}
