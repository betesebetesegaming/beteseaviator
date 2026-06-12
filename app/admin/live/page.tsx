import { redirect } from "next/navigation";

export default function AdminLiveRedirect() {
  redirect("/admin/operations?tab=live");
}
