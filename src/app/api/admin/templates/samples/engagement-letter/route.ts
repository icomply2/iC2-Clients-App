import { NextResponse } from "next/server";
import { buildEngagementLetterTemplateSampleDocx } from "@/lib/finley-engagement-template-docx";

export async function GET() {
  const buffer = await buildEngagementLetterTemplateSampleDocx();

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": 'attachment; filename="Finley-Engagement-Letter-Merge-Template-v1.docx"',
      "Cache-Control": "no-store",
    },
  });
}
