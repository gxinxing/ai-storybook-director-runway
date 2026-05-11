import { NextRequest, NextResponse } from "next/server";
import { generateSpeech, waitForTask } from "@/lib/runway";

export async function POST(req: NextRequest) {
  const abortController = new AbortController();
  
  req.signal?.addEventListener("abort", () => abortController.abort());

  try {
    const { text, voice = "Maya", model = "eleven_multilingual_v2" } = await req.json();

    if (!text || typeof text !== "string") {
      return NextResponse.json(
        { error: "文本内容不能为空" },
        { status: 400 }
      );
    }

    if (text.length > 1000) {
      return NextResponse.json(
        { error: "文本内容不能超过 1000 字" },
        { status: 400 }
      );
    }

    const { taskId } = await generateSpeech(text, voice, model);
    const result = await waitForTask(taskId, 120000, abortController.signal, "audio");

    if (!result.output || result.output.length === 0) {
      throw new Error("No audio output");
    }

    return NextResponse.json({ audioUrl: result.output[0] });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === "Operation cancelled") {
      return NextResponse.json({ error: "已取消" }, { status: 499 });
    }
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Audio generation error:", errorMessage);
    return NextResponse.json(
      { error: `音频生成失败: ${errorMessage}` },
      { status: 500 }
    );
  }
}
