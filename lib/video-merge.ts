import { FFmpeg } from "@ffmpeg/ffmpeg";

let ffmpegInstance: FFmpeg | null = null;
let ffmpegLoading: Promise<FFmpeg> | null = null;

export async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpegInstance) return ffmpegInstance;
  if (ffmpegLoading) return ffmpegLoading;

  ffmpegLoading = (async () => {
    const ffmpeg = new FFmpeg();
    
    ffmpeg.on("log", ({ message }) => {
      console.log("[FFmpeg]", message);
    });
    
    try {
      await ffmpeg.load();
      console.log("[FFmpeg] Loaded successfully");
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error("[FFmpeg] Load error:", errorMsg);
      throw new Error(`FFmpeg 加载失败: ${errorMsg} - 请检查网络连接或浏览器兼容性`);
    }
    
    ffmpegInstance = ffmpeg;
    return ffmpeg;
  })();

  return ffmpegLoading;
}

const ENCODE_ARGS = [
  "-c:v", "libx264", "-preset", "ultrafast", "-crf", "28",
  "-c:a", "aac", "-b:a", "96k",
  "-movflags", "+faststart",
] as const;

const SCALE_FILTER = (w: number, h: number, i: number, outLabel: string) =>
  `[${i}:v]scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,setsar=1[${outLabel}]`;

const AUDIO_FILTER = (i: number, outLabel: string) =>
  `[${i}:a]aresample=44100[${outLabel}]`;

const escapeText = (text: string) =>
  text
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "'\\''")
    .replace(/:/g, "\\:")
    .replace(/%/g, "\\%")
    .replace(/\n/g, " ");

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

  onProgress?.(`正在下载 ${videoUrls.length} 个视频片段...`);

  const downloadWithProgress = async (url: string, index: number) => {
    const response = await fetch(url);
    const data = await response.arrayBuffer();
    await ffmpeg.writeFile(`clip${index}.mp4`, new Uint8Array(data));
    onProgress?.(`已下载 ${index + 1}/${videoUrls.length} 个片段`);
  };

  const BATCH_SIZE = 3;
  for (let i = 0; i < videoUrls.length; i += BATCH_SIZE) {
    const batch = videoUrls.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map((url, j) => downloadWithProgress(url, i + j)));
  }

  onProgress?.("正在合并视频片段...");

  if (videoUrls.length === 1) {
    await ffmpeg.exec([
      "-i", "clip0.mp4",
      "-filter_complex",
      `${SCALE_FILTER(width, height, 0, "v")};${AUDIO_FILTER(0, "a")}`,
      "-map", "[v]", "-map", "[a]",
      ...ENCODE_ARGS,
      "-y", "merged.mp4",
    ]);
  } else {
    const videoParts = videoUrls
      .map((_, i) => `${SCALE_FILTER(width, height, i, `v${i}`)};${AUDIO_FILTER(i, `a${i}`)}`)
      .join(";");

    const concatPart =
      videoUrls.map((_, i) => `[v${i}][a${i}]`).join("") +
      `concat=n=${videoUrls.length}:v=1:a=1[v][a]`;

    await ffmpeg.exec([
      "-i", "clip0.mp4",
      ...videoUrls.slice(1).flatMap((_, i) => ["-i", `clip${i + 1}.mp4`]),
      "-filter_complex",
      videoParts + ";" + concatPart,
      "-map", "[v]", "-map", "[a]",
      ...ENCODE_ARGS,
      "-y", "merged.mp4",
    ]);
  }

  const mergedData = await ffmpeg.readFile("merged.mp4");
  const blob = new Blob([mergedData as BlobPart], { type: "video/mp4" });

  for (let i = 0; i < videoUrls.length; i++) {
    try { await ffmpeg.deleteFile(`clip${i}.mp4`); } catch {}
  }
  try { await ffmpeg.deleteFile("merged.mp4"); } catch {}

  return blob;
}

export interface MergeOptions {
  onProgress?: (msg: string) => void;
  width?: number;
  height?: number;
  backgroundMusic?: string;
  musicVolume?: number;
}

