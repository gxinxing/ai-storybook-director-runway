import { NextRequest, NextResponse } from "next/server";
import { generateStory } from "@/lib/llm";

export async function POST(req: NextRequest) {
  try {
    const { concept, pageCount = 5 } = await req.json();

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

    const story = await generateStory(concept.trim(), pages);
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
