import { NextRequest, NextResponse } from "next/server";
import { generateImage, waitForTask } from "@/lib/runway";

export async function POST(req: NextRequest) {
  const abortController = new AbortController();

  // Cancel on client disconnect
  req.signal.addEventListener("abort", () => abortController.abort());

  try {
    const { sceneDescription, styleHint } = await req.json();

    if (!sceneDescription || typeof sceneDescription !== "string") {
      return NextResponse.json(
        { error: "场景描述不能为空" },
        { status: 400 }
      );
    }

    if (sceneDescription.length > 1000) {
      return NextResponse.json(
        { error: "场景描述不能超过 1000 字" },
        { status: 400 }
      );
    }

    const { taskId } = await generateImage(sceneDescription, styleHint);
    const result = await waitForTask(taskId, 300000, abortController.signal);

    if (!result.output || result.output.length === 0) {
      throw new Error("No output");
    }

    return NextResponse.json({ imageUrl: result.output[0] });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === "Operation cancelled") {
      return NextResponse.json({ error: "已取消" }, { status: 499 });
    }
    console.error("Image generation error:", error);
    return NextResponse.json(
      { error: "图片生成失败，请稍后重试" },
      { status: 500 }
    );
  }
}
