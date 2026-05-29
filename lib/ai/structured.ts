import { generateText, tool, type LanguageModel, type Schema } from "ai";

/**
 * Extract JSON from text that may contain markdown fences or extra text.
 */
function extractJson(text: string): string {
  const trimmed = text.trim();

  // Already clean JSON
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return trimmed;
  }

  // Extract from markdown code fence
  const fenceMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenceMatch) {
    return fenceMatch[1].trim();
  }

  // Find first { or [ and last matching } or ]
  const firstBrace = trimmed.indexOf("{");
  const firstBracket = trimmed.indexOf("[");
  const start = Math.min(
    firstBrace >= 0 ? firstBrace : Infinity,
    firstBracket >= 0 ? firstBracket : Infinity,
  );

  if (start === Infinity) {
    throw new Error("No JSON found in response");
  }

  const isArray = trimmed[start] === "[";
  const lastClose = trimmed.lastIndexOf(isArray ? "]" : "}");
  if (lastClose <= start) {
    throw new Error("Incomplete JSON in response");
  }

  return trimmed.slice(start, lastClose + 1);
}

/**
 * Try to extract `failed_generation` text from a tool_use_failed error.
 * Some providers (e.g. OpenRouter) return the model's raw text in this field
 * when the model fails to produce a valid tool call.
 */
function getFailedGeneration(err: unknown): string | null {
  if (!(err instanceof Error)) return null;
  // AI SDK wraps provider errors — check cause chain and message for the field
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyErr = err as any;
  // Direct field on error data
  const data = anyErr.data ?? anyErr.cause?.data ?? anyErr.responseBody?.error;
  if (data?.failed_generation) return data.failed_generation;
  // Some SDK versions put it in error.cause.error
  const cause = anyErr.cause;
  if (cause?.error?.failed_generation) return cause.error.failed_generation;
  // Check if the message itself contains it (some wrappers stringify)
  if (
    typeof err.message === "string" &&
    err.message.includes("failed_generation")
  ) {
    const match = err.message.match(
      /"failed_generation"\s*:\s*"([\s\S]*?)(?:"|$)/,
    );
    if (match) return match[1];
  }
  return null;
}

/**
 * Generate structured output using a two-tier strategy:
 *
 * 1. **Tool calling** (primary): defines a tool whose input schema matches
 *    the desired output, forcing the model to respond with structured data.
 *
 * 2. **Content parsing** (fallback): if the model returns JSON in content
 *    instead of a tool call (some providers ignore tool_choice), extract
 *    and parse the JSON from the text response.
 *
 * 3. **failed_generation recovery**: if the provider throws tool_use_failed
 *    with a `failed_generation` field, try to extract JSON from that text.
 */
export async function generateStructured<T>({
  model,
  schema,
  system,
  prompt,
  abortSignal,
}: {
  model: LanguageModel;
  schema: Schema<T>;
  system?: string;
  prompt: string;
  abortSignal?: AbortSignal;
}): Promise<{ object: T }> {
  const TOOL_NAME = "structured_output";

  let result;
  try {
    result = await generateText({
      model,
      system,
      prompt,
      tools: {
        [TOOL_NAME]: tool({
          description: "Return the structured analysis result",
          inputSchema: schema,
        }),
      },
      toolChoice: { type: "tool", toolName: TOOL_NAME },
      abortSignal,
    });
  } catch (err) {
    if (
      (err instanceof Error || err instanceof DOMException) &&
      (err.name === "AbortError" ||
        err.name === "ResponseAborted" ||
        err.name === "TimeoutError")
    ) {
      throw err;
    }

    // Try to recover from tool_use_failed with failed_generation
    const failedText = getFailedGeneration(err);
    if (failedText) {
      try {
        const json = extractJson(failedText);
        return { object: JSON.parse(json) as T };
      } catch {
        // JSON extraction failed — fall through to re-throw original error
      }
    }

    // Retry without tools: some providers (local/openai-compatible servers)
    // reject forced tool-calling with a 400. Ask for raw JSON instead and
    // embed the schema so the model knows the expected shape.
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const schemaJson = (schema as any)?.jsonSchema;
      const schemaHint = schemaJson
        ? `\n\nSchema:\n${JSON.stringify(schemaJson)}`
        : "";
      const retry = await generateText({
        model,
        system,
        prompt: `${prompt}\n\nTrả về DUY NHẤT một đối tượng JSON hợp lệ theo schema dưới đây. Không markdown, không giải thích.${schemaHint}`,
        abortSignal,
      });
      if (retry.text?.trim()) {
        const json = extractJson(retry.text);
        return { object: JSON.parse(json) as T };
      }
    } catch {
      // Retry failed — re-throw the original tool-calling error below.
    }

    throw err;
  }

  // Primary: extract from tool call
  const toolCall = result.toolCalls?.[0];
  if (toolCall) {
    return { object: toolCall.input as T };
  }

  // Fallback: parse JSON from content (provider ignored tool_choice)
  if (result.text?.trim()) {
    const json = extractJson(result.text);
    return { object: JSON.parse(json) as T };
  }

  // Empty response = content likely filtered/prohibited by provider
  throw new Error(
    "Nhà cung cấp AI trả về nội dung trống. Hãy thử chạy lại, chỉnh sửa prompt tùy chỉnh, Chỉ thị chung, hoặc đổi mô hình AI khác.",
  );
}
