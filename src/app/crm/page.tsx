import { Inbox } from "@/components/inbox";

export default async function CrmPage({ searchParams }: { searchParams: Promise<{ connection?: string }> }) {
  const query = await searchParams;
  return <Inbox initialView="crm" connectionResult={query.connection} />;
}
