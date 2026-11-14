/**
 * Global Constants & Configuration for Blogology API
 */

export const API_VERSION = "v1" as const;

export const BASE_ROUTES = {
  health: `/api/${API_VERSION}/health`,
  auth: `/api/${API_VERSION}/auth`,
  users: `/api/${API_VERSION}/users`,
  posts: `/api/${API_VERSION}/posts`,
  bookmarks: `/api/${API_VERSION}/bookmarks`,
  feed: `/api/${API_VERSION}/feed`,
  comments: `/api/${API_VERSION}/comments`,
  search: `/api/${API_VERSION}/search`,
  ai: `/api/${API_VERSION}/ai`,
  billing: `/api/${API_VERSION}/billing`,
  upload: `/api/${API_VERSION}/upload`,
} as const;

export const REDIS_KEYS = {
  /** Session payload cache: session:<tokenHash> */
  session: (tokenHash: string) => `session:${tokenHash}`,

  /** User daily AI rate-limiting: rl:ai:<userId>:<YYYY-MM-DD> */
  aiRateLimit: (userId: string, date: string) => `rl:ai:${userId}:${date}`,

  /** Post global summary cache: cache:summary:<postId> */
  postSummary: (postId: string) => `cache:summary:${postId}`,
  postSummaryPattern: () => `cache:summary:*`,

  /** AI summary in-flight mutex lock: lock:ai:summary:<postId> */
  aiSummaryLock: (postId: string) => `lock:ai:summary:${postId}`,

  /** Scored Feed caches (optional cache-aside): cache:feed:for_you:<userId> */
  feedForYou: (userId: string) => `cache:feed:for_you:${userId}`,
  feedExplore: (userId: string) => `cache:feed:explore:${userId}`,
  feedPattern: () => `cache:feed:*`,
} as const;

export const REDIS_TTL = {
  /** Session lifespan: 30 days in seconds */
  SESSION_SECONDS: 30 * 24 * 60 * 60,

  /** Session lifespan: 30 days in milliseconds */
  SESSION_MS: 30 * 24 * 60 * 60 * 1000,

  /** AI Rate limit key expiration: 25 hours (covers full UTC day + buffer) */
  AI_RATE_LIMIT_SECONDS: 25 * 60 * 60,

  /** Post summary cache duration: 7 days */
  POST_SUMMARY_SECONDS: 7 * 24 * 60 * 60,

  /** Short feed cache duration: 5 minutes */
  FEED_CACHE_SECONDS: 5 * 60,

  /** Standard jitter ratio (10% variation) */
  DEFAULT_JITTER_RATIO: 0.1,
} as const;

export const COOKIE_NAMES = {
  sessionToken: "session_token",
} as const;

