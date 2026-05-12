import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";

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

    ffmpeg.on("progress", ({ progress, time }) => {
      console.log(`[FFmpeg Progress] ${(progress * 100).toFixed(1)}% (time: ${time})`);
    });

    try {
      await ffmpeg.load({
        coreURL: "https://unpkg.com/@ffmpeg/core-mt@0.12.6/dist/umd/ffmpeg-core.js",
        wasmURL: "https://unpkg.com/@ffmpeg/core-mt@0.12.6/dist/umd/ffmpeg-core.wasm",
        workerURL: "https://unpkg.com/@ffmpeg/core-mt@0.12.6/dist/umd/ffmpeg-core.worker.js",
      });
      console.log("[FFmpeg] Loaded successfully");
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error("[FFmpeg] Load error:", errorMsg);
      throw new Error(`FFmpeg 加载失败: ${errorMsg}`);
    }

    ffmpegInstance = ffmpeg;
    return ffmpeg;
  })();

  return ffmpegLoading;
}

const ENCODE_ARGS = [
  "-c:v", "libx264", "-preset", "ultrafast", "-crf", "28",
  "-c:a", "aac", "-b:a", "128k",
  "-pix_fmt", "yuv420p",
  "-movflags", "+faststart",
] as const;

function wrapText(text: string, maxChars: number = 25): string {
  let result = "";
  while (text.length > maxChars) {
    let breakIndex = maxChars;
    for (let i = maxChars; i >= 0; i--) {
      if (/[ \n\r\t.,，。！？!?、]/.test(text[i])) {
        breakIndex = i + 1;
        break;
      }
    }
    result += text.substring(0, breakIndex) + "\n";
    text = text.substring(breakIndex).trimStart();
  }
  return result + text;
}

export interface MergeOptions {
  onProgress?: (msg: string) => void;
  width?: number;
  height?: number;
  backgroundMusic?: string;
  musicVolume?: number;
  logoUrl?: string;
  signal?: AbortSignal;
}

