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
        coreURL: "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.js",
        wasmURL: "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.wasm",
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
  "-movflags", "+faststart",
] as const;

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
  
  console.log("[VideoMerge] Starting with", videoUrls.length, "videos");
  console.log("[VideoMerge] Options:", { backgroundMusic: !!backgroundMusic, width, height, musicVolume });
  
  const ffmpeg = await getFFmpeg();
  onProgress?.("正在加载 FFmpeg...");

  onProgress?.(`正在下载 ${videoUrls.length} 个视频片段...`);

  // Download all videos
  for (let i = 0; i < videoUrls.length; i++) {
    console.log(`[VideoMerge] Downloading video ${i + 1}/${videoUrls.length}`);
    const response = await fetch(videoUrls[i]);
    if (!response.ok) {
      throw new Error(`下载视频失败 (HTTP ${response.status}): ${videoUrls[i]}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    await ffmpeg.writeFile(`clip${i}.mp4`, new Uint8Array(arrayBuffer));
    console.log(`[VideoMerge] Downloaded video ${i + 1}`);
    onProgress?.(`已下载 ${i + 1}/${videoUrls.length} 个片段`);
  }

  // Download background music if provided
  if (backgroundMusic) {
    onProgress?.("正在下载背景音乐...");
    try {
      const musicResponse = await fetch(backgroundMusic);
      if (musicResponse.ok) {
        const musicData = await musicResponse.arrayBuffer();
        await ffmpeg.writeFile("music.mp3", new Uint8Array(musicData));
        console.log("[VideoMerge] Background music downloaded");
      }
    } catch (err) {
      console.warn("[VideoMerge] Failed to download music:", err);
    }
  }

  onProgress?.("正在合并视频...");

  try {
    let outputFile = "output.mp4";
    
    if (videoUrls.length === 1) {
      // Single video - just add subtitle and optionally music
      console.log("[VideoMerge] Processing single video");
      
      const safeText = (narrations[0] || "").substring(0, 200);
      const escapedText = safeText.replace(/'/g, "\\'").replace(/"/g, '\\"');
      
      if (backgroundMusic) {
        await ffmpeg.exec([
          "-i", "clip0.mp4",
          "-i", "music.mp3",
          "-filter_complex",
          `[0:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,drawtext=text='${escapedText}':fontcolor=white:fontsize=24:box=1:boxcolor=black@0.6:boxborderw=5:x=(w-text_w)/2:y=h-text_h-60[v];[0:a]aformat=sample_rates=44100:channel_layouts=stereo[a];[1:a]atrim=0:5,asetpts=PTS-STARTPTS,volume=${musicVolume}[b];[a][b]amix=inputs=2:duration=first:normalize=0[a]`,
          "-map", "[v]",
          "-map", "[a]",
          ...ENCODE_ARGS,
          "-y",
          outputFile
        ]);
      } else {
        await ffmpeg.exec([
          "-i", "clip0.mp4",
          "-filter_complex",
          `[0:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,drawtext=text='${escapedText}':fontcolor=white:fontsize=24:box=1:boxcolor=black@0.6:boxborderw=5:x=(w-text_w)/2:y=h-text_h-60[v];[0:a]aformat=sample_rates=44100:channel_layouts=stereo[a]`,
          "-map", "[v]",
          "-map", "[a]",
          ...ENCODE_ARGS,
          "-y",
          outputFile
        ]);
      }
    } else {
      // Multiple videos - need to concat first
      console.log("[VideoMerge] Processing", videoUrls.length, "videos");
      
      // Create concat list file
      const concatList = videoUrls.map((_, i) => `file 'clip${i}.mp4'`).join("\n");
      await ffmpeg.writeFile("concat.txt", concatList);
      
      // Concat all videos first (without audio)
      console.log("[VideoMerge] Concatenating videos...");
      await ffmpeg.exec([
        "-f", "concat",
        "-safe", "0",
        "-i", "concat.txt",
        "-c", "copy",
        "-y",
        "concatenated.mp4"
      ]);
      
      // Now add subtitles and music to concatenated video
      console.log("[VideoMerge] Adding subtitles and music...");
      
      const allText = narrations.join(" ");
      const safeText = allText.substring(0, 500);
      const escapedText = safeText.replace(/'/g, "\\'").replace(/"/g, '\\"');
      const totalDuration = videoUrls.length * 5;
      
      if (backgroundMusic) {
        await ffmpeg.exec([
          "-i", "concatenated.mp4",
          "-i", "music.mp3",
          "-filter_complex",
          `[0:v]drawtext=text='Story':fontcolor=white:fontsize=16:box=1:boxcolor=black@0.5:x=10:y=10[v];[0:a]aformat=sample_rates=44100:channel_layouts=stereo[a];[1:a]atrim=0:${totalDuration},asetpts=PTS-STARTPTS,volume=${musicVolume}[b];[a][b]amix=inputs=2:duration=first:normalize=0[a]`,
          "-map", "[v]",
          "-map", "[a]",
          ...ENCODE_ARGS,
          "-y",
          outputFile
        ]);
      } else {
        await ffmpeg.exec([
          "-i", "concatenated.mp4",
          "-filter_complex",
          `[0:v]drawtext=text='Story':fontcolor=white:fontsize=16:box=1:boxcolor=black@0.5:x=10:y=10[v];[0:a]aformat=sample_rates=44100:channel_layouts=stereo[a]`,
          "-map", "[v]",
          "-map", "[a]",
          ...ENCODE_ARGS,
          "-y",
          outputFile
        ]);
      }
    }

    console.log("[VideoMerge] Reading output file...");
    const data = await ffmpeg.readFile(outputFile);
    const blob = new Blob([data as BlobPart], { type: "video/mp4" });
    
    console.log("[VideoMerge] Success! Blob size:", blob.size, "bytes");
    
    // Cleanup
    for (let i = 0; i < videoUrls.length; i++) {
      try { await ffmpeg.deleteFile(`clip${i}.mp4`); } catch {}
    }
    try { await ffmpeg.deleteFile("concatenated.mp4"); } catch {}
    try { await ffmpeg.deleteFile("concat.txt"); } catch {}
    try { await ffmpeg.deleteFile("music.mp3"); } catch {}
    try { await ffmpeg.deleteFile(outputFile); } catch {}
    
    onProgress?.("视频合并完成！");
    return blob;
    
  } catch (err) {
    console.error("[VideoMerge] Error:", err);
    const errorMsg = err instanceof Error ? err.message : String(err);
    throw new Error(`视频合并失败: ${errorMsg}`);
  }
}

export async function mergeVideos(
  videoUrls: string[],
  options?: {
    onProgress?: (msg: string) => void;
    width?: number;
    height?: number;
  }
): Promise<Blob> {
  return createStoryVideo(videoUrls, videoUrls.map(() => ""), "Merged Video", options);
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
