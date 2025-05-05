import { HTTPSTATUS, HttpStatusCodeType } from "../config/http.config";
import { ZodError } from "zod"; // Import ZodError class from Zod
import { ErrorCodeEnum, ErrorCodeEnumType } from "../enums/error-code.enum";

// Base AppError class
export class AppError extends Error {
  public statusCode: HttpStatusCodeType;
  public errorCode?: ErrorCodeEnumType;
  public details?: any; // Added this field to capture additional details (like Zod validation errors)

  constructor(
    message: string,
    statusCode = HTTPSTATUS.INTERNAL_SERVER_ERROR,
    errorCode?: ErrorCodeEnumType,
    details?: any // Optional parameter for capturing detailed errors
  ) {
    super(message);
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.details = details; // Store the details (like ZodError details)
    Error.captureStackTrace(this, this.constructor);
  }
}

// Custom HttpException for general HTTP errors
export class HttpException extends AppError {
  constructor(
    message = "Http exception error",
    statusCode: HttpStatusCodeType,
    errorCode: ErrorCodeEnumType,
    details?: any // Pass ZodError details here
  ) {
    super(message, statusCode, errorCode, details);
  }
}

// Internal Server Error Exception
export class InternalServerException extends AppError {
  constructor(message = "Internal Server Error", errorCode: ErrorCodeEnumType) {
    super(
      message,
      HTTPSTATUS.INTERNAL_SERVER_ERROR,
      errorCode || ErrorCodeEnum.INTERNAL_SERVER_ERROR
    );
  }
}

// Not Found Exception
export class NotFoundException extends AppError {
  constructor(message = "Resource not found", errorCode: ErrorCodeEnumType) {
    super(
      message,
      HTTPSTATUS.NOT_FOUND,
      errorCode || ErrorCodeEnum.RESOURCE_NOT_FOUND
    );
  }
}

// BadRequestException - Now accepts ZodError details
export class BadRequestException extends AppError {
  constructor(
    message = "Bad Request",
    errorCode: ErrorCodeEnumType,
    details?: ZodError
  ) {
    super(
      message,
      HTTPSTATUS.BAD_REQUEST,
      errorCode || ErrorCodeEnum.VALIDATION_ERROR,
      details // Include ZodError details here
    );
  }
}

// UnauthorizedException
export class UnauthorizedException extends AppError {
  constructor(message = "Unauthorized access", errorCode: ErrorCodeEnumType) {
    super(
      message,
      HTTPSTATUS.UNAUTHORIZED,
      errorCode || ErrorCodeEnum.ACCESS_UNAUTHORIZED
    );
  }
}

// Special exception for handling Zod validation errors
export class ZodValidationException extends BadRequestException {
  constructor(zodError: ZodError) {
    // Extract the first error from ZodError
    const firstError = zodError.errors[0];
    const fieldName = firstError?.path?.join(".") || "field"; // Use the path to create a field name
    const errorMessage = firstError?.message || "Validation error"; // Use the message from the error, or a default one

    super(errorMessage, ErrorCodeEnum.VALIDATION_ERROR, zodError);

    // Additional custom formatting for the response
    this.details = {
      message: errorMessage,
      field: fieldName,
      errors: zodError.errors, // Include all Zod validation errors
      errorCode: ErrorCodeEnum.VALIDATION_ERROR,
    };
  }
}
