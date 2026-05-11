"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Composer, { type ComposerSettings, type AttachmentFile } from "./components/Composer";
import MusicSelector from "./components/MusicSelector";
import { mergeVideos, createStoryVideo, shareContent } from "@/lib/video-merge";

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

export default function Home() {
  const [step, setStep] = useState<Step>("input");
  const [story, setStory] = useState<Story | null>(null);
  const [images, setImages] = useState<string[]>([]);
  const [videos, setVideos] = useState<string[]>([]);
  const [mergedVideoUrl, setMergedVideoUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [shareSuccess, setShareSuccess] = useState(false);
  const [genStep, setGenStep] = useState(-1);
  const [showModal, setShowModal] = useState(false);
  const [currentGenIndex, setCurrentGenIndex] = useState(-1);
  const [selectedMusic, setSelectedMusic] = useState<{ id: string; name: string; description: string; mood: string; url: string } | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const settingsRef = useRef<ComposerSettings | null>(null);

  // Step 1: Generate story (called from Composer)
  const handleComposerSubmit = async (
    concept: string,
    settings: ComposerSettings,
    files: AttachmentFile[]
  ) => {
    if (!concept) return;
    settingsRef.current = settings;
    setLoading(true);
    setError("");
    setShowModal(true);
    setGenStep(0);
    setProgress("Generating story...");

    try {
      setGenStep(1);

      let res: Response | null = null;
      let data: Record<string, unknown> | null = null;
      const MAX_RETRIES = 2;

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        res = await fetch("/api/generate-story", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            concept,
            pageCount: Number(settings.pages),
            attachments: files.map((f) => ({ type: f.type, name: f.name })),
            style: settings.styleLabel,
            age: settings.age,
            lang: settings.lang,
          }),
        });

        data = await res.json();

        if (res.ok) break;

        if (res.status >= 500 && attempt < MAX_RETRIES) {
          setProgress(`Story generation failed, retrying (${attempt + 1}/${MAX_RETRIES})...`);
          await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
          continue;
        }

        throw new Error((data as { error?: string }).error || "Story generation failed");
      }

      if (!res!.ok) throw new Error("Story generation failed");

      setStory(data as unknown as Story);
      setGenStep(2);
      setStep("story");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
      setShowModal(false);
    } finally {
      setLoading(false);
      setProgress("");
    }
  };

  // Step 2: Generate images + videos + audio for all pages
  const handleGenerateAll = useCallback(async () => {
    if (!story) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError("");
    setShowModal(true);
    setGenStep(2);
    setStep("generating");
    setImages([]);
    setVideos([]);
    setMergedVideoUrl(null);
    setCurrentGenIndex(-1);

    const currentStyle = settingsRef.current?.styleLabel || "Watercolor";
    const styleHints: Record<string, string> = {
      "Watercolor": "children's picture book illustration, watercolor, soft colors, warm lighting",
      "3D": "3D rendered animation style, Pixar-like, vibrant colors, soft lighting",
      "Ink": "Chinese ink wash painting style, sumi-e, elegant brushstrokes, muted tones",
      "Pixel": "pixel art style, retro game aesthetic, 16-bit, vibrant palette",
    };
    const styleHint = styleHints[currentStyle] || styleHints["Watercolor"];

    const imageUrls: string[] = new Array(story.pages.length).fill("");
    const videoUrls: string[] = new Array(story.pages.length).fill("");
    const audioUrls: string[] = new Array(story.pages.length).fill("");
    let completedImages = 0;
    let completedVideos = 0;
    let completedAudios = 0;
    let rafId = 0;
    let dirty = false;

    const flushUI = () => {
      if (!dirty) return;
      dirty = false;
      setImages(imageUrls.filter(Boolean));
      setVideos(videoUrls.filter(Boolean));
      const total = story.pages.length * 3;
      const done = completedImages + completedVideos + completedAudios;
      setProgress(`Completed ${done}/${total} items (${completedImages} images, ${completedVideos} videos, ${completedAudios} audio)`);
    };

    const scheduleFlush = () => {
      dirty = true;
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(flushUI);
    };

    const fetchWithRetry = async (url: string, body: object, retries = 2): Promise<{ res: Response; data: Record<string, unknown> }> => {
      for (let attempt = 0; attempt <= retries; attempt++) {
        if (controller.signal.aborted) throw new DOMException("Aborted", "AbortError");
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        const data = await res.json();
        if (res.ok) return { res, data };
        if (res.status >= 500 && attempt < retries) {
          await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
          continue;
        }
        throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
      }
      throw new Error("Request failed");
    };

    const generatePage = async (i: number) => {
      if (controller.signal.aborted) return;

      const page = story.pages[i];

      setCurrentGenIndex(i * 3);

      const { data: imgData } = await fetchWithRetry("/api/generate-image", {
        sceneDescription: page.scene_description,
        styleHint,
      });
      imageUrls[i] = imgData.imageUrl as string;
      completedImages++;
      scheduleFlush();

      setCurrentGenIndex(i * 3 + 1);

      const { data: vidData } = await fetchWithRetry("/api/generate-video", {
        imageUrl: imgData.imageUrl,
        prompt: page.scene_description,
      });
      videoUrls[i] = vidData.videoUrl as string;
      completedVideos++;
      scheduleFlush();

      setCurrentGenIndex(i * 3 + 2);

      try {
        const { data: audioData } = await fetchWithRetry("/api/generate-audio", {
          text: page.narration,
          voice: "Maya",
        });
        audioUrls[i] = audioData.audioUrl as string;
        completedAudios++;
      } catch (err) {
        console.warn(`Audio generation failed for page ${i}:`, err);
        completedAudios++;
      }
      scheduleFlush();
    };

    try {
      const CONCURRENCY = 2;
      const queue = [...story.pages.map((_, i) => i)];
      const workers: Promise<void>[] = [];

      for (let w = 0; w < CONCURRENCY; w++) {
        workers.push((async () => {
          while (queue.length > 0) {
            const i = queue.shift();
            if (i === undefined) break;
            if (controller.signal.aborted) return;
            await generatePage(i);
          }
        })());
      }

      await Promise.all(workers);

      setImages(imageUrls.filter(Boolean));
      setVideos(videoUrls.filter(Boolean));

      setGenStep(3);
      setProgress("All clips generated, merging video with subtitles and music...");
      setStep("merging");

      const blob = await createStoryVideo(
        videoUrls.filter(Boolean),
        story.pages.map(p => p.narration),
        story.title,
        { 
          onProgress: setProgress,
          backgroundMusic: selectedMusic?.url,
          musicVolume: 0.3
        }
      );

      if (controller.signal.aborted) throw new DOMException("Aborted", "AbortError");

      const url = URL.createObjectURL(blob);
      setMergedVideoUrl(url);
      setGenStep(4);
      setShowModal(false);
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
      setShowModal(false);
      const partialImages = imageUrls.filter(Boolean);
      if (partialImages.length > 0) {
        setImages(partialImages);
        setStep("result");
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }, [story]);

  // Cancel generation
  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
    setLoading(false);
    setShowModal(false);
    setProgress("");
  }, []);

  // Download merged video
  const handleDownload = () => {
    if (!mergedVideoUrl || !story) return;
    const a = document.createElement("a");
    a.href = mergedVideoUrl;
    a.download = `${story.title.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, "_")}_animated_storybook.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Share video
  const handleShare = async () => {
    if (!story) return;
    const ok = await shareContent(
      `${story.title} - AI Animated Storybook`,
      `${story.hook}\n\nGenerated with AI Storybook Director`,
      window.location.href
    );
    if (!ok) {
      navigator.clipboard.writeText(window.location.href);
    }
    setShareSuccess(true);
    setTimeout(() => setShareSuccess(false), 3000);
  };

  // Reset everything
  const handleReset = () => {
    abortRef.current?.abort();
    if (mergedVideoUrl) URL.revokeObjectURL(mergedVideoUrl);
    setStep("input");
    setStory(null);
    setImages([]);
    setVideos([]);
    setMergedVideoUrl(null);
    setProgress("");
    setError("");
    setShareSuccess(false);
    setLoading(false);
    setShowModal(false);
  };

  useEffect(() => {
    return () => {
      if (mergedVideoUrl) URL.revokeObjectURL(mergedVideoUrl);
    };
  }, [mergedVideoUrl]);

  useEffect(() => {
    images.forEach((url) => {
      if (url) {
        const img = new Image();
        img.src = url;
      }
    });
  }, [images]);

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="flex items-center justify-between px-12 py-5 border-b border-[rgba(229,231,235,0.6)] bg-[rgba(255,255,255,0.7)] backdrop-blur-[14px] sticky top-0 z-10 max-sm:px-5 max-sm:py-3.5">
        <div className="flex items-center gap-3 text-[17px] font-bold">
          <div className="w-8 h-8 rounded-[9px] bg-[linear-gradient(135deg,#a855f7,#ec4899)] grid place-items-center text-white text-base shadow-[0_2px_8px_rgba(168,85,247,0.3)]">
            ✦
          </div>
          <span className="bg-[linear-gradient(135deg,#a855f7,#ec4899)] bg-clip-text text-transparent">
            AI Storybook Director
          </span>
        </div>
        <nav className="flex items-center gap-7 max-sm:gap-4">
          <a href="#" className="text-[#6b7280] no-underline text-sm font-medium hover:text-[#111827] transition-colors max-sm:hidden">
            Gallery
          </a>
          <a href="#" className="text-[#6b7280] no-underline text-sm font-medium hover:text-[#111827] transition-colors max-sm:hidden">
            Examples
          </a>
          <a href="#" className="text-[#6b7280] no-underline text-sm font-medium hover:text-[#111827] transition-colors max-sm:hidden">
            Pricing
          </a>
          {step !== "input" && (
            <button
              onClick={handleReset}
              className="text-sm text-[#6b7280] hover:text-[#111827] border border-[#e5e7eb] rounded-lg px-3 py-1.5 hover:bg-[#f9fafb] transition-all"
            >
              Start Over
            </button>
          )}
          <a
            href="#"
            className="px-4 py-2 bg-[#111827] text-white no-underline rounded-lg text-sm font-medium hover:bg-[#1f2937] transition-colors"
          >
            Sign In
          </a>
        </nav>
      </header>

      <main className="max-w-[880px] mx-auto px-6 pt-16 pb-30 max-sm:px-4 max-sm:pt-8 max-sm:pb-16">
        {/* Success Banner */}
        {shareSuccess && (
          <div className="mb-6 bg-green-50 border border-green-200 rounded-xl p-4 text-green-700">
            <p className="font-medium">✓ Link copied to clipboard</p>
          </div>
        )}

        {/* Error Banner */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 flex items-start justify-between gap-3">
            <div>
              <p className="font-medium">Error</p>
              <p className="text-sm">{error}</p>
            </div>
            <button
              onClick={() => setError("")}
              className="text-red-400 hover:text-red-600 text-lg leading-none shrink-0 bg-transparent border-none cursor-pointer p-1"
              aria-label="Close error"
            >
              ✕
            </button>
          </div>
        )}

        {/* Progress Banner */}
        {progress && loading && (
          <div className="mb-6 bg-blue-50 border border-blue-200 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="animate-spin h-5 w-5 border-2 border-blue-600 border-t-transparent rounded-full" />
              <p className="text-blue-700 flex-1">{progress}</p>
              <button
                onClick={handleCancel}
                className="text-xs text-blue-500 hover:text-blue-700 underline bg-transparent border-none cursor-pointer shrink-0"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Step 1: Input — Hero + Composer */}
        {step === "input" && (
          <div>
            {/* Hero */}
            <section className="text-center mb-2">
              <h1 className="text-[56px] font-extrabold tracking-[-0.03em] mb-4 leading-[1.05] max-sm:text-[36px]">
                Turn any story into
                <br />
                <span className="bg-[linear-gradient(135deg,#a855f7,#ec4899)] bg-clip-text text-transparent">
                  animated picture books
                </span>
              </h1>
              <p className="text-[17px] text-[#6b7280] max-w-[540px] mx-auto max-sm:text-[15px]">
                Describe a story, upload a reference image — AI generates characters, scenes, and music automatically.
              </p>
            </section>

            {/* Composer */}
            <Composer onSubmit={handleComposerSubmit} loading={loading} genStep={genStep} showModal={showModal} />
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
                    Theme: {story.theme} | Hook: {story.hook}
                  </p>
                </div>
                <span className="bg-purple-100 text-purple-700 text-xs font-medium px-3 py-1 rounded-full">
                  {story.pages.length} pages
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
                      Scene: {page.scene_description}
                    </p>
                  </div>
                ))}
              </div>

              {/* Background Music Selection */}
              <div className="mt-6 pt-6 border-t border-gray-200">
                <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  🎵 Background Music
                </h3>
                <MusicSelector 
                  selected={selectedMusic} 
                  onSelect={setSelectedMusic} 
                  storyTheme={story.theme}
                />
              </div>

              <button
                onClick={handleGenerateAll}
                disabled={loading}
                className="mt-6 w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold py-3 px-6 rounded-xl hover:from-purple-700 hover:to-pink-700 disabled:opacity-50 transition-all"
              >
                {loading ? "Generating..." : "Generate Animated Storybook"}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Generating */}
        {step === "generating" && story && (
          <div>
            <div className="bg-white rounded-2xl shadow-lg p-8">
              <h2 className="text-xl font-semibold mb-4">
                Creating: {story.title}
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
                      {(() => {
                        const imgDone = !!images[idx];
                        const vidDone = !!videos[idx];
                        const genImgIdx = idx * 2;
                        const genVidIdx = idx * 2 + 1;
                        const isGenImg = currentGenIndex === genImgIdx && loading;
                        const isGenVid = currentGenIndex === genVidIdx && loading;
                        if (vidDone) return <span className="text-green-600 text-sm">✓ Video done</span>;
                        if (imgDone) return <span className="text-green-600 text-sm">✓ Image done</span>;
                        if (isGenVid) return <span className="text-blue-600 text-sm animate-pulse">Generating video...</span>;
                        if (isGenImg) return <span className="text-blue-600 text-sm animate-pulse">Generating image...</span>;
                        return <span className="text-gray-300 text-sm">Waiting</span>;
                      })()}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {images.some(Boolean) && (
              <div className="mt-6">
                <h3 className="text-lg font-semibold mb-3">Generated Images</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {images.filter(Boolean).map((url, idx) => (
                    <div key={idx} className="bg-white rounded-xl shadow overflow-hidden">
                      <img
                        src={url}
                        alt={`Page ${idx + 1}`}
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
            <h2 className="text-xl font-semibold mb-2">Merging video clips</h2>
            <p className="text-gray-500">{progress}</p>
            <p className="text-sm text-gray-400 mt-2">
              Merging {videos.length} video clips into one complete animated storybook...
            </p>
            <button
              onClick={handleCancel}
              className="mt-4 text-sm text-purple-600 hover:text-purple-800 underline bg-transparent border-none cursor-pointer"
            >
              Cancel merge
            </button>
          </div>
        )}

        {/* Step 4: Result */}
        {step === "result" && story && (
          <div>
            {mergedVideoUrl && (
              <div className="bg-white rounded-2xl shadow-lg p-8 mb-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-2xl font-bold">{story.title}</h2>
                    <p className="text-gray-500">
                      Complete Animated Storybook • {story.pages.length} pages • {videos.length} clips
                    </p>
                  </div>
                </div>

                <div className="relative rounded-xl overflow-hidden bg-black mb-6">
                  <video
                    ref={videoRef}
                    src={mergedVideoUrl}
                    controls
                    className="w-full aspect-video"
                    poster={images[0]}
                  />
                </div>

                <div className="bg-gray-900 text-white rounded-xl p-6 mb-6">
                  <h3 className="text-sm font-medium text-gray-400 mb-3">Story Subtitles</h3>
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

                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={handleDownload}
                    className="flex-1 min-w-[140px] bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold py-3 px-6 rounded-xl hover:from-purple-700 hover:to-pink-700 transition-all flex items-center justify-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Download Video
                  </button>
                  <button
                    onClick={handleShare}
                    className="flex-1 min-w-[140px] bg-white border-2 border-purple-600 text-purple-600 font-semibold py-3 px-6 rounded-xl hover:bg-purple-50 transition-all flex items-center justify-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                    </svg>
                    Share
                  </button>
                  <button
                    onClick={handleReset}
                    className="flex-1 min-w-[140px] bg-gray-100 text-gray-700 font-semibold py-3 px-6 rounded-xl hover:bg-gray-200 transition-all"
                  >
                    Create New Story
                  </button>
                </div>
              </div>
            )}

            {!mergedVideoUrl && videos.length > 0 && (
              <div className="bg-white rounded-2xl shadow-lg p-8 mb-6">
                <h3 className="text-lg font-semibold mb-4">Video Clips</h3>
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

            {videos.length === 0 && images.length > 0 && (
              <div className="bg-white rounded-2xl shadow-lg p-8 mb-6">
                <h3 className="text-lg font-semibold mb-4">Story Illustrations</h3>
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

            {!mergedVideoUrl && (
              <button
                onClick={handleReset}
                className="w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold py-3 px-6 rounded-xl hover:from-purple-700 hover:to-pink-700 transition-all"
              >
                Create Another Story
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