export async function createStoryVideo(
  videoUrls: string[],
  narrations: string[],
  title: string,
  options?: MergeOptions
): Promise<Blob> {
  const { 
    onProgress, 
    width = 1280, 
    height = 720,
    backgroundMusic,
    musicVolume = 0.3
  } = options ?? {};
  const ffmpeg = await getFFmpeg();

  onProgress?.(`正在下载 ${videoUrls.length} 个视频片段...`);

  const downloadWithProgress = async (url: string, index: number) => {
    console.log(`[FFmpeg] Downloading video ${index + 1}/${videoUrls.length}: ${url.substring(0, 80)}...`);
    
    const response = await fetch(url);
    
    if (!response.ok) {
      const errorMsg = `视频片段下载失败 (HTTP ${response.status}): ${url}`;
      console.error(`[FFmpeg] ${errorMsg}`);
      throw new Error(errorMsg);
    }
    
    const contentType = response.headers.get("content-type") || "";
    console.log(`[FFmpeg] Downloaded ${index + 1}, content-type: ${contentType}, size: ${response.headers.get("content-length") || "unknown"}`);
    
    const data = await response.arrayBuffer();
    await ffmpeg.writeFile(`clip${index}.mp4`, new Uint8Array(data));
    onProgress?.(`已下载 ${index + 1}/${videoUrls.length} 个片段`);
  };

  const BATCH_SIZE = 3;
  for (let i = 0; i < videoUrls.length; i += BATCH_SIZE) {
    const batch = videoUrls.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map((url, j) => downloadWithProgress(url, i + j)));
  }

  if (backgroundMusic) {
    onProgress?.("正在下载背景音乐...");
    try {
      const musicResponse = await fetch(backgroundMusic);
      if (musicResponse.ok) {
        const musicData = await musicResponse.arrayBuffer();
        await ffmpeg.writeFile("background_music.mp3", new Uint8Array(musicData));
        console.log("[FFmpeg] Background music downloaded");
      }
    } catch (err) {
      console.warn("[FFmpeg] Failed to download background music:", err);
    }
  }

  onProgress?.("正在添加字幕并合并...");

  const escapeText = (text: string) =>
    text
      .replace(/\\/g, "\\\\")
      .replace(/'/g, "'\\''")
      .replace(/:/g, "\\:")
      .replace(/%/g, "\\%");

  if (videoUrls.length === 1) {
    const safeText = escapeText(narrations[0] ?? "");
    
    if (backgroundMusic) {
      const totalDuration = 5;
      await ffmpeg.exec([
        "-i", "clip0.mp4",
        "-i", "background_music.mp3",
        "-filter_complex",
        `[0:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,drawtext=text='${safeText}':fontcolor=white:fontsize=22:box=1:boxcolor=black@0.5:boxborderw=8:x=(w-text_w)/2:y=h-text_h-50[v];[0:a]aresample=44100,volume=1.0[a0];[1:a]atrim=0:${totalDuration},asetpts=PTS-STARTPTS,volume=${musicVolume}[a1];[a0][a1]amix=inputs=2:duration=first[a]`,
        "-map", "[v]", "-map", "[a]",
        ...ENCODE_ARGS,
        "-y", "story.mp4",
      ]);
    } else {
      await ffmpeg.exec([
        "-i", "clip0.mp4",
        "-filter_complex",
        `[0:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,drawtext=text='${safeText}':fontcolor=white:fontsize=22:box=1:boxcolor=black@0.5:boxborderw=8:x=(w-text_w)/2:y=h-text_h-50[v];[0:a]aresample=44100[a]`,
        "-map", "[v]", "-map", "[a]",
        ...ENCODE_ARGS,
        "-y", "story.mp4",
      ]);
    }
  } else {
    const filterParts: string[] = [];
    const audioParts: string[] = [];
    
    for (let i = 0; i < videoUrls.length; i++) {
      const safeText = escapeText(narrations[i] ?? "");
      filterParts.push(
        `[${i}:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,drawtext=text='${safeText}':fontcolor=white:fontsize=22:box=1:boxcolor=black@0.5:boxborderw=8:x=(w-text_w)/2:y=h-text_h-50[v${i}];[${i}:a]aresample=44100,volume=1.0[a${i}]`
      );
      audioParts.push(`[a${i}]`);
    }

    const concatPart =
      videoUrls.map((_, i) => `[v${i}][a${i}]`).join("") +
      `concat=n=${videoUrls.length}:v=1:a=1[v][a]`;

    if (backgroundMusic) {
      const totalDuration = videoUrls.length * 5;
      await ffmpeg.exec([
        ...videoUrls.flatMap((_, i) => ["-i", `clip${i}.mp4`]),
        "-i", "background_music.mp3",
        "-filter_complex",
        filterParts.join(";") + ";" + concatPart + `;[a]${audioParts.join("")}amix=inputs=${videoUrls.length + 1}:duration=first:dropout_transition=0[a_mixed];[1:a]atrim=0:${totalDuration},asetpts=PTS-STARTPTS,volume=${musicVolume}[a_bg];[a_mixed][a_bg]amix=inputs=2:duration=first[a_final]`,
        "-map", "[v]", "-map", "[a_final]",
        ...ENCODE_ARGS,
        "-y", "story.mp4",
      ]);
    } else {
      await ffmpeg.exec([
        ...videoUrls.flatMap((_, i) => ["-i", `clip${i}.mp4`]),
        "-filter_complex",
        filterParts.join(";") + ";" + concatPart,
        "-map", "[v]", "-map", "[a]",
        ...ENCODE_ARGS,
        "-y", "story.mp4",
      ]);
    }
  }

  const data = await ffmpeg.readFile("story.mp4");
  const blob = new Blob([data as BlobPart], { type: "video/mp4" });

  for (let i = 0; i < videoUrls.length; i++) {
    try { await ffmpeg.deleteFile(`clip${i}.mp4`); } catch {}
  }
  try { await ffmpeg.deleteFile("story.mp4"); } catch {}
  try { await ffmpeg.deleteFile("background_music.mp3"); } catch {}

  return blob;
}

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
