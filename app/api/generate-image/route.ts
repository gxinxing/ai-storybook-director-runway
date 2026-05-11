import { NextRequest, NextResponse } from "next/server";
import { generateImage, waitForTask } from "@/lib/runway";

export async function POST(req: NextRequest) {
  const abortController = new AbortController();

  // Cancel on client disconnect
  req.signal.addEventListener("abort", () => abortController.abort());

  try {
    const body = await req.json();
    console.log("Generate image request body:", JSON.stringify(body));
    
    const { sceneDescription, styleHint } = body;

    if (!sceneDescription || typeof sceneDescription !== "string") {
      console.error("Invalid sceneDescription:", sceneDescription);
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
    // Log detailed error for debugging
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Image generation error:", errorMessage);
    console.error("Full error:", error);
    return NextResponse.json(
      { error: `图片生成失败: ${errorMessage}` },
      { status: 500 }
    );
  }
}
