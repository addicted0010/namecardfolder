import { authenticate } from "@/lib/auth";
import { getDailyCreditStatus } from "@/lib/credits";
import { apiError, apiResponse, ApiError } from "@/lib/utils";

export async function GET() {
  try {
    const auth = await authenticate();
    if (!auth) {
      throw new ApiError(401, "UNAUTHORIZED", "Authentication required");
    }

    const creditStatus = await getDailyCreditStatus(auth.userId);

    return apiResponse({ creditStatus });
  } catch (error) {
    return apiError(error);
  }
}
