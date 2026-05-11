import { NextRequest, NextResponse } from "next/server";
import { generateStory } from "@/lib/llm";

export async function POST(req: NextRequest) {
  try {
    const { concept, pageCount = 5, attachments, style, age, lang } = await req.json();

    if (!concept || typeof concept !== "string" || concept.trim().length === 0) {
      return NextResponse.json(
        { error: "请输入故事概念" },
        { status: 400 }
      );
    }

    // Validate pageCount
    const pages = Number(pageCount);
    if (!Number.isInteger(pages) || pages < 1 || pages > 20) {
      return NextResponse.json(
        { error: "页数必须是 1-20 之间的整数" },
        { status: 400 }
      );
    }

    // Validate attachments if provided
    let validAttachments: Array<{ type: string; name: string }> | undefined;
    if (Array.isArray(attachments) && attachments.length > 0) {
      validAttachments = attachments
        .filter((a: { type?: string; name?: string }) =>
          a.type && a.name && ["character", "style", "scene", "text"].includes(a.type)
        )
        .map((a: { type: string; name: string }) => ({
          type: a.type,
          name: String(a.name).slice(0, 100),
        }));
    }

    const story = await generateStory(concept.trim(), pages, validAttachments, { style, age, lang });
    return NextResponse.json(story);
  } catch (error: unknown) {
    console.error("Story generation error:", error);
    const message = error instanceof Error ? error.message : "未知错误";
    if (message.includes("API key") || message.includes("401")) {
      return NextResponse.json(
        { error: "API 密钥未配置或无效，请检查环境变量" },
        { status: 500 }
      );
    }
    if (message.includes("429") || message.includes("rate")) {
      return NextResponse.json(
        { error: "请求过于频繁，请稍后再试" },
        { status: 429 }
      );
    }
    if (message.includes("JSON") || message.includes("valid")) {
      return NextResponse.json(
        { error: "AI 返回格式异常，请重试" },
        { status: 502 }
      );
    }
    return NextResponse.json(
      { error: "故事生成失败，请稍后重试" },
      { status: 500 }
    );
  }
}
