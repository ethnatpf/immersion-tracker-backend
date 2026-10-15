import type { Content } from "../schemas/content.schema.js";

export interface ContentSearchResult {
  items: (Pick<Content, "title" | "type"> & { id: string })[];
  total: number;
  page: number;
  limit: number;
}
