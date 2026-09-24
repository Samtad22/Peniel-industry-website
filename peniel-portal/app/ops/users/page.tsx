import { redirect } from "next/navigation";

// Users moved: customer users are under Customers, staff under Settings.
export default function UsersMoved() {
  redirect("/ops/settings");
}
