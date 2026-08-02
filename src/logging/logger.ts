export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogRecord {
  timestamp: string;
  level: LogLevel;
  event: string;
  message: string;
  context?: Record<string, unknown>;
}

export interface Logger {
  debug(event: string, message: string, context?: Record<string, unknown>): void;
  info(event: string, message: string, context?: Record<string, unknown>): void;
  warn(event: string, message: string, context?: Record<string, unknown>): void;
  error(event: string, message: string, context?: Record<string, unknown>): void;
}

export class JsonLogger implements Logger {
  public constructor(
    private readonly sink: (line: string) => void = (line) => process.stderr.write(`${line}\n`),
    private readonly minimumLevel: LogLevel = "info",
  ) {}

  public debug(event: string, message: string, context?: Record<string, unknown>): void {
    this.write("debug", event, message, context);
  }

  public info(event: string, message: string, context?: Record<string, unknown>): void {
    this.write("info", event, message, context);
  }

  public warn(event: string, message: string, context?: Record<string, unknown>): void {
    this.write("warn", event, message, context);
  }

  public error(event: string, message: string, context?: Record<string, unknown>): void {
    this.write("error", event, message, context);
  }

  private write(level: LogLevel, event: string, message: string, context?: Record<string, unknown>): void {
    const order: LogLevel[] = ["debug", "info", "warn", "error"];
    if (order.indexOf(level) < order.indexOf(this.minimumLevel)) return;
    const record: LogRecord = {
      timestamp: new Date().toISOString(),
      level,
      event,
      message,
      ...(context ? { context } : {}),
    };
    this.sink(JSON.stringify(record));
  }
}

export const silentLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};
