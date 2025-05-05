import rateLimit from "express-rate-limit";
import RedisStore from "rate-limit-redis";
import {
  redisClient,
  rateLimitConfig,
  redisStoreConfig,
} from "../config/rate-limit.config";

// Create rate limiters for different endpoints
export const rateLimiters = {
  // Default rate limiter
  default: rateLimit({
    ...rateLimitConfig.default,
    store: new RedisStore(redisStoreConfig),
  }),

  // Auth endpoints rate limiter
  auth: rateLimit({
    ...rateLimitConfig.auth,
    store: new RedisStore(redisStoreConfig),
  }),

  // Transaction endpoints rate limiter
  transactions: rateLimit({
    ...rateLimitConfig.transactions,
    store: new RedisStore(redisStoreConfig),
  }),

  // Profile endpoints rate limiter
  profile: rateLimit({
    ...rateLimitConfig.profile,
    store: new RedisStore(redisStoreConfig),
  }),
};

// Middleware factory function to apply rate limiting based on endpoint type
export const applyRateLimit = (type: keyof typeof rateLimiters = "default") => {
  return rateLimiters[type];
};
