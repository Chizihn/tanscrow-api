import { Request, Response, NextFunction, ErrorRequestHandler } from "express";

import { HTTPSTATUS } from "../config/http.config";
import { AppError } from "../utils/appError";
import config from "../config/app.config";
import logger from "../utils/logger";
// import logger from "../utils/logger";

const errorMiddleware: ErrorRequestHandler = (
  err: AppError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Default error
  let statusCode = HTTPSTATUS.INTERNAL_SERVER_ERROR;
  let message = "Something went wrong";
  let stack: string | undefined;

  // Check if it's our custom error
  if ("statusCode" in err) {
    statusCode = err.statusCode;
    message = err.message;
  }

  // Include stack trace in development
  if (config.NODE_ENV !== "production") {
    stack = err.stack;
  }

  //   Log the error
  logger.error(`${statusCode} - ${message}`, {
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    stack,
  });

  // Send error response
  res.status(statusCode).json({
    success: false,
    message,
    ...(config.NODE_ENV !== "production" && { stack }),
  });
};

export default errorMiddleware;
