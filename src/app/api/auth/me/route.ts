import { getCurrentUser } from "@/lib/auth";
import { apiResponse } from "@/lib/utils";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return apiResponse({ user: null }, 401);
  }
  return apiResponse({ user });
}
