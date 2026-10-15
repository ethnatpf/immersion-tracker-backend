import type { Content } from "../../content/schemas/content.schema.js";

export interface SessionHistoryItem {
  id: string;
  content_id: string;
  title: string;
  type: Content["type"];
  created_at: string;
  duration: number;
}

export interface SessionHistoryResult {
  items: SessionHistoryItem[];
  total: number;
  page: number;
  limit: number;
}
