import { NextRequest, NextResponse } from "next/server";
import { generateVideo, VALID_VIDEO_MODELS, VideoModel } from "@/lib/runway";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { imageUrl, prompt, ratio, model } = await req.json();

    console.log("[Runway] Video generation request:", { imageUrl: imageUrl?.substring(0, 100), prompt: prompt?.substring(0, 50), ratio, model });

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

    let videoModel: VideoModel = "gen4.5";
    if (model && VALID_VIDEO_MODELS.includes(model as VideoModel)) {
      videoModel = model as VideoModel;
    } else if (model) {
      console.warn(`Invalid model ${model}, using default gen4.5. Valid models: ${VALID_VIDEO_MODELS.join(", ")}`);
    }

    const { taskId } = await generateVideo(imageUrl, prompt, ratio, videoModel);

    return NextResponse.json({ taskId });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[Runway] Video generation submission error:", errorMessage);
    if (errorMessage.includes("API key") || errorMessage.includes("401") || errorMessage.includes("403")) {
      return NextResponse.json({ error: "Runway API 密钥未配置或无效。请检查 .env.local 文件中的 RUNWAY_API_KEY" }, { status: 500 });
    }
    if (errorMessage.includes("429") || errorMessage.includes("THROTTLED")) {
      return NextResponse.json({ error: "视频生成请求过多，请稍后重试" }, { status: 429 });
    }
    return NextResponse.json(
      { error: `视频生成任务提交失败: ${errorMessage}` },
      { status: 500 }
    );
  }
}
