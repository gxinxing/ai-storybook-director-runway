import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import { writeFile, unlink } from "fs/promises";
import { join } from "path";
import { mkdir } from "fs/promises";

const TEMP_DIR = "/tmp/storybook-videos";

async function ensureTempDir() {
  try {
    await mkdir(TEMP_DIR, { recursive: true });
  } catch { }
}

async function downloadFile(url: string, destPath: string, retries: number = 3): Promise<void> {
  let lastError: Error | null = null;
  
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; StorybookDirector/1.0)",
        },
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
      }
      
      const buffer = await response.arrayBuffer();
      if (buffer.byteLength === 0) {
        throw new Error("Downloaded file is empty");
      }
      
      await writeFile(destPath, Buffer.from(buffer));
      console.log(`[VideoMerge] Downloaded: ${url} (${buffer.byteLength} bytes)`);
      return;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.warn(`[VideoMerge] Download attempt ${i + 1} failed for ${url}: ${lastError.message}`);
      
      if (i < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000 * (i + 1)));
      }
    }
  }
  
  throw new Error(`Failed to download ${url} after ${retries} attempts: ${lastError?.message || "Unknown error"}`);
}

async function runFFmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn("ffmpeg", ["-hide_banner", ...args]);
    let stderr = "";

    ffmpeg.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    ffmpeg.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        console.error("[FFmpeg] Error:", stderr);
        reject(new Error(`FFmpeg exited with code ${code}`));
      }
    });

    ffmpeg.on("error", (err) => {
      reject(err);
    });
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { videoUrls, audioUrls, narrations, title, backgroundMusic, musicVolume = 0.3, width = 1280, height = 720 } = body;

    if (!videoUrls || !Array.isArray(videoUrls) || videoUrls.length === 0) {
      return NextResponse.json({ error: "No video URLs provided" }, { status: 400 });
    }

    await ensureTempDir();
    const sessionId = Date.now().toString(36);
    const sessionDir = join(TEMP_DIR, sessionId);
    await mkdir(sessionDir, { recursive: true });

    console.log("[VideoMerge] Processing", videoUrls.length, "clips in", sessionDir);

    const downloadedVideos: string[] = [];
    const downloadedAudios: string[] = [];

    for (let i = 0; i < videoUrls.length; i++) {
      const videoPath = join(sessionDir, `clip${i}.mp4`);
      await downloadFile(videoUrls[i], videoPath);
      downloadedVideos.push(videoPath);

      if (audioUrls[i]) {
        const audioPath = join(sessionDir, `voice${i}.mp3`);
        try {
          await downloadFile(audioUrls[i], audioPath);
          downloadedAudios.push(audioPath);
        } catch {
          downloadedAudios.push("");
        }
      } else {
        downloadedAudios.push("");
      }
    }

    const processedClips: string[] = [];
    for (let i = 0; i < downloadedVideos.length; i++) {
      console.log("[VideoMerge] Processing clip", i + 1);
      const outputPath = join(sessionDir, `merged${i}.mp4`);
      const safeText = (narrations[i] || "").substring(0, 200);
      const subtitlePath = join(sessionDir, `subtitle${i}.txt`);
      await writeFile(subtitlePath, safeText);

      const subtitleBottomPadding = height > width ? 240 : 60;

      const hasAudio = downloadedAudios[i] && downloadedAudios[i].length > 0;

      if (hasAudio) {
        await runFFmpeg([
          "-i", downloadedVideos[i],
          "-i", downloadedAudios[i],
          "-filter_complex",
          `[0:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,drawtext=textfile='${subtitlePath}':fontcolor=white:fontsize=24:line_spacing=8:box=1:boxcolor=black@0.6:boxborderw=5:x=(w-text_w)/2:y=h-text_h-${subtitleBottomPadding}[v];[1:a]aformat=sample_rates=44100:channel_layouts=stereo[a]`,
          "-map", "[v]",
          "-map", "[a]",
          "-shortest",
          "-c:v", "libx264", "-preset", "ultrafast", "-crf", "28",
          "-c:a", "aac", "-b:a", "128k",
          "-y",
          outputPath
        ]);
      } else {
        await runFFmpeg([
          "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
          "-i", downloadedVideos[i],
          "-filter_complex",
          `[0:a]aformat=sample_rates=44100:channel_layouts=stereo[a];[1:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,drawtext=textfile='${subtitlePath}':fontcolor=white:fontsize=24:line_spacing=8:box=1:boxcolor=black@0.6:boxborderw=5:x=(w-text_w)/2:y=h-text_h-${subtitleBottomPadding}[v]`,
          "-map", "[v]",
          "-map", "[a]",
          "-shortest",
          "-c:v", "libx264", "-preset", "ultrafast", "-crf", "28",
          "-c:a", "aac", "-b:a", "128k",
          "-y",
          outputPath
        ]);
      }

      processedClips.push(outputPath);
    }

    console.log("[VideoMerge] Concatenating clips...");
    const concatListPath = join(sessionDir, "concat.txt");
    const concatList = processedClips.map(p => `file '${p}'`).join("\n");
    await writeFile(concatListPath, concatList);

    const concatenatedPath = join(sessionDir, "concatenated.mp4");
    await runFFmpeg([
      "-f", "concat",
      "-safe", "0",
      "-i", concatListPath,
      "-c", "copy",
      "-y",
      concatenatedPath
    ]);

    let outputPath = join(sessionDir, "output.mp4");

    if (backgroundMusic) {
      console.log("[VideoMerge] Adding background music...");
      try {
        const musicPath = join(sessionDir, "music.mp3");
        await downloadFile(backgroundMusic, musicPath);

        await runFFmpeg([
          "-i", concatenatedPath,
          "-stream_loop", "5", "-i", musicPath,
          "-filter_complex",
          `[1:a]volume=${musicVolume}[bgm];[0:a]aformat=sample_rates=44100:channel_layouts=stereo[oa];[oa][bgm]amix=inputs=2:duration=first:normalize=0[a]`,
          "-map", "0:v",
          "-map", "[a]",
          "-c:v", "copy",
          "-c:a", "aac",
          "-b:a", "128k",
          "-shortest",
          "-y",
          outputPath
        ]);
        console.log("[VideoMerge] Music added successfully");
      } catch (err) {
        console.warn("[VideoMerge] Failed to add music, using video without music:", err);
        await runFFmpeg(["-i", concatenatedPath, "-c:v", "copy", "-c:a", "aac", "-y", outputPath]);
      }
    }

    console.log("[VideoMerge] Reading output file...");
    const { readFile } = await import("fs/promises");
    const videoBuffer = await readFile(outputPath);
    const blob = new Blob([videoBuffer], { type: "video/mp4" });

    console.log("[VideoMerge] Cleaning up...");
    for (const path of [...downloadedVideos, ...downloadedAudios.filter(Boolean), ...processedClips]) {
      try { await unlink(path); } catch { }
    }
    try { await unlink(concatenatedPath); } catch { }
    try { await unlink(concatListPath); } catch { }
    try { await unlink(outputPath); } catch { }
    try { await unlink(join(sessionDir, "music.mp3")); } catch { }

    console.log("[VideoMerge] Done! Blob size:", blob.size);

    return new NextResponse(blob, {
      status: 200,
      headers: {
        "Content-Type": "video/mp4",
        "Content-Disposition": `attachment; filename="${title || 'story'}.mp4"`,
      },
    });

  } catch (error) {
    console.error("[VideoMerge] Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
