import { NextRequest, NextResponse } from "next/server";
import { getTaskStatus as getRunwayTaskStatus } from "@/lib/runway";
import { getTaskStatus as getSeaDanceTaskStatus } from "@/lib/seadance";

export async function GET(req: NextRequest) {
  try {
    const taskId = req.nextUrl.searchParams.get("taskId");
    const provider = req.nextUrl.searchParams.get("provider") || "runway";

    if (!taskId) {
      return NextResponse.json(
        { error: "taskId is required" },
        { status: 400 }
      );
    }

    console.log(`[Task Status] Querying ${provider} task:`, taskId);

    let task;
    if (provider === "seadance") {
      task = await getSeaDanceTaskStatus(taskId);
      // 适配输出格式以与原有代码兼容
      if (task.output?.video) {
        (task as any).output = [task.output.video];
      }
    } else {
      task = await getRunwayTaskStatus(taskId);
    }

    return NextResponse.json(task);
  } catch (error: unknown) {
    console.error("Task status error:", error);
    return NextResponse.json(
      { error: "获取任务状态失败" },
      { status: 500 }
    );
  }
}
