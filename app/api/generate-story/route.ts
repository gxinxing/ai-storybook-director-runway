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
    // Don't expose internal error details to client
    return NextResponse.json(
      { error: "故事生成失败，请稍后重试" },
      { status: 500 }
    );
  }
}
