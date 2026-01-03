/**
 * API Error Class
 * Custom error class for API error handling
 */
class ApiError extends Error {
  public statusCode: number;
  public isOperational: boolean;

  constructor(statusCode: number, message: string, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;

    Error.captureStackTrace(this, this.constructor);
  }

  // Static factory methods for common errors
  static badRequest(message = 'Bad Request') {
    return new ApiError(400, message);
  }

  static unauthorized(message = 'Unauthorized') {
    return new ApiError(401, message);
  }

  static forbidden(message = 'Forbidden') {
    return new ApiError(403, message);
  }

  static notFound(message = 'Not Found') {
    return new ApiError(404, message);
  }

  static conflict(message = 'Conflict') {
    return new ApiError(409, message);
  }

  static unprocessableEntity(message = 'Unprocessable Entity') {
    return new ApiError(422, message);
  }

  static internal(message = 'Internal Server Error') {
    return new ApiError(500, message, false);
  }

  static serviceUnavailable(message = 'Service Unavailable') {
    return new ApiError(503, message);
  }
}

export default ApiError;