export async function createStoryVideo(
  videoUrls: string[],
  audioUrls: string[],
  narrations: string[],
  title: string,
  options?: MergeOptions
): Promise<Blob> {
  const {
    onProgress,
    width = 1280,
    height = 720,
    backgroundMusic,
    musicVolume = 0.3,
    logoUrl,
    signal
  } = options ?? {};

  console.log("[VideoMerge] Starting with", videoUrls.length, "videos");
  console.log("[VideoMerge] Options:", { backgroundMusic: !!backgroundMusic, width, height, musicVolume });

  const isVertical = height > width;
  const subtitleBottomPadding = isVertical ? 240 : 60;

  const ffmpeg = await getFFmpeg();
  onProgress?.("正在加载 FFmpeg...");

  const abortHandler = () => {
    console.log("[VideoMerge] Abort signal received. Terminating FFmpeg...");
    try { ffmpeg.terminate(); } catch (e) { }
    ffmpegInstance = null;
    ffmpegLoading = null;
  };

  if (signal?.aborted) {
    abortHandler();
    throw new DOMException("Aborted", "AbortError");
  }
  signal?.addEventListener("abort", abortHandler);

  try {
    const downloadedVoices = new Set<number>();
    let musicDownloaded = false;

    onProgress?.(`正在下载 ${videoUrls.length} 个视频片段...`);

    for (let i = 0; i < videoUrls.length; i++) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      console.log(`[VideoMerge] Downloading media for page ${i + 1}/${videoUrls.length}`);

      const response = await fetch(videoUrls[i], { signal });
      if (!response.ok) {
        throw new Error(`下载视频失败 (HTTP ${response.status}): ${videoUrls[i]}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      if (arrayBuffer.byteLength < 1000) {
        throw new Error(`视频片段 ${i + 1} 文件过小或为空，可能是无效视频`);
      }
      await ffmpeg.writeFile(`clip${i}.mp4`, new Uint8Array(arrayBuffer));

      if (audioUrls[i]) {
        try {
          const audioResponse = await fetch(audioUrls[i], { signal });
          if (audioResponse.ok) {
            await ffmpeg.writeFile(`voice${i}.mp3`, new Uint8Array(await audioResponse.arrayBuffer()));
            downloadedVoices.add(i);
          }
        } catch (err) {
          console.warn(`[VideoMerge] Failed to download voice for page ${i}:`, err);
        }
      }

      console.log(`[VideoMerge] Downloaded video ${i + 1}`);
      onProgress?.(`已下载 ${i + 1}/${videoUrls.length} 个片段`);
    }

    if (backgroundMusic) {
      onProgress?.("正在下载背景音乐...");
      try {
        const musicResponse = await fetch(backgroundMusic, { signal });
        if (musicResponse.ok) {
          const musicData = await musicResponse.arrayBuffer();
          await ffmpeg.writeFile("music.mp3", new Uint8Array(musicData));
          musicDownloaded = true;
          console.log("[VideoMerge] Background music downloaded");
        }
      } catch (err) {
        console.warn("[VideoMerge] Failed to download music:", err);
      }
    }

    onProgress?.("正在合并视频...");

    for (let i = 0; i < videoUrls.length; i++) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      onProgress?.(`正在处理分镜 ${i + 1}/${videoUrls.length}...`);

      const safeText = (narrations[i] || "").substring(0, 200);
      const wrappedText = wrapText(safeText, 30);
      await ffmpeg.writeFile(`subtitle${i}.txt`, wrappedText);

      const hasVoice = downloadedVoices.has(i);
      let ffmpegArgs: string[];

      if (hasVoice) {
        ffmpegArgs = [
          "-i", `clip${i}.mp4`,
          "-i", `voice${i}.mp3`,
          "-filter_complex",
          `[0:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,drawtext=textfile='subtitle${i}.txt':fontcolor=white:fontsize=24:line_spacing=8:box=1:boxcolor=black@0.6:boxborderw=5:x=(w-text_w)/2:y=h-text_h-${subtitleBottomPadding}[v];[1:a]aformat=sample_rates=44100:channel_layouts=stereo[a]`,
          "-map", "[v]",
          "-map", "[a]",
          "-shortest",
          ...ENCODE_ARGS,
          "-y",
          `merged${i}.mp4`
        ];
      } else {
        ffmpegArgs = [
          "-i", `clip${i}.mp4`,
          "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
          "-filter_complex",
          `[0:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,drawtext=textfile='subtitle${i}.txt':fontcolor=white:fontsize=24:line_spacing=8:box=1:boxcolor=black@0.6:boxborderw=5:x=(w-text_w)/2:y=h-text_h-${subtitleBottomPadding}[v];[1:a]aformat=sample_rates=44100:channel_layouts=stereo[a]`,
          "-map", "[v]",
          "-map", "[a]",
          "-shortest",
          ...ENCODE_ARGS,
          "-y",
          `merged${i}.mp4`
        ];
      }

      const code = await ffmpeg.exec(ffmpegArgs);
      if (code !== 0) {
        console.error(`[VideoMerge] FFmpeg error for clip ${i}`);
        throw new Error(`处理第 ${i + 1} 页分镜时发生错误 (退出码: ${code})`);
      }
    }

    let hasOutro = false;
    if (logoUrl) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      onProgress?.("正在生成应用片尾...");
      try {
        const logoRes = await fetch(logoUrl, { signal });
        if (logoRes.ok) {
          const logoData = await logoRes.arrayBuffer();
          await ffmpeg.writeFile("logo.png", new Uint8Array(logoData));

          const logoW = Math.floor(width * 0.4);
          const logoH = Math.floor(height * 0.4);

          const code = await ffmpeg.exec([
            "-loop", "1", "-t", "3", "-i", "logo.png",
            "-f", "lavfi", "-t", "3", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
            "-filter_complex",
            `[0:v]scale=${logoW}:${logoH}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1[v]`,
            "-map", "[v]",
            "-map", "1:a",
            ...ENCODE_ARGS,
            "-pix_fmt", "yuv420p",
            "-y",
            "outro.mp4"
          ]);
          if (code === 0) {
            hasOutro = true;
          }
        }
      } catch (err) {
        console.warn("[VideoMerge] Failed to process outro logo:", err);
      }
    }

    onProgress?.("正在拼接所有分镜...");
    const concatList = videoUrls.map((_, i) => `file 'merged${i}.mp4'`);
    if (hasOutro) concatList.push(`file 'outro.mp4'`);
    await ffmpeg.writeFile("concat.txt", concatList.join("\n"));

    const concatCode = await ffmpeg.exec([
      "-f", "concat",
      "-safe", "0",
      "-i", "concat.txt",
      "-c:v", "copy",
      "-c:a", "aac",
      "-b:a", "128k",
      "-y",
      "concatenated.mp4"
    ]);
    if (concatCode !== 0) {
      const fallbackCode = await ffmpeg.exec([
        "-f", "concat",
        "-safe", "0",
        "-i", "concat.txt",
        "-c:v", "copy",
        "-an",
        "-y",
        "concatenated.mp4"
      ]);
      if (fallbackCode !== 0) {
        throw new Error(`拼接所有分镜片段时发生错误 (退出码: ${fallbackCode})`);
      }
    }

    let outputFile = "output.mp4";
    if (musicDownloaded) {
      onProgress?.("正在合成背景音乐...");
      const bgmCode = await ffmpeg.exec([
        "-i", "concatenated.mp4",
        "-stream_loop", "5", "-i", "music.mp3",
        "-filter_complex",
        `[1:a]volume=${musicVolume}[bgm];[0:a]aformat=sample_rates=44100:channel_layouts=stereo[oa];[oa][bgm]amix=inputs=2:duration=first:normalize=0[a]`,
        "-map", "0:v",
        "-map", "[a]",
        "-c:v", "copy",
        "-c:a", "aac",
        "-b:a", "128k",
        "-shortest",
        "-y",
        outputFile
      ]);
      if (bgmCode !== 0) {
        console.warn("[VideoMerge] Background music mixing failed, using video without music");
        await ffmpeg.exec([
          "-i", "concatenated.mp4",
          "-c:v", "copy",
          "-c:a", "aac",
          "-b:a", "128k",
          "-y",
          outputFile
        ]);
      }
    } else {
      const copyCode = await ffmpeg.exec([
        "-i", "concatenated.mp4",
        "-c:v", "copy",
        "-c:a", "aac",
        "-b:a", "128k",
        "-y",
        outputFile
      ]);
      if (copyCode !== 0) {
        throw new Error(`输出最终视频文件时发生错误 (退出码: ${copyCode})`);
      }
    }

    console.log("[VideoMerge] Reading output file...");
    const data = await ffmpeg.readFile(outputFile);
    const blob = new Blob([data as BlobPart], { type: "video/mp4" });

    console.log("[VideoMerge] Success! Blob size:", blob.size, "bytes");

    for (let i = 0; i < videoUrls.length; i++) {
      try { await ffmpeg.deleteFile(`clip${i}.mp4`); } catch { }
      try { await ffmpeg.deleteFile(`voice${i}.mp3`); } catch { }
      try { await ffmpeg.deleteFile(`merged${i}.mp4`); } catch { }
      try { await ffmpeg.deleteFile(`subtitle${i}.txt`); } catch { }
    }
    try { await ffmpeg.deleteFile("concatenated.mp4"); } catch { }
    try { await ffmpeg.deleteFile("concat.txt"); } catch { }
    try { await ffmpeg.deleteFile("music.mp3"); } catch { }
    try { await ffmpeg.deleteFile("logo.png"); } catch { }
    try { await ffmpeg.deleteFile("outro.mp4"); } catch { }
    try { await ffmpeg.deleteFile(outputFile); } catch { }

    onProgress?.("视频合并完成！");
    return blob;

  } catch (err) {
    if (signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    console.error("[VideoMerge] Error:", err);
    const errorMsg = err instanceof Error ? err.message : String(err);
    throw new Error(`视频合并失败: ${errorMsg}`);
  } finally {
    signal?.removeEventListener("abort", abortHandler);
    console.log("[VideoMerge] Cleaning up VFS memory...");
    for (let i = 0; i < videoUrls.length; i++) {
      try { await ffmpeg.deleteFile(`clip${i}.mp4`); } catch { }
      try { await ffmpeg.deleteFile(`voice${i}.mp3`); } catch { }
      try { await ffmpeg.deleteFile(`merged${i}.mp4`); } catch { }
      try { await ffmpeg.deleteFile(`subtitle${i}.txt`); } catch { }
    }
    try { await ffmpeg.deleteFile("concatenated.mp4"); } catch { }
    try { await ffmpeg.deleteFile("concat.txt"); } catch { }
    try { await ffmpeg.deleteFile("music.mp3"); } catch { }
    try { await ffmpeg.deleteFile("logo.png"); } catch { }
    try { await ffmpeg.deleteFile("outro.mp4"); } catch { }
    try { await ffmpeg.deleteFile("output.mp4"); } catch { }
  }
}

export async function mergeVideos(
  videoUrls: string[],
  options?: {
    onProgress?: (msg: string) => void;
    width?: number;
    height?: number;
    signal?: AbortSignal;
  }
): Promise<Blob> {
  return createStoryVideo(videoUrls, videoUrls.map(() => ""), videoUrls.map(() => ""), "Merged Video", options);
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
  url?: string,
  file?: File
): Promise<boolean> {
  if (navigator.share) {
    try {
      const shareData: ShareData = { title, text, url };
      if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
        shareData.files = [file];
      }
      await navigator.share(shareData);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}
