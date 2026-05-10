const RUNWAY_API = "https://api.dev.runwayml.com";
const RUNWAY_VERSION = "2024-11-06";

function getHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${process.env.RUNWAY_API_KEY}`,
    "X-Runway-Version": RUNWAY_VERSION,
    "Content-Type": "application/json",
  };
}

export interface TaskResult {
  id: string;
  status: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "THROTTLED";
  output?: string[];
  failureReason?: string;
  createdAt?: string;
}

/**
 * Generate an image from text using Runway text_to_image API
 */
export async function generateImage(
  sceneDescription: string,
  styleHint: string = "children's picture book illustration, watercolor, soft colors, warm lighting"
): Promise<{ taskId: string }> {
  const prompt = `${sceneDescription}, ${styleHint}`;

  const res = await fetch(`${RUNWAY_API}/v1/text_to_image`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({
      promptText: prompt,
      model: "gen4_image",
      ratio: "1280:768",
    }),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Runway text_to_image error: ${res.status} - ${error}`);
  }

  const data = await res.json();
  return { taskId: data.id };
}

/**
 * Generate a video from an image using Runway image_to_video API
 */
export async function generateVideo(
  imageUrl: string,
  prompt: string
): Promise<{ taskId: string }> {
  const res = await fetch(`${RUNWAY_API}/v1/image_to_video`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({
      promptImage: imageUrl,
      model: "gen3a_turbo",
      duration: 5,
      ratio: "1280:768",
      promptText: prompt,
    }),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Runway image_to_video error: ${res.status} - ${error}`);
  }

  const data = await res.json();
  return { taskId: data.id };
}

/**
 * Get task status by ID
 */
export async function getTaskStatus(taskId: string): Promise<TaskResult> {
  const res = await fetch(`${RUNWAY_API}/v1/tasks/${taskId}`, {
    headers: {
      Authorization: `Bearer ${process.env.RUNWAY_API_KEY}`,
      "X-Runway-Version": RUNWAY_VERSION,
    },
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Runway task status error: ${res.status} - ${error}`);
  }

  return await res.json();
}

/**
 * Poll task until it completes (SUCCEEDED or FAILED)
 */
export async function waitForTask(
  taskId: string,
  maxWaitMs: number = 300000,
  pollIntervalMs: number = 5000
): Promise<TaskResult> {
  const start = Date.now();

  while (Date.now() - start < maxWaitMs) {
    const task = await getTaskStatus(taskId);

    if (task.status === "SUCCEEDED") return task;
    if (task.status === "FAILED") {
      throw new Error(
        `Task ${taskId} failed: ${task.failureReason || "Unknown reason"}`
      );
    }

    // Wait before next poll
    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }

  throw new Error(`Task ${taskId} timed out after ${maxWaitMs}ms`);
}
