import { redirect } from "next/navigation";

// Registration is currently disabled
export default function RegisterPage() {
  redirect("/login");
}

