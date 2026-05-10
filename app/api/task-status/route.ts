import { NextRequest, NextResponse } from "next/server";
import { getTaskStatus } from "@/lib/runway";

export async function GET(req: NextRequest) {
  try {
    const taskId = req.nextUrl.searchParams.get("taskId");

    if (!taskId) {
      return NextResponse.json(
        { error: "taskId is required" },
        { status: 400 }
      );
    }

    const task = await getTaskStatus(taskId);
    return NextResponse.json(task);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to get task status";
    console.error("Task status error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
