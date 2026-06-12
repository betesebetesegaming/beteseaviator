import { redirect } from "next/navigation";

export default function AdminTransactionsRedirect() {
  redirect("/admin/operations?tab=transactions");
}
