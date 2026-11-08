export const BACKEND_PORT = process.env.PORT ?? 4000;

export const FARO_REQUEST_LIMIT = 50;
export const FARO_REQUEST_WINDOW_MS = 30_000;
export const FARO_PAYLOAD_LIMIT_BYTES = 2 * 1024 * 1024;
export const FARO_PAYLOAD_WINDOW_MS = 60_000;
export const FARO_RECEIVER_URL = "http://localhost:12347/collect";
