import { clearAuthCookie } from "@/lib/auth";
import { apiResponse } from "@/lib/utils";

export async function POST() {
  await clearAuthCookie();
  return apiResponse({ success: true });
}
