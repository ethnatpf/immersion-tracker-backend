import type { Content } from "../schemas/content.schema.js";
import type { SessionProgress } from "../../immersion-session/schemas/immersion-session.schema.js";

export interface ContentDetails {
  id: string;
  title: string;
  type: Content["type"];
  completed: boolean;
  totalTimeSpent: number;
  lastImmersionSession: {
    id: string;
    created_at: string;
    duration: number;
    progress?: SessionProgress;
  } | null;
}
