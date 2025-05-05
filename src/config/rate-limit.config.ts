import Redis from "ioredis";

// Redis client for rate limiting
export const redisClient = new Redis(
  process.env.REDIS_URL || "redis://localhost:6379"
);

// Rate limit configurations for different endpoints
export const rateLimitConfig = {
  // Default rate limit
  default: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // 100 requests per window
    message: "Too many requests from this IP, please try again later.",
    standardHeaders: true,
    legacyHeaders: false,
  },

  // Authentication endpoints (login, register, etc)
  auth: {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 20, // 20 requests per hour
    message: "Too many authentication attempts, please try again later.",
    standardHeaders: true,
    legacyHeaders: false,
  },

  // Transaction related endpoints
  transactions: {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 50, // 50 requests per hour
    message: "Rate limit exceeded for transaction operations.",
    standardHeaders: true,
    legacyHeaders: false,
  },

  // User profile updates
  profile: {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 30, // 30 requests per hour
    message: "Too many profile update requests.",
    standardHeaders: true,
    legacyHeaders: false,
  },
};

// Store configuration for Redis
export const redisStoreConfig = {
  // Send rates to Redis every 5 seconds instead of each request
  sendCommand: (...args: [command: string, ...args: string[]]) =>
    redisClient.call(...args) as unknown as Promise<any>,
  prefix: "rate-limit:", // Prefix for Redis keys
};
