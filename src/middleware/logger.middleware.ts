import { Request, Response, NextFunction } from "express";
import logger from "../utils/logger";

const requestLogger = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const start = Date.now();

  // Log request
  logger.info(`${req.method} ${req.originalUrl}`, {
    ip: req.ip,
    userAgent: req.headers["user-agent"],
  });

  // Log response time on completion
  res.on("finish", () => {
    const duration = Date.now() - start;
    const logMethod = res.statusCode >= 400 ? logger.warn : logger.info;

    logMethod(
      `${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`
    );
  });

  next();
};

export default requestLogger;
