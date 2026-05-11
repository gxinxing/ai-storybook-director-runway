const RUNWAY_API = "https://api.dev.runwayml.com";
const RUNWAY_VERSION = "2024-11-06";

function getHeaders(): Record<string, string> {
  const key = process.env.RUNWAY_API_KEY;
  if (!key) {
    throw new Error("RUNWAY_API_KEY is not configured (API key missing) - Please check your .env.local file");
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
    let errorCode = "";
    try { 
      const errorJson = await res.json();
      errorDetail = JSON.stringify(errorJson);
      errorCode = errorJson?.code || errorJson?.error?.code || "";
    } catch {
      try { errorDetail = await res.text(); } catch {}
    }
    console.error("Runway API error:", res.status, res.statusText, errorCode, errorDetail);
    throw new Error(`Runway API error (${res.status}${errorCode ? `, code: ${errorCode}` : ""}): ${errorDetail}`);
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
  signal?: AbortSignal,
  taskType: "image" | "video" | "audio" = "image"
): Promise<TaskResult> {
  const start = Date.now();
  const baseInterval = taskType === "image" ? 2000 : taskType === "video" ? 4000 : 3000;
  let pollInterval = baseInterval;
  let consecutiveThrottled = 0;
  let lastStatus: string | null = null;
  let sameStatusCount = 0;
  let lastTask: TaskResult | null = null;

  while (Date.now() - start < maxWaitMs) {
    if (signal?.aborted) {
      throw new Error("Operation cancelled");
    }

    const task = await getTaskStatus(taskId);
    lastTask = task;
    console.log(`[waitForTask] taskId=${taskId} status=${task.status} type=${taskType}`);

    if (task.status === "SUCCEEDED") return task;
    if (task.status === "FAILED") {
      throw new Error(
        task.failureReason
          ? `Generation failed: ${task.failureReason}`
          : "Generation failed"
      );
    }

    if (task.status === lastStatus) {
      sameStatusCount++;
    } else {
      sameStatusCount = 0;
      lastStatus = task.status;
    }

    if (task.status === "THROTTLED") {
      consecutiveThrottled++;
      pollInterval = Math.min(baseInterval * Math.pow(1.8, consecutiveThrottled), 20000);
    } else if (task.status === "PENDING") {
      consecutiveThrottled = 0;
      pollInterval = Math.min(baseInterval * 1.5, 8000);
    } else {
      consecutiveThrottled = 0;
      if (sameStatusCount > 5) {
        pollInterval = Math.min(pollInterval * 1.2, 10000);
      } else {
        pollInterval = baseInterval;
      }
    }

    await new Promise((r, reject) => {
      const timer = setTimeout(r, pollInterval);
      signal?.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(new Error("Operation cancelled"));
      }, { once: true });
    });
  }

  const elapsed = Date.now() - start;
  const lastStatusInfo = lastTask ? `status=${lastTask.status}, failureReason=${lastTask.failureReason || "none"}` : "no status retrieved";
  throw new Error(`Generation timed out after ${elapsed}ms (max: ${maxWaitMs}ms). Last: ${lastStatusInfo}`);
}

/**
 * Generate speech from text using Runway text_to_speech API
 */
export async function generateSpeech(
  text: string,
  voice: string = "Maya",
  model: string = "eleven_multilingual_v2"
): Promise<{ taskId: string }> {
  if (!text || typeof text !== "string") {
    throw new Error("text must be a non-empty string");
  }

  const voicePresets = ["Maya", "Bernard", "Ella", "James", "Sofia", "Adam"];
  const presetId = voicePresets.includes(voice) ? voice : "Maya";

  const res = await fetch(`${RUNWAY_API}/v1/text_to_speech`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({
      model,
      promptText: text.substring(0, 1000),
      voice: { type: "runway-preset", presetId },
    }),
  });

  if (!res.ok) {
    let errorDetail = "";
    let errorCode = "";
    try { 
      const errorJson = await res.json();
      errorDetail = JSON.stringify(errorJson);
      errorCode = errorJson?.code || errorJson?.error?.code || "";
    } catch {
      try { errorDetail = await res.text(); } catch {}
    }
    console.error("Runway TTS API error:", res.status, res.statusText, errorCode, errorDetail);
    throw new Error(`TTS generation failed (${res.status}${errorCode ? `, code: ${errorCode}` : ""}): ${errorDetail}`);
  }

  const data = await res.json();
  if (!data.id) {
    throw new Error("TTS generation returned no task ID");
  }
  return { taskId: data.id };
}
