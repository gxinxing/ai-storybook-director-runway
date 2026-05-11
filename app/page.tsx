"use client";

import { useState, useRef, useEffect } from "react";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";

type Step = "input" | "story" | "generating" | "merging" | "result";

interface StoryPage {
  page: number;
  narration: string;
  scene_description: string;
  emotion: string;
}

interface Story {
  title: string;
  hook: string;
  theme: string;
  pages: StoryPage[];
}

// FFmpeg singleton
let ffmpegInstance: FFmpeg | null = null;

async function getFFmpeg(): Promise<FFmpeg> {
  if (!ffmpegInstance) {
    ffmpegInstance = new FFmpeg();
    await ffmpegInstance.load();
  }
  return ffmpegInstance;
}

export default function Home() {
  const [step, setStep] = useState<Step>("input");
  const [concept, setConcept] = useState("");
  const [pageCount, setPageCount] = useState(5);
  const [story, setStory] = useState<Story | null>(null);
  const [images, setImages] = useState<string[]>([]);
  const [videos, setVideos] = useState<string[]>([]);
  const [mergedVideoUrl, setMergedVideoUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [shareSuccess, setShareSuccess] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Step 1: Generate story
  const handleGenerateStory = async () => {
    if (!concept.trim()) return;
    setLoading(true);
    setError("");
    setProgress("正在生成故事...");

    try {
      const res = await fetch("/api/generate-story", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ concept, pageCount }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "故事生成失败");
      }

      setStory(data);
      setStep("story");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "未知错误";
      setError(message);
    } finally {
      setLoading(false);
      setProgress("");
    }
  };

  // Step 2: Generate images + videos for all pages
  const handleGenerateAll = async () => {
    if (!story) return;
    setLoading(true);
    setError("");
    setStep("generating");
    setImages([]);
    setVideos([]);
    setMergedVideoUrl(null);

    try {
      const imageUrls: string[] = [];
      const videoUrls: string[] = [];

      for (let i = 0; i < story.pages.length; i++) {
        const page = story.pages[i];
        setCurrentPage(i);

        // Generate image
        setProgress(
          `正在生成图片 ${i + 1}/${story.pages.length}: ${page.emotion}...`
        );
        const imgRes = await fetch("/api/generate-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sceneDescription: page.scene_description }),
        });

        const imgData = await imgRes.json();
        if (!imgRes.ok) throw new Error(imgData.error || "图片生成失败");
        imageUrls.push(imgData.imageUrl);
        setImages([...imageUrls]);

        // Generate video
        setProgress(
          `正在生成视频 ${i + 1}/${story.pages.length}: ${page.emotion}...`
        );
        const vidRes = await fetch("/api/generate-video", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imageUrl: imgData.imageUrl,
            prompt: page.scene_description,
          }),
        });

        const vidData = await vidRes.json();
        if (!vidRes.ok) throw new Error(vidData.error || "视频生成失败");
        videoUrls.push(vidData.videoUrl);
        setVideos([...videoUrls]);
      }

      setProgress("所有片段已生成，正在合并视频...");
      setStep("merging");
      
      // Merge videos
      await mergeVideosWithSubtitles(videoUrls, story.pages, story.title);
      
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "未知错误";
      setError(message);
      if (images.length > 0) {
        setStep("result");
      }
    } finally {
      setLoading(false);
    }
  };

  // Merge videos with subtitles
  const mergeVideosWithSubtitles = async (
    videoUrls: string[],
    pages: StoryPage[],
    title: string
  ) => {
    try {
      const ffmpeg = await getFFmpeg();
      
      // Download all videos
      for (let i = 0; i < videoUrls.length; i++) {
        setProgress(`正在下载视频片段 ${i + 1}/${videoUrls.length}...`);
        const response = await fetch(videoUrls[i]);
        const data = await response.arrayBuffer();
        await ffmpeg.writeFile(`clip${i}.mp4`, new Uint8Array(data));
      }

      // Create concat list
      setProgress("正在合并视频片段...");
      const concatList = videoUrls.map((_, i) => `file 'clip${i}.mp4'`).join("\n");
      await ffmpeg.writeFile("concat.txt", concatList);

      // Merge videos
      await ffmpeg.exec([
        "-f", "concat", "-safe", "0",
        "-i", "concat.txt",
        "-c", "copy",
        "-y", "merged.mp4"
      ]);

      // Read merged video
      const mergedData = await ffmpeg.readFile("merged.mp4");
      const mergedBlob = new Blob([mergedData], { type: "video/mp4" });
      const mergedUrl = URL.createObjectURL(mergedBlob);
      
      setMergedVideoUrl(mergedUrl);
      setProgress("完成！");
      setStep("result");

      // Cleanup temp files
      for (let i = 0; i < videoUrls.length; i++) {
        try { await ffmpeg.deleteFile(`clip${i}.mp4`); } catch {}
      }
      try { await ffmpeg.deleteFile("concat.txt"); } catch {}
      try { await ffmpeg.deleteFile("merged.mp4"); } catch {}

    } catch (err) {
      console.error("Video merge error:", err);
      setError("视频合并失败，但您可以单独查看每个片段");
      setStep("result");
    }
  };

  // Download merged video
  const handleDownload = () => {
    if (!mergedVideoUrl || !story) return;
    
    const a = document.createElement("a");
    a.href = mergedVideoUrl;
    a.download = `${story.title.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, "_")}_动画绘本.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Share video
  const handleShare = async () => {
    if (!story) return;
    
    const shareData = {
      title: `${story.title} - AI动画绘本`,
      text: `${story.hook}\n\n由 AI Storybook Director 生成`,
      url: window.location.href,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
        setShareSuccess(true);
        setTimeout(() => setShareSuccess(false), 3000);
      } catch (err) {
        // User cancelled or share failed
        copyToClipboard();
      }
    } else {
      copyToClipboard();
    }
  };

  // Copy link to clipboard
  const copyToClipboard = () => {
    navigator.clipboard.writeText(window.location.href);
    setShareSuccess(true);
    setTimeout(() => setShareSuccess(false), 3000);
  };

  // Reset everything
  const handleReset = () => {
    if (mergedVideoUrl) {
      URL.revokeObjectURL(mergedVideoUrl);
    }
    setStep("input");
    setConcept("");
    setStory(null);
    setImages([]);
    setVideos([]);
    setMergedVideoUrl(null);
    setProgress("");
    setError("");
    setCurrentPage(0);
    setShareSuccess(false);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (mergedVideoUrl) {
        URL.revokeObjectURL(mergedVideoUrl);
      }
    };
  }, [mergedVideoUrl]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-pink-50">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
              AI Storybook Director
            </h1>
            <p className="text-sm text-gray-500">
              将您的故事创意转化为动画绘本
            </p>
          </div>
          {step !== "input" && (
            <button
              onClick={handleReset}
              className="text-sm text-gray-500 hover:text-gray-700 border border-gray-300 rounded-lg px-3 py-1.5 hover:bg-gray-50"
            >
              重新开始
            </button>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        {/* Success Banner */}
        {shareSuccess && (
          <div className="mb-6 bg-green-50 border border-green-200 rounded-xl p-4 text-green-700">
            <p className="font-medium">✓ 已复制链接到剪贴板</p>
          </div>
        )}

        {/* Error Banner */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-4 text-red-700">
            <p className="font-medium">错误</p>
            <p className="text-sm">{error}</p>
          </div>
        )}

        {/* Progress Banner */}
        {progress && loading && (
          <div className="mb-6 bg-blue-50 border border-blue-200 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="animate-spin h-5 w-5 border-2 border-blue-600 border-t-transparent rounded-full" />
              <p className="text-blue-700">{progress}</p>
            </div>
          </div>
        )}

        {/* Step 1: Input */}
        {step === "input" && (
          <div className="max-w-2xl mx-auto">
            <div className="bg-white rounded-2xl shadow-lg p-8">
              <h2 className="text-xl font-semibold mb-2">
                您想创作什么样的故事？
              </h2>
              <p className="text-gray-500 mb-6">
                输入一个故事创意，我们将为您生成完整的动画绘本。
              </p>

              <textarea
                value={concept}
                onChange={(e) => setConcept(e.target.value)}
                placeholder='例如："一只小兔子去月球旅行"、"爱丽丝梦游仙境"、"一只勇敢的猫拯救森林"...'
                className="w-full h-32 p-4 border border-gray-300 rounded-xl text-lg resize-none focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />

              <div className="mt-4 flex items-center gap-4">
                <label className="text-sm text-gray-600">页数：</label>
                <select
                  value={pageCount}
                  onChange={(e) => setPageCount(Number(e.target.value))}
                  className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  {[3, 4, 5, 6, 7, 8].map((n) => (
                    <option key={n} value={n}>
                      {n} 页
                    </option>
                  ))}
                </select>
              </div>

              <button
                onClick={handleGenerateStory}
                disabled={loading || !concept.trim()}
                className="mt-6 w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold py-3 px-6 rounded-xl hover:from-purple-700 hover:to-pink-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {loading ? "生成中..." : "生成故事"}
              </button>
            </div>

            {/* Examples */}
            <div className="mt-6">
              <p className="text-sm text-gray-500 mb-3">试试这些创意：</p>
              <div className="flex flex-wrap gap-2">
                {[
                  "一只小兔子去月球旅行",
                  "一只勇敢的猫拯救魔法森林",
                  "一个女孩发现了通往糖果世界的门",
                  "一个机器人学习画画",
                ].map((example) => (
                  <button
                    key={example}
                    onClick={() => setConcept(example)}
                    className="text-sm bg-white border border-gray-200 rounded-full px-4 py-2 hover:bg-purple-50 hover:border-purple-300 transition-colors"
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Story Preview */}
        {step === "story" && story && (
          <div>
            <div className="bg-white rounded-2xl shadow-lg p-8 mb-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-2xl font-bold">{story.title}</h2>
                  <p className="text-gray-500 mt-1">
                    主题：{story.theme} | 钩子：{story.hook}
                  </p>
                </div>
                <span className="bg-purple-100 text-purple-700 text-xs font-medium px-3 py-1 rounded-full">
                  {story.pages.length} 页
                </span>
              </div>

              <div className="space-y-4">
                {story.pages.map((page) => (
                  <div
                    key={page.page}
                    className="border border-gray-100 rounded-xl p-4 bg-gray-50"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="bg-purple-600 text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center">
                        {page.page}
                      </span>
                      <span className="text-sm text-purple-600 font-medium">
                        {page.emotion}
                      </span>
                    </div>
                    <p className="text-gray-800 mb-1">{page.narration}</p>
                    <p className="text-xs text-gray-400 italic">
                      场景：{page.scene_description}
                    </p>
                  </div>
                ))}
              </div>

              <button
                onClick={handleGenerateAll}
                disabled={loading}
                className="mt-6 w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold py-3 px-6 rounded-xl hover:from-purple-700 hover:to-pink-700 disabled:opacity-50 transition-all"
              >
                {loading ? "生成中..." : "生成动画绘本"}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Generating */}
        {step === "generating" && story && (
          <div>
            <div className="bg-white rounded-2xl shadow-lg p-8">
              <h2 className="text-xl font-semibold mb-4">
                正在创作：{story.title}
              </h2>

              <div className="space-y-3">
                {story.pages.map((page, idx) => (
                  <div
                    key={page.page}
                    className="border border-gray-100 rounded-xl p-4 flex items-center gap-4"
                  >
                    <span className="bg-purple-600 text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center shrink-0">
                      {page.page}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {page.narration}
                      </p>
                      <p className="text-xs text-gray-400">{page.emotion}</p>
                    </div>
                    <div className="shrink-0">
                      {idx < images.length ? (
                        <span className="text-green-600 text-sm">
                          {idx < videos.length ? "✓ 视频完成" : "✓ 图片完成"}
                        </span>
                      ) : idx === images.length ? (
                        <span className="text-blue-600 text-sm animate-pulse">
                          生成中...
                        </span>
                      ) : (
                        <span className="text-gray-300 text-sm">等待中</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Show images as they're generated */}
            {images.length > 0 && (
              <div className="mt-6">
                <h3 className="text-lg font-semibold mb-3">已生成的图片</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {images.map((url, idx) => (
                    <div key={idx} className="bg-white rounded-xl shadow overflow-hidden">
                      <img
                        src={url}
                        alt={`第 ${idx + 1} 页`}
                        className="w-full aspect-video object-cover"
                      />
                      <div className="p-3">
                        <p className="text-sm text-gray-600">
                          {story?.pages[idx]?.narration}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 3.5: Merging */}
        {step === "merging" && (
          <div className="bg-white rounded-2xl shadow-lg p-8 text-center">
            <div className="animate-spin h-12 w-12 border-4 border-purple-600 border-t-transparent rounded-full mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">正在合并视频片段</h2>
            <p className="text-gray-500">{progress}</p>
            <p className="text-sm text-gray-400 mt-2">
              正在将 {videos.length} 个视频片段合并成一个完整的动画绘本...
            </p>
          </div>
        )}

        {/* Step 4: Result */}
        {step === "result" && story && (
          <div>
            {/* Merged Video Player */}
            {mergedVideoUrl && (
              <div className="bg-white rounded-2xl shadow-lg p-8 mb-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-2xl font-bold">{story.title}</h2>
                    <p className="text-gray-500">
                      完整动画绘本 • {story.pages.length} 页 • {videos.length} 个片段
                    </p>
                  </div>
                </div>

                {/* Main Video Player */}
                <div className="relative rounded-xl overflow-hidden bg-black mb-6">
                  <video
                    ref={videoRef}
                    src={mergedVideoUrl}
                    controls
                    className="w-full aspect-video"
                    poster={images[0]}
                  />
                </div>

                {/* Subtitle Display */}
                <div className="bg-gray-900 text-white rounded-xl p-6 mb-6">
                  <h3 className="text-sm font-medium text-gray-400 mb-3">故事字幕</h3>
                  <div className="space-y-3 max-h-48 overflow-y-auto">
                    {story.pages.map((page, idx) => (
                      <div key={idx} className="flex gap-3">
                        <span className="bg-purple-600 text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center shrink-0">
                          {page.page}
                        </span>
                        <p className="text-sm">{page.narration}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={handleDownload}
                    className="flex-1 min-w-[140px] bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold py-3 px-6 rounded-xl hover:from-purple-700 hover:to-pink-700 transition-all flex items-center justify-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    下载视频
                  </button>
                  <button
                    onClick={handleShare}
                    className="flex-1 min-w-[140px] bg-white border-2 border-purple-600 text-purple-600 font-semibold py-3 px-6 rounded-xl hover:bg-purple-50 transition-all flex items-center justify-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                    </svg>
                    分享
                  </button>
                  <button
                    onClick={handleReset}
                    className="flex-1 min-w-[140px] bg-gray-100 text-gray-700 font-semibold py-3 px-6 rounded-xl hover:bg-gray-200 transition-all"
                  >
                    创作新故事
                  </button>
                </div>
              </div>
            )}

            {/* Individual Clips (if merge failed or as alternative) */}
            {!mergedVideoUrl && videos.length > 0 && (
              <div className="bg-white rounded-2xl shadow-lg p-8 mb-6">
                <h3 className="text-lg font-semibold mb-4">视频片段</h3>
                <div className="space-y-4">
                  {videos.map((url, idx) => (
                    <div key={idx} className="border border-gray-100 rounded-xl overflow-hidden">
                      <video
                        src={url}
                        controls
                        className="w-full aspect-video bg-black"
                        poster={images[idx]}
                      />
                      <div className="p-3 flex items-center gap-2">
                        <span className="bg-purple-600 text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center">
                          {idx + 1}
                        </span>
                        <p className="text-sm text-gray-700">
                          {story.pages[idx]?.narration}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Images only (if videos failed) */}
            {videos.length === 0 && images.length > 0 && (
              <div className="bg-white rounded-2xl shadow-lg p-8 mb-6">
                <h3 className="text-lg font-semibold mb-4">故事插图</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {images.map((url, idx) => (
                    <div key={idx} className="bg-gray-50 rounded-xl overflow-hidden">
                      <img
                        src={url}
                        alt={`第 ${idx + 1} 页`}
                        className="w-full aspect-video object-cover"
                      />
                      <div className="p-3">
                        <p className="text-sm text-gray-700">
                          {story.pages[idx]?.narration}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Create Another Story Button (if not shown above) */}
            {mergedVideoUrl && (
              <div className="text-center text-gray-400 text-sm">
                <p>想要创作另一个故事？点击上方的"创作新故事"按钮</p>
              </div>
            )}
            {!mergedVideoUrl && (
              <button
                onClick={handleReset}
                className="w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold py-3 px-6 rounded-xl hover:from-purple-700 hover:to-pink-700 transition-all"
              >
                创作另一个故事
              </button>
            )}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="text-center py-6 text-sm text-gray-400">
        Built for Runway 2026 API Hackathon | Powered by DeepSeek + Runway API
      </footer>
    </div>
  );
}
