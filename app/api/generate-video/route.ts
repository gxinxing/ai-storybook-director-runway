import { NextRequest, NextResponse } from "next/server";
import { generateVideo, waitForTask } from "@/lib/runway";

export async function POST(req: NextRequest) {
  try {
    const { imageUrl, prompt } = await req.json();

    if (!imageUrl || !prompt) {
      return NextResponse.json(
        { error: "imageUrl and prompt are required" },
        { status: 400 }
      );
    }

    // Step 1: Start video generation task
    const { taskId } = await generateVideo(imageUrl, prompt);

    // Step 2: Wait for completion
    const result = await waitForTask(taskId, 600000); // 10 min timeout for video

    if (!result.output || result.output.length === 0) {
      throw new Error("No output returned from video generation");
    }

    return NextResponse.json({
      videoUrl: result.output[0],
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to generate video";
    console.error("Video generation error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
