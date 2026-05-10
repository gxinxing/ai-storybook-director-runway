import { NextRequest, NextResponse } from "next/server";
import { generateStory } from "@/lib/llm";

export async function POST(req: NextRequest) {
  try {
    const { concept, pageCount = 5 } = await req.json();

    if (!concept || concept.trim().length === 0) {
      return NextResponse.json(
        { error: "Concept is required" },
        { status: 400 }
      );
    }

    const story = await generateStory(concept, pageCount);
    return NextResponse.json(story);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to generate story";
    console.error("Story generation error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
