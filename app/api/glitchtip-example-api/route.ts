import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
class GlitchtipExampleAPIError extends Error {
  constructor(message: string | undefined) {
    super(message);
    this.name = "GlitchtipExampleAPIError";
  }
}
// A faulty API route to test GlitchTip's error monitoring
export function GET() {
  throw new GlitchtipExampleAPIError(
    "This error is raised on the backend called by the example page."
  );
  return NextResponse.json({ data: "Testing GlitchTip Error..." });
}
