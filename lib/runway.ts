const RUNWAY_API = "https://api.dev.runwayml.com";
const RUNWAY_VERSION = "2024-11-06";

function getHeaders(): Record<string, string> {
  const key = process.env.RUNWAY_API_KEY;
  if (!key) {
    throw new Error("RUNWAY_API_KEY is not configured");
  }
  return {
    Authorization: `Bearer ${key}`,
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
  if (!sceneDescription || typeof sceneDescription !== "string") {
    throw new Error("sceneDescription must be a non-empty string");
  }

  const prompt = `${sceneDescription}, ${styleHint}`;

  const res = await fetch(`${RUNWAY_API}/v1/text_to_image`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({
      promptText: prompt.substring(0, 1000),
      model: "gen4_image",
      ratio: "1280:720",
    }),
  });

  if (!res.ok) {
    let errorDetail = "";
    try { 
      const errorJson = await res.json();
      errorDetail = JSON.stringify(errorJson);
    } catch {
      try { errorDetail = await res.text(); } catch {}
    }
    console.error("Runway API error:", res.status, errorDetail);
    throw new Error(`Image generation failed (${res.status}): ${errorDetail}`);
  }

  const data = await res.json();
  if (!data.id) {
    throw new Error("Image generation returned no task ID");
  }
  return { taskId: data.id };
}

/**
 * Generate a video from an image using Runway image_to_video API
 */
export async function generateVideo(
  imageUrl: string,
  prompt: string
): Promise<{ taskId: string }> {
  // SSRF protection: validate URL
  if (!imageUrl || typeof imageUrl !== "string") {
    throw new Error("imageUrl must be a non-empty string");
  }
  try {
    const url = new URL(imageUrl);
    if (url.protocol !== "https:" && url.protocol !== "data:") {
      throw new Error("imageUrl must use HTTPS");
    }
    // Block private/internal IPs
    const hostname = url.hostname;
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname.startsWith("192.168.") ||
      hostname.startsWith("10.") ||
      hostname.startsWith("172.") ||
      hostname.endsWith(".internal") ||
      hostname === "169.254.169.254"
    ) {
      throw new Error("imageUrl points to a private/internal address");
    }
  } catch (e) {
    if (e instanceof TypeError) {
      throw new Error("imageUrl is not a valid URL");
    }
    throw e;
  }

  if (!prompt || typeof prompt !== "string") {
    throw new Error("prompt must be a non-empty string");
  }

  const res = await fetch(`${RUNWAY_API}/v1/image_to_video`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({
      promptImage: imageUrl,
      model: "gen3a_turbo",
      duration: 5,
      ratio: "1280:768",
      promptText: prompt.substring(0, 1000),
    }),
  });

  if (!res.ok) {
    let errorDetail = "";
    try { 
      const errorJson = await res.json();
      errorDetail = JSON.stringify(errorJson);
    } catch {
      try { errorDetail = await res.text(); } catch {}
    }
    console.error("Runway video API error:", res.status, errorDetail);
    throw new Error(`Video generation failed (${res.status}): ${errorDetail}`);
  }

  const data = await res.json();
  if (!data.id) {
    throw new Error("Video generation returned no task ID");
  }
  return { taskId: data.id };
}

/**
 * Get task status by ID
 */
export async function getTaskStatus(taskId: string): Promise<TaskResult> {
  if (!taskId) {
    throw new Error("taskId is required");
  }

  const res = await fetch(`${RUNWAY_API}/v1/tasks/${taskId}`, {
    headers: {
      Authorization: `Bearer ${process.env.RUNWAY_API_KEY}`,
      "X-Runway-Version": RUNWAY_VERSION,
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to get task status (${res.status})`);
  }

  return await res.json();
}

/**
 * Poll task until it completes (SUCCEEDED or FAILED)
 * Uses exponential backoff for THROTTLED tasks
 */
export async function waitForTask(
  taskId: string,
  maxWaitMs: number = 300000,
  signal?: AbortSignal
): Promise<TaskResult> {
  const start = Date.now();
  let pollInterval = 3000; // Start with 3s, back off on throttle
  let consecutiveThrottled = 0;

  while (Date.now() - start < maxWaitMs) {
    // Check if caller cancelled
    if (signal?.aborted) {
      throw new Error("Operation cancelled");
    }

    const task = await getTaskStatus(taskId);

    if (task.status === "SUCCEEDED") return task;
    if (task.status === "FAILED") {
      throw new Error(
        task.failureReason
          ? `Generation failed: ${task.failureReason}`
          : "Generation failed"
      );
    }

    // Handle THROTTLED with exponential backoff
    if (task.status === "THROTTLED") {
      consecutiveThrottled++;
      pollInterval = Math.min(3000 * Math.pow(1.5, consecutiveThrottled), 15000);
    } else {
      consecutiveThrottled = 0;
      pollInterval = 3000;
    }

    // Wait before next poll
    await new Promise((r, reject) => {
      const timer = setTimeout(r, pollInterval);
      signal?.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(new Error("Operation cancelled"));
      }, { once: true });
    });
  }

  throw new Error("Generation timed out. Please try again.");
}
