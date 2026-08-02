export class SlideAgentError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "SlideAgentError";
  }
}

export function errorDetails(error: unknown): { code: string; message: string; details?: Record<string, unknown> } {
  if (error instanceof SlideAgentError) {
    return {
      code: error.code,
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
    };
  }
  if (error instanceof Error) return { code: "UNEXPECTED_ERROR", message: error.message };
  return { code: "UNEXPECTED_ERROR", message: String(error) };
}
