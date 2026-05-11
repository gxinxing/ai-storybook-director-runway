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
    console.error("Task status error:", error);
    return NextResponse.json(
      { error: "获取任务状态失败" },
      { status: 500 }
    );
  }
}
