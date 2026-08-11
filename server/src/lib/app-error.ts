// The one error type routes and services throw to signal a client-facing failure. The error middleware is the only place that turns this into an HTTP response.
export class AppError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly details?: Record<string, unknown>;

  constructor(params: { code: string; message: string; statusCode: number; details?: Record<string, unknown> }) {
    super(params.message);
    this.name = 'AppError';
    this.code = params.code;
    this.statusCode = params.statusCode;
    this.details = params.details;
  }
}
