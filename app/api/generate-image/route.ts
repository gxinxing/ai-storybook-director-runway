import { NextRequest, NextResponse } from "next/server";
import { generateImage, waitForTask } from "@/lib/runway";

export async function POST(req: NextRequest) {
  try {
    const { sceneDescription } = await req.json();

    if (!sceneDescription) {
      return NextResponse.json(
        { error: "sceneDescription is required" },
        { status: 400 }
      );
    }

    // Step 1: Start image generation task
    const { taskId } = await generateImage(sceneDescription);

    // Step 2: Wait for completion
    const result = await waitForTask(taskId);

    if (!result.output || result.output.length === 0) {
      throw new Error("No output returned from image generation");
    }

    return NextResponse.json({
      imageUrl: result.output[0],
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to generate image";
    console.error("Image generation error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
