import { apiError, ApiError } from "@/lib/utils";

// Registration is currently disabled - users cannot self-register
export async function POST() {
  try {
    throw new ApiError(403, "REGISTRATION_DISABLED", "Registration is currently disabled");
  } catch (error) {
    return apiError(error);
  }
}
