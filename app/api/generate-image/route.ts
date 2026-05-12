import { NextRequest, NextResponse } from "next/server";
import { generateImage } from "@/lib/runway";

// This route now only **starts** the image generation task and immediately returns a task ID.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log("Generate image request body:", JSON.stringify(body));

    const { sceneDescription, styleHint, ratio } = body;

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

    // Start the generation task, but do not wait for it to complete.
    const { taskId } = await generateImage(sceneDescription, styleHint, ratio);

    // Immediately return the taskId to the client for polling.
    return NextResponse.json({ taskId });
  } catch (error: unknown) {
    // This error handling is now only for the initial task submission phase.
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Image generation submission error:", errorMessage);
    if (errorMessage.includes("API key") || errorMessage.includes("401") || errorMessage.includes("403")) {
      return NextResponse.json({ error: "Runway API 密钥未配置或无效。请检查 .env.local 文件中的 RUNWAY_API_KEY" }, { status: 500 });
    }
    if (errorMessage.includes("429") || errorMessage.includes("THROTTLED")) {
      return NextResponse.json({ error: "图片生成请求过多，请稍后重试" }, { status: 429 });
    }
    return NextResponse.json(
      { error: `图片生成失败: ${errorMessage}` },
      { status: 500 }
    );
  }
}
