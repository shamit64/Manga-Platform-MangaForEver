export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const badRequest = (message: string, details?: unknown) => new AppError(400, "BAD_REQUEST", message, details);
export const unauthorized = (message = "Sign in to continue.") => new AppError(401, "UNAUTHORIZED", message);
export const forbidden = (message = "You don't have permission to do that.") => new AppError(403, "FORBIDDEN", message);
export const notFound = (what = "Resource") => new AppError(404, "NOT_FOUND", `${what} not found.`);
export const conflict = (message: string) => new AppError(409, "CONFLICT", message);
export const unavailable = (message: string) => new AppError(503, "SERVICE_UNAVAILABLE", message);
