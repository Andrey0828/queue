export type Queue = {
  id: string;
  title: string;
  starts_at: string;
  note: string;
  status: "open" | "closed" | "finished";
  revision: number;
  created_at: string;
  finished_at: string | null;
};
export type Entry = {
  id: string;
  name: string;
  position: number;
  status: "waiting" | "done";
  isMe: boolean;
  joinedAt: string;
  completedAt: string | null;
};
export type AuditItem = { id: number; action: string; description: string; actor_role: string; created_at: string };
export type HistoryItem = { id: string; title: string; starts_at: string; finished_at: string; created_at: string; completed: number; total: number };
export type Snapshot = {
  member: { name: string } | null;
  isAdmin: boolean;
  queue: Queue | null;
  entries: Entry[];
  audit: AuditItem[];
  history: HistoryItem[];
  historyMore: boolean;
};
