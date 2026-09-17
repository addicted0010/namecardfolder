import { redirect } from "@/i18n/navigation";

// Registration is currently disabled
export default async function RegisterPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect({ href: "/login", locale });
}

