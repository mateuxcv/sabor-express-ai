import type { Metadata } from "next";
import { Inbox } from "@/components/inbox";

export const metadata: Metadata = { title: "Central de atendimento · Sabor Express" };

export default function DashboardPage() {
  return <Inbox />;
}
