import { type Request, type Response, type NextFunction } from "express"
import { RateLimiterRedis, RateLimiterMemory, type RateLimiterAbstract } from "rate-limiter-flexible"
import Redis from "ioredis"

/**
 * Reads rate limit config from environment variables with sensible defaults.
 *
 * RATE_LIMIT_POINTS  – max requests per window per IP  (default: 60)
 * RATE_LIMIT_DURATION – window size in seconds          (default: 60)
 */
function getConfig() {
  return {
    points: parseInt(process.env.RATE_LIMIT_POINTS ?? "60", 10),
    duration: parseInt(process.env.RATE_LIMIT_DURATION ?? "60", 10),
  }
}

// Lazily created singleton — avoids connecting to Redis at import time (important for tests)
let _limiter: RateLimiterAbstract | null = null

/**
 * Returns (and memoises) the rate limiter instance.
 * Falls back to an in-memory limiter when REDIS_URL is not set,
 * which is also the path taken during unit tests.
 */
export function getLimiter(): RateLimiterAbstract {
  if (_limiter) return _limiter

  const { points, duration } = getConfig()
  const redisUrl = process.env.REDIS_URL

  if (redisUrl) {
    const redisClient = new Redis(redisUrl, {
      enableOfflineQueue: false,
      lazyConnect: true,
    })

    // If Redis becomes unavailable, fall through without blocking requests
    redisClient.on("error", () => {
      // intentionally silent — rate-limiter-flexible handles this via insuranceLimiter
    })

    _limiter = new RateLimiterRedis({
      storeClient: redisClient,
      keyPrefix: "rl:invoice",
      points,
      duration,
      // In-memory fallback when Redis is unreachable
      insuranceLimiter: new RateLimiterMemory({ points, duration }),
    })
  } else {
    // No Redis configured (local dev / tests) — use memory limiter
    _limiter = new RateLimiterMemory({ points, duration })
  }

  return _limiter
}

/** Clears the cached limiter — used in tests to get a fresh instance per suite. */
export function resetLimiter(): void {
  _limiter = null
}

/**
 * Express middleware: enforces per-IP rate limiting.
 * Returns 429 with a Retry-After header when the limit is exceeded.
 */
export function rateLimitMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // x-forwarded-for may be a comma-separated list; take the first entry
  const ip =
    (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ??
    req.socket.remoteAddress ??
    "unknown"

  getLimiter()
    .consume(ip)
    .then(() => next())
    .catch((rateLimiterRes) => {
      const retrySecs = Math.ceil((rateLimiterRes?.msBeforeNext ?? 1000) / 1000)
      res.set("Retry-After", String(retrySecs))
      res.status(429).json({
        error: "Too many requests. Please retry after the indicated number of seconds.",
        retryAfter: retrySecs,
      })
    })
}
