export const BACKEND_PORT = process.env.PORT ?? 4000;

export const FARO_REQUEST_LIMIT = 50;
export const FARO_REQUEST_WINDOW_MS = 30_000;
export const FARO_PAYLOAD_LIMIT_BYTES = 2 * 1024 * 1024;
export const FARO_PAYLOAD_WINDOW_MS = 60_000;
export const FARO_RECEIVER_URL = "http://localhost:12347/collect";

export const FULL_DATE_TIME_WITH_TIMEZONE_REGEX =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u;
