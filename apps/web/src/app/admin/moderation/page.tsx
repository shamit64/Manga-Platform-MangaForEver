import { ModerationQueue } from "@/components/admin/admin-tools";
import { HeldComments } from "@/components/admin/live-tools";

export default function Page() {
  return (
    <div className="space-y-10">
      <ModerationQueue />
      <HeldComments />
    </div>
  );
}
