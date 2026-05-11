import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";

// Load FFmpeg instance
let ffmpeg: FFmpeg | null = null;

async function getFFmpeg(): Promise<FFmpeg> {
  if (!ffmpeg) {
    ffmpeg = new FFmpeg();
    await ffmpeg.load();
  }
  return ffmpeg;
}

/**
 * Merge multiple video clips into one video
 * @param videoUrls Array of video URLs
 * @param options Optional configuration
 * @returns Merged video as Blob
 */
export async function mergeVideos(
  videoUrls: string[],
  options?: {
    addTransitions?: boolean;
  }
): Promise<Blob> {
  const ffmpeg = await getFFmpeg();

  // Download all video clips
  const videoFiles: string[] = [];
  for (let i = 0; i < videoUrls.length; i++) {
    const response = await fetch(videoUrls[i]);
    const data = await response.arrayBuffer();
    const filename = `clip${i}.mp4`;
    await ffmpeg.writeFile(filename, new Uint8Array(data));
    videoFiles.push(filename);
  }

  // Create concat list file
  const concatList = videoFiles.map((f) => `file '${f}'`).join("\n");
  await ffmpeg.writeFile("concat.txt", concatList);

  // Merge videos using concat demuxer
  await ffmpeg.exec([
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    "concat.txt",
    "-c",
    "copy",
    "-y",
    "output.mp4",
  ]);

  // Read the merged video
  const data = await ffmpeg.readFile("output.mp4");
  return new Blob([data], { type: "video/mp4" });
}

/**
 * Create a story video with narration text overlay
 * @param videoUrls Array of video clip URLs
 * @param narrations Array of narration texts for each clip
 * @param title Story title
 * @returns Final video as Blob
 */
export async function createStoryVideo(
  videoUrls: string[],
  narrations: string[],
  title: string
): Promise<Blob> {
  const ffmpeg = await getFFmpeg();

  // Download all video clips
  for (let i = 0; i < videoUrls.length; i++) {
    const response = await fetch(videoUrls[i]);
    const data = await response.arrayBuffer();
    await ffmpeg.writeFile(`clip${i}.mp4`, new Uint8Array(data));
  }

  // Create a complex filter for concatenation with text overlay
  // First, we need to process each clip with its narration
  const filterComplexParts: string[] = [];
  const inputs: string[] = [];

  for (let i = 0; i < videoUrls.length; i++) {
    inputs.push(`-i`, `clip${i}.mp4`);
    // Add text overlay for narration
    const safeText = narrations[i]?.replace(/'/g, "'\\''") || "";
    filterComplexParts.push(
      `[${i}:v]drawtext=text='${safeText}':fontcolor=white:fontsize=24:box=1:boxcolor=black@0.5:boxborderw=10:x=(w-text_w)/2:y=h-text_h-40[v${i}]`
    );
  }

  // Concatenate all processed videos
  const concatInputs = videoUrls.map((_, i) => `[v${i}][${i}:a]`).join("");
  filterComplexParts.push(
    `${concatInputs}concat=n=${videoUrls.length}:v=1:a=1[outv][outa]`
  );

  // Execute FFmpeg command
  await ffmpeg.exec([
    ...inputs,
    "-filter_complex",
    filterComplexParts.join(";"),
    "-map",
    "[outv]",
    "-map",
    "[outa]",
    "-c:v",
    "libx264",
    "-c:a",
    "aac",
    "-y",
    "story.mp4",
  ]);

  const data = await ffmpeg.readFile("story.mp4");
  return new Blob([data], { type: "video/mp4" });
}

/**
 * Download a blob as a file
 * @param blob Blob to download
 * @param filename Filename for the download
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
 * @param title Share title
 * @param text Share text
 * @param url URL to share
 */
export async function shareContent(
  title: string,
  text: string,
  url?: string
): Promise<boolean> {
  if (navigator.share) {
    try {
      await navigator.share({
        title,
        text,
        url,
      });
      return true;
    } catch {
      return false;
    }
  }
  return false;
}
