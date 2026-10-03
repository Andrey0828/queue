import QueueApp from "@/components/queue-app";
import { isConfigured } from "@/lib/db";

export const dynamic = "force-dynamic";
export default function Home() {
  return <QueueApp configured={isConfigured()} groupName={process.env.GROUP_NAME || "Наша группа"} />;
}
