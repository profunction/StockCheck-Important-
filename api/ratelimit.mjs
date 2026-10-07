/**
 * The API's rate limit, with express-rate-limit: 120 requests a minute per
 * access token, 20 for calls with none. Counted per Cloud Run instance --
 * enough to stop a runaway script or someone guessing tokens, which is
 * what it is for; billing-grade quotas would need a shared store.
 */
import { rateLimit } from 'express-rate-limit';
import { rateLimitOptions } from './lib.mjs';

export function createRateLimiterMiddleware(options = {}) {
  return rateLimit(rateLimitOptions(options));
}
