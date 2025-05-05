import rateLimit, { RateLimitRequestHandler } from "express-rate-limit";

// Rate limiting
export const limiter: RateLimitRequestHandler = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
});
