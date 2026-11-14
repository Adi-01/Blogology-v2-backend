import { ApiError } from "./ApiError.js";

export class TooManyRequestsError extends ApiError {
  constructor(message = "Too many requests. Please try again later.") {
    super({
      statusCode: 429,
      type: "rate_limit_error",
      code: "RATE_LIMIT_EXCEEDED",
      message,
    });
    this.name = "TooManyRequestsError";
  }
}
