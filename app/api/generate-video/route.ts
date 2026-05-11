import { NextRequest, NextResponse } from "next/server";
import { generateVideo, waitForTask } from "@/lib/runway";

export async function POST(req: NextRequest) {
  const abortController = new AbortController();

  // Cancel on client disconnect
  req.signal.addEventListener("abort", () => abortController.abort());

  try {
    const { imageUrl, prompt } = await req.json();

    if (!imageUrl || typeof imageUrl !== "string") {
      return NextResponse.json(
        { error: "图片地址不能为空" },
        { status: 400 }
      );
    }

    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json(
        { error: "提示词不能为空" },
        { status: 400 }
      );
    }

    const { taskId } = await generateVideo(imageUrl, prompt);
    const result = await waitForTask(taskId, 600000, abortController.signal, "video");

    if (!result.output || result.output.length === 0) {
      throw new Error("No output");
    }

    return NextResponse.json({ videoUrl: result.output[0] });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === "Operation cancelled") {
      return NextResponse.json({ error: "已取消" }, { status: 499 });
    }
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Video generation error:", errorMessage);
    if (errorMessage.includes("API key") || errorMessage.includes("401")) {
      return NextResponse.json({ error: "Runway API 密钥未配置或无效" }, { status: 500 });
    }
    if (errorMessage.includes("429") || errorMessage.includes("THROTTLED")) {
      return NextResponse.json({ error: "视频生成请求过多，请稍后重试" }, { status: 429 });
    }
    if (errorMessage.includes("timed out")) {
      return NextResponse.json({ error: "视频生成超时，请重试" }, { status: 504 });
    }
    return NextResponse.json(
      { error: `视频生成失败: ${errorMessage}` },
      { status: 500 }
    );
  }
}
