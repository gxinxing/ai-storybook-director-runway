import { FFmpeg } from "@ffmpeg/ffmpeg";

// ── FFmpeg singleton ──
let ffmpegInstance: FFmpeg | null = null;

export async function getFFmpeg(): Promise<FFmpeg> {
  if (!ffmpegInstance) {
    ffmpegInstance = new FFmpeg();
    await ffmpegInstance.load();
  }
  return ffmpegInstance;
}

/**
 * Merge multiple video clips into one video with re-encoding.
 * Uses concat filter to handle different codecs across clips.
 */
export async function mergeVideos(
  videoUrls: string[],
  options?: {
    onProgress?: (msg: string) => void;
    width?: number;
    height?: number;
  }
): Promise<Blob> {
  const { onProgress, width = 1280, height = 720 } = options ?? {};
  const ffmpeg = await getFFmpeg();

  // Download all clips
  for (let i = 0; i < videoUrls.length; i++) {
    onProgress?.(`正在下载视频片段 ${i + 1}/${videoUrls.length}...`);
    const response = await fetch(videoUrls[i]);
    const data = await response.arrayBuffer();
    await ffmpeg.writeFile(`clip${i}.mp4`, new Uint8Array(data));
  }

  onProgress?.("正在合并视频片段...");

  // Fast path for single video — just normalize and re-encode
  if (videoUrls.length === 1) {
    await ffmpeg.exec([
      "-i", "clip0.mp4",
      "-filter_complex",
      `[0:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1[v];[0:a]aresample=44100[a]`,
      "-map", "[v]", "-map", "[a]",
      "-c:v", "libx264", "-preset", "ultrafast", "-crf", "23",
      "-c:a", "aac", "-b:a", "128k",
      "-movflags", "+faststart",
      "-y", "merged.mp4",
    ]);
  } else {
    // Build filter_complex: normalize each clip → concat
    const videoParts = videoUrls
    .map(
      (_, i) =>
        `[${i}:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1[v${i}];`
    )
    .join("");

  const audioParts = videoUrls
    .map((_, i) => `[${i}:a]aresample=44100[a${i}];`)
    .join("");

  const concatPart =
    videoUrls.map((_, i) => `[v${i}][a${i}]`).join("") +
    `concat=n=${videoUrls.length}:v=1:a=1[v][a]`;

  await ffmpeg.exec([
    "-i", "clip0.mp4",
    ...videoUrls.slice(1).flatMap((_, i) => ["-i", `clip${i + 1}.mp4`]),
    "-filter_complex",
    videoParts + audioParts + concatPart,
    "-map", "[v]", "-map", "[a]",
    "-c:v", "libx264", "-preset", "ultrafast", "-crf", "23",
    "-c:a", "aac", "-b:a", "128k",
    "-movflags", "+faststart",
    "-y", "merged.mp4",
  ]);
  }

  const mergedData = await ffmpeg.readFile("merged.mp4");
  const blob = new Blob([mergedData as BlobPart], { type: "video/mp4" });

  // Cleanup
  for (let i = 0; i < videoUrls.length; i++) {
    try { await ffmpeg.deleteFile(`clip${i}.mp4`); } catch {}
  }
  try { await ffmpeg.deleteFile("merged.mp4"); } catch {}

  return blob;
}

/**
 * Create a story video with narration text overlay (drawtext filter).
 */
export async function createStoryVideo(
  videoUrls: string[],
  narrations: string[],
  title: string,
  options?: {
    onProgress?: (msg: string) => void;
    width?: number;
    height?: number;
  }
): Promise<Blob> {
  const { onProgress, width = 1280, height = 720 } = options ?? {};
  const ffmpeg = await getFFmpeg();

  // Download all clips
  for (let i = 0; i < videoUrls.length; i++) {
    onProgress?.(`正在下载视频片段 ${i + 1}/${videoUrls.length}...`);
    const response = await fetch(videoUrls[i]);
    const data = await response.arrayBuffer();
    await ffmpeg.writeFile(`clip${i}.mp4`, new Uint8Array(data));
  }

  onProgress?.("正在添加字幕并合并...");

  // Fast path for single video
  if (videoUrls.length === 1) {
    const safeText = (narrations[0] ?? "")
      .replace(/\\/g, "\\\\")
      .replace(/'/g, "'\\''")
      .replace(/:/g, "\\:")
      .replace(/%/g, "\\%");
    await ffmpeg.exec([
      "-i", "clip0.mp4",
      "-filter_complex",
      `[0:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,drawtext=text='${safeText}':fontcolor=white:fontsize=22:box=1:boxcolor=black@0.5:boxborderw=8:x=(w-text_w)/2:y=h-text_h-50[v];[0:a]aresample=44100[a]`,
      "-map", "[v]", "-map", "[a]",
      "-c:v", "libx264", "-preset", "ultrafast", "-crf", "23",
      "-c:a", "aac", "-b:a", "128k",
      "-movflags", "+faststart",
      "-y", "story.mp4",
    ]);
  } else {
    // Build filter_complex: normalize + drawtext + concat
  const filterParts: string[] = [];
  for (let i = 0; i < videoUrls.length; i++) {
    const safeText = (narrations[i] ?? "")
      .replace(/\\/g, "\\\\")
      .replace(/'/g, "'\\''")
      .replace(/:/g, "\\:")
      .replace(/%/g, "\\%");
    filterParts.push(
      `[${i}:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,drawtext=text='${safeText}':fontcolor=white:fontsize=22:box=1:boxcolor=black@0.5:boxborderw=8:x=(w-text_w)/2:y=h-text_h-50[v${i}];[${i}:a]aresample=44100[a${i}]`
    );
  }

  const concatPart =
    videoUrls.map((_, i) => `[v${i}][a${i}]`).join("") +
    `concat=n=${videoUrls.length}:v=1:a=1[v][a]`;

  await ffmpeg.exec([
    ...videoUrls.flatMap((_, i) => ["-i", `clip${i}.mp4`]),
    "-filter_complex",
    filterParts.join(";") + ";" + concatPart,
    "-map", "[v]", "-map", "[a]",
    "-c:v", "libx264", "-preset", "ultrafast", "-crf", "23",
    "-c:a", "aac", "-b:a", "128k",
    "-movflags", "+faststart",
    "-y", "story.mp4",
  ]);
  }

  const data = await ffmpeg.readFile("story.mp4");
  const blob = new Blob([data as BlobPart], { type: "video/mp4" });

  // Cleanup
  for (let i = 0; i < videoUrls.length; i++) {
    try { await ffmpeg.deleteFile(`clip${i}.mp4`); } catch {}
  }
  try { await ffmpeg.deleteFile("story.mp4"); } catch {}

  return blob;
}

/**
 * Download a blob as a file
 */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Share content using Web Share API if available
 */
export async function shareContent(
  title: string,
  text: string,
  url?: string
): Promise<boolean> {
  if (navigator.share) {
    try {
      await navigator.share({ title, text, url });
      return true;
    } catch {
      return false;
    }
  }
  return false;
}
