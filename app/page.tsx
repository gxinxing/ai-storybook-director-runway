"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Composer, { type ComposerSettings, type AttachmentFile } from "./components/Composer";
import MusicSelector from "./components/MusicSelector";
import { shareContent } from "@/lib/video-merge";

async function mergeVideoOnServer(
  videoUrls: string[],
  audioUrls: string[],
  narrations: string[],
  title: string,
  options?: { backgroundMusic?: string; musicVolume?: number; width?: number; height?: number }
): Promise<Blob> {
  const { backgroundMusic, musicVolume = 0.3, width = 1280, height = 720 } = options || {};

  console.log("[Merge] Starting server-side merge with:", {
    videoCount: videoUrls.filter(Boolean).length,
    audioCount: audioUrls.filter(Boolean).length,
    videoUrls: videoUrls.filter(Boolean).map(u => u.substring(0, 50)),
    audioUrls: audioUrls.filter(Boolean).map(u => u.substring(0, 50)),
    backgroundMusic: backgroundMusic?.substring(0, 50),
  });

  const res = await fetch("/api/merge-video", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      videoUrls,
      audioUrls,
      narrations,
      title,
      backgroundMusic,
      musicVolume,
      width,
      height,
    }),
  });

  console.log("[Merge] Server response status:", res.status);

  if (!res.ok) {
    const error = await res.json();
    console.error("[Merge] Server error response:", error);
    throw new Error(error.error || "Video merge failed");
  }

  const blob = await res.blob();
  console.log("[Merge] Received merged video blob:", { size: blob.size, type: blob.type });
  return blob;
}

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
  const [audios, setAudios] = useState<string[]>([]);
  const [mergedVideoUrl, setMergedVideoUrl] = useState<string | null>(null);
  const [mergedBlob, setMergedBlob] = useState<Blob | null>(null);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [shareSuccess, setShareSuccess] = useState(false);
  const [genStep, setGenStep] = useState(-1);
  const [showModal, setShowModal] = useState(false);
  const [currentGenIndex, setCurrentGenIndex] = useState(-1);
  const [selectedMusic, setSelectedMusic] = useState<{ id: string; name: string; description: string; mood: string; url: string } | null>(null);
  const [aspectRatio, setAspectRatio] = useState<"16:9" | "9:16">("16:9");
  const [videoModel, setVideoModel] = useState<string>("gen4.5");
  const [refineInputs, setRefineInputs] = useState<Record<number, string>>({});
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
    
    // 从设置中读取 aspectRatio 和 videoModel
    if (settings.aspectRatio) {
      setAspectRatio(settings.aspectRatio);
    }
    if (settings.videoModel) {
      setVideoModel(settings.videoModel);
    }

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

  // Step 2: Generate images first, then wait for user confirmation before generating videos
  const [imagesConfirmed, setImagesConfirmed] = useState(false);
  const [currentGenStage, setCurrentGenStage] = useState<'images' | 'videos' | 'merging'>('images');

  const pollForTask = async (taskId: string, type: 'image' | 'video', signal: AbortSignal, timeout = 600000): Promise<string> => {
    return new Promise((resolve, reject) => {
      const pollInterval = 3000;

      const timeoutId = setTimeout(() => {
        clearInterval(intervalId);
        reject(new Error(`Task polling for ${type} timed out after ${timeout / 1000}s.`));
      }, timeout);

      const provider = type === 'video' ? 'runway' : 'runway';
      
      const intervalId = setInterval(async () => {
        if (signal.aborted) {
          clearInterval(intervalId);
          clearTimeout(timeoutId);
          return reject(new DOMException("Aborted", "AbortError"));
        }
        try {
          const res = await fetch(`/api/task-status?taskId=${encodeURIComponent(taskId)}&provider=${provider}`, { signal });
          const data = await res.json();
          console.log(`[Poll] ${type} task ${taskId} status: ${data.status}`, data);
          if (data.status === 'SUCCEEDED') {
            clearInterval(intervalId);
            clearTimeout(timeoutId);
            const outputUrl = data.output?.[0] || data.output?.url || data.output?.video;
            console.log(`[Poll] ${type} succeeded, output:`, outputUrl ? outputUrl.substring(0, 100) : 'undefined');
            resolve(outputUrl);
          } else if (data.status === 'FAILED') {
            clearInterval(intervalId);
            clearTimeout(timeoutId);
            console.error(`[Poll] ${type} task failed:`, data);
            reject(new Error(data.error || data.failureReason || `Task ${type} failed`));
          }
        } catch (err) {
          if (err instanceof DOMException && err.name === 'AbortError') {
            clearInterval(intervalId);
            clearTimeout(timeoutId);
            reject(err);
          }
        }
      }, pollInterval);
    });
  };

  const fetchWithRetry = async (url: string, body: object, retries = 2, signal?: AbortSignal): Promise<{ res: Response; data: Record<string, unknown> }> => {
    for (let attempt = 0; attempt <= retries; attempt++) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal,
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

  // Generate only images (first phase)
  const handleGenerateImages = useCallback(async () => {
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
    setCurrentGenStage('images');
    setImagesConfirmed(false);

    const currentStyle = settingsRef.current?.styleLabel || "Watercolor";
    const styleHints: Record<string, string> = {
      "Watercolor": "children's picture book illustration, watercolor, soft colors, warm lighting, dreamy atmosphere",
      "3D": "3D rendered animation style, Pixar-like, vibrant saturated colors, soft cinematic lighting, high quality 4k",
      "Ink": "Chinese ink wash painting style, sumi-e, elegant brushstrokes, muted tones, peaceful atmosphere",
      "Pixel": "pixel art style, retro game aesthetic, 16-bit, vibrant palette, crisp pixel perfect",
      "Cinematic": "epic cinematic lighting, dramatic atmosphere, film grain texture, shallow depth of field, highly detailed, 4k",
      "Anime": "anime style, cel shading, vibrant saturated colors, dynamic composition, motion lines, Japanese animation aesthetic",
      "Cyberpunk": "neon lights, cyberpunk city, dense fog, teal and orange color palette, dystopian aesthetic, anamorphic lens flare"
    };
    const styleHint = styleHints[currentStyle] || styleHints["Watercolor"];
    const imgRatio = aspectRatio === "16:9" ? "1280:720" : "720:1280";

    const imageUrls: string[] = new Array(story.pages.length).fill("");
    let completedImages = 0;
    let rafId = 0;
    let dirty = false;

    const flushUI = () => {
      if (!dirty) return;
      dirty = false;
      setImages([...imageUrls]);
      setProgress(`Completed ${completedImages}/${story.pages.length} images`);
    };

    const scheduleFlush = () => {
      dirty = true;
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(flushUI);
    };

    try {
      for (let i = 0; i < story.pages.length; i++) {
        if (controller.signal.aborted) return;
        
        setCurrentGenIndex(i);
        setProgress(`Generating image ${i + 1}/${story.pages.length}...`);

        const page = story.pages[i];
        
        const imgSubmitRes = await fetch("/api/generate-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sceneDescription: page.scene_description, styleHint, ratio: imgRatio }),
          signal: controller.signal,
        });
        if (!imgSubmitRes.ok) throw new Error((await imgSubmitRes.json()).error || 'Image task submission failed');
        const { taskId: imageTaskId } = await imgSubmitRes.json();

        const imageUrl = await pollForTask(imageTaskId, 'image', controller.signal);
        console.log(`[Generate] Page ${i + 1} image generated:`, imageUrl?.substring(0, 50));
        imageUrls[i] = imageUrl;
        completedImages++;
        scheduleFlush();
      }

      setImages([...imageUrls]);
      setGenStep(3);
      setShowModal(false);
      setStep("story");
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      let message = err instanceof Error ? err.message : "Unknown error";
      
      if (message.includes("moderation") || message.includes("SAFETY") || message.includes("INPUT_PREPROCESSING")) {
        message = "内容审核未通过：故事内容可能包含敏感词汇。请尝试修改故事描述，使用更温和的词汇。";
      }
      
      console.error("[Generate Images] Error:", message);
      setError(message);
      setShowModal(false);
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }, [story, aspectRatio]);

  // Generate videos after images are confirmed
  const handleGenerateVideos = useCallback(async () => {
    if (!story || images.length === 0) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError("");
    setShowModal(true);
    setGenStep(3);
    setStep("generating");
    setVideos([]);
    setAudios([]);
    setCurrentGenStage('videos');

    const vidRatio = aspectRatio === "16:9" ? "1280:720" : "720:1280";

    const videoUrls: string[] = new Array(story.pages.length).fill("");
    const audioUrls: string[] = new Array(story.pages.length).fill("");
    let completedVideos = 0;
    let completedAudios = 0;
    let rafId = 0;
    let dirty = false;

    const flushUI = () => {
      if (!dirty) return;
      dirty = false;
      setVideos([...videoUrls]);
      setAudios([...audioUrls]);
      setProgress(`Completed ${completedVideos}/${story.pages.length} videos, ${completedAudios}/${story.pages.length} audio`);
    };

    const scheduleFlush = () => {
      dirty = true;
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(flushUI);
    };

    try {
      for (let i = 0; i < story.pages.length; i++) {
        if (controller.signal.aborted) return;
        
        setCurrentGenIndex(i);
        setProgress(`Generating video ${i + 1}/${story.pages.length}...`);

        const page = story.pages[i];
        const imageUrl = images[i];

        // Generate audio in parallel
        const audioPromise = (async () => {
          try {
            const { data: audioData } = await fetchWithRetry("/api/generate-audio", {
              text: page.narration,
              voice: "Maya",
            }, 2, controller.signal);
            audioUrls[i] = audioData.audioUrl as string;
          } catch (err) {
            console.warn(`Audio generation failed for page ${i}:`, err);
          }
          completedAudios++;
          scheduleFlush();
        })();

        // Generate video
        const vidSubmitRes = await fetch("/api/generate-video", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageUrl, prompt: page.scene_description, ratio: vidRatio, model: videoModel }),
          signal: controller.signal,
        });
        if (!vidSubmitRes.ok) throw new Error((await vidSubmitRes.json()).error || 'Video task submission failed');
        const { taskId: videoTaskId } = await vidSubmitRes.json();

        const videoUrl = await pollForTask(videoTaskId, 'video', controller.signal);
        console.log(`[Generate] Page ${i + 1} video generated:`, videoUrl?.substring(0, 50));
        if (!videoUrl) {
          console.error(`[Generate] Page ${i + 1} video generation failed: no video URL returned`);
          throw new Error(`Page ${i + 1} video generation failed: no video URL returned`);
        }
        videoUrls[i] = videoUrl;
        completedVideos++;
        scheduleFlush();

        await audioPromise;
      }

      setVideos([...videoUrls]);
      setAudios([...audioUrls]);
      setCurrentGenStage('merging');
      setProgress("All clips generated, merging video with subtitles and music...");
      setStep("merging");

      const blob = await mergeVideoOnServer(
        videoUrls.filter(Boolean),
        audioUrls.filter(Boolean),
        story.pages.map(p => p.narration),
        story.title,
        {
          backgroundMusic: selectedMusic?.url,
          musicVolume: 0.3,
          width: aspectRatio === "16:9" ? 1280 : 768,
          height: aspectRatio === "16:9" ? 720 : 1280,
        }
      );

      if (controller.signal.aborted) throw new DOMException("Aborted", "AbortError");

      setMergedBlob(blob);
      const url = URL.createObjectURL(blob);
      setMergedVideoUrl(url);
      setGenStep(4);
      setShowModal(false);
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      let message = err instanceof Error ? err.message : "Unknown error";
      
      if (message.includes("moderation") || message.includes("SAFETY") || message.includes("INPUT_PREPROCESSING")) {
        message = "内容审核未通过：故事内容可能包含敏感词汇。请尝试修改故事描述，使用更温和的词汇。";
      }
      
      console.error("[Generate Videos] Error:", message);
      setError(message);
      setShowModal(false);
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }, [story, images, videoModel, aspectRatio, selectedMusic]);

  // Handlers for merging finalized videos without regenerating
  const handleMergeOnly = async () => {
    if (!story) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      setLoading(true);
      setError("");
      setStep("merging");
      setProgress("Merging video clips...");

      const validVideos = videos.filter(Boolean);
      const validAudios = audios.filter(Boolean);

      console.log("[Merge] Valid videos:", validVideos.length, "Valid audios:", validAudios.length);

      if (validVideos.length === 0) {
        throw new Error("No valid video clips available for merging");
      }

      const blob = await mergeVideoOnServer(
        validVideos,
        validAudios,
        story.pages.map(p => p.narration),
        story.title,
        {
          backgroundMusic: selectedMusic?.url,
          musicVolume: 0.3,
          width: aspectRatio === "16:9" ? 1280 : 768,
          height: aspectRatio === "16:9" ? 720 : 1280,
        }
      );

      if (controller.signal.aborted) throw new DOMException("Aborted", "AbortError");

      if (!blob || blob.size === 0) {
        throw new Error("Video merge produced an empty file");
      }
      console.log("[Merge] Generated video blob:", blob.size, "bytes, type:", blob.type);

      setMergedBlob(blob);
      const url = URL.createObjectURL(blob);
      setMergedVideoUrl(url);
      setStep("result");
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
      setStep("generating");
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  };

  // Handle targeted modification for a single page based on natural language
  const handleRefinePage = async (pageIndex: number, userInstruction: string) => {
    if (!story || !story.pages[pageIndex]) return;

    setLoading(true);
    setProgress(`Refining page ${pageIndex + 1}...`);

    try {
      const page = story.pages[pageIndex];
      const currentStyle = settingsRef.current?.styleLabel || "Watercolor";
      const imgRatio = aspectRatio === "16:9" ? "1280:720" : "768:1280";
      const vidRatio = aspectRatio === "16:9" ? "1280:768" : "768:1280";

      // 1. Let Agent refine the prompt
      setProgress("Agent is translating your instruction...");
      const refineRes = await fetch("/api/refine-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          originalPrompt: page.scene_description,
          instruction: userInstruction
        }),
      });
      if (!refineRes.ok) throw new Error("Failed to refine prompt");
      const { refinedPrompt } = await refineRes.json();

      // Update story state with new prompt
      const newStory = { ...story };
      newStory.pages[pageIndex].scene_description = refinedPrompt;
      setStory(newStory);

      const controller = new AbortController();
      abortRef.current = controller;

      // 2. Regenerate Image
      setProgress("Regenerating image with new prompt...");
      const imgSubmitRes = await fetch("/api/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sceneDescription: refinedPrompt, styleHint: currentStyle, ratio: imgRatio }),
      });
      const { taskId: imageTaskId } = await imgSubmitRes.json();

      // Polling helper (reused logic)
      const pollForTask = async (taskId: string, type: 'image' | 'video'): Promise<string> => {
        return new Promise((resolve, reject) => {
          const interval = setInterval(async () => {
            const res = await fetch(`/api/task-status?taskId=${encodeURIComponent(taskId)}`);
            const data = await res.json();
            if (data.status === 'SUCCEEDED') { clearInterval(interval); resolve(data.output?.[0] || data.output?.url); }
            else if (data.status === 'FAILED') { clearInterval(interval); reject(new Error(data.error)); }
          }, 3000);
        });
      };

      const newImageUrl = await pollForTask(imageTaskId, 'image');

      setImages(prev => { const arr = [...prev]; arr[pageIndex] = newImageUrl; return arr; });

      // 3. Regenerate Video
      setProgress("Regenerating video with new image...");
      const vidSubmitRes = await fetch("/api/generate-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: newImageUrl, prompt: refinedPrompt, ratio: vidRatio }),
      });
      const { taskId: videoTaskId } = await vidSubmitRes.json();
      const newVideoUrl = await pollForTask(videoTaskId, 'video');

      setVideos(prev => { const arr = [...prev]; arr[pageIndex] = newVideoUrl; return arr; });

      // Because videos changed, clear merged video so user can re-merge
      setMergedVideoUrl(null);
      setStep("generating"); // Return to generating/review view

    } catch (err: any) {
      setError(err.message || "Failed to refine page");
    } finally {
      setLoading(false);
      setProgress("");
    }
  };

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
    let file: File | undefined;
    if (mergedBlob) {
      file = new File(
        [mergedBlob],
        `${story.title.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, "_")}.mp4`,
        { type: "video/mp4" }
      );
    }
    const ok = await shareContent(
      `${story.title} - AI Animated Storybook`,
      `${story.hook}\n\nGenerated with AI Storybook Director`,
      window.location.href,
      file
    );
    if (!ok) {
      navigator.clipboard.writeText(window.location.href);
      alert("Direct app sharing is only available on supported mobile devices. Link copied to clipboard!");
    }
    else {
      setShareSuccess(true);
      setTimeout(() => setShareSuccess(false), 3000);
    }
  };

  // Reset everything
  const handleReset = () => {
    abortRef.current?.abort();
    if (mergedVideoUrl) URL.revokeObjectURL(mergedVideoUrl);
    setStep("input");
    setStory(null);
    setImages([]);
    setVideos([]);
    setAudios([]);
    setMergedVideoUrl(null);
    setMergedBlob(null);
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

  // Debug: Log videos state updates
  useEffect(() => {
    console.log("[Debug] Videos state updated:", {
      total: videos.length,
      valid: videos.filter(Boolean).length,
      urls: videos.map((v, i) => ({ index: i, hasVideo: !!v, url: v?.substring(0, 50) })),
    });
  }, [videos]);

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

              {/* Image Grid Preview */}
              {images.length > 0 && (
                <div className="mt-6 pt-6 border-t border-gray-200">
                  <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                    🖼️ Generated Images ({images.length}/{story.pages.length})
                  </h3>
                  <div className={`grid gap-3 ${images.length <= 9 ? 'grid-cols-3' : images.length <= 12 ? 'grid-cols-4' : 'grid-cols-6'}`}>
                    {images.map((imgUrl, index) => (
                      <div key={index} className="relative aspect-video rounded-lg overflow-hidden border-2 border-gray-200 hover:border-purple-400 transition-colors">
                        {imgUrl ? (
                          <img
                            src={imgUrl}
                            alt={`Page ${index + 1}`}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full bg-gray-100 flex items-center justify-center">
                            <span className="text-gray-400 text-sm">Loading...</span>
                          </div>
                        )}
                        <span className="absolute top-1 left-1 bg-black/50 text-white text-xs px-1.5 py-0.5 rounded">
                          {index + 1}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="mt-6 space-y-3">
                {images.length === 0 ? (
                  // Step 1: Generate images first
                  <button
                    onClick={handleGenerateImages}
                    disabled={loading}
                    className="w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold py-3 px-6 rounded-xl hover:from-purple-700 hover:to-pink-700 disabled:opacity-50 transition-all"
                  >
                    {loading ? "Generating Images..." : "🎨 Generate Keyframes"}
                  </button>
                ) : images.length === story.pages.length ? (
                  // Step 2: Images ready, confirm and generate videos
                  <div className="space-y-3">
                    <button
                      onClick={handleGenerateVideos}
                      disabled={loading}
                      className="w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold py-3 px-6 rounded-xl hover:from-purple-700 hover:to-pink-700 disabled:opacity-50 transition-all"
                    >
                      {loading ? "Generating Videos..." : "🎬 Generate Videos"}
                    </button>
                    <button
                      onClick={() => {
                        setImages([]);
                        setImagesConfirmed(false);
                      }}
                      className="w-full border-2 border-gray-200 text-gray-600 font-semibold py-3 px-6 rounded-xl hover:border-gray-300 transition-all"
                    >
                      🔄 Regenerate Images
                    </button>
                  </div>
                ) : (
                  // Partial images generated
                  <button
                    onClick={handleGenerateImages}
                    disabled={loading}
                    className="w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold py-3 px-6 rounded-xl hover:from-purple-700 hover:to-pink-700 disabled:opacity-50 transition-all"
                  >
                    {loading ? "Generating..." : `Continue (${images.length}/${story.pages.length})`}
                  </button>
                )}
              </div>
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
                        const genImgIdx = idx * 3;
                        const genVidIdx = idx * 3 + 1;
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
                <h3 className="text-lg font-semibold mb-3">Storyboards</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {images.map((imgUrl, idx) => {
                    if (!imgUrl) return null;
                    const vidUrl = videos[idx];
                    const handleVideoError = (e: React.SyntheticEvent<HTMLVideoElement>) => {
                      console.error(`[Video Error] Page ${idx + 1} failed to load:`, vidUrl);
                      const videoElement = e.target as HTMLVideoElement;
                      videoElement.poster = imgUrl; // Fallback to image
                    };
                    return (
                      <div key={idx} className="bg-white rounded-xl shadow overflow-hidden flex flex-col border border-gray-100">
                        {vidUrl ? (
                          <>
                            <video 
                              src={vidUrl} 
                              controls 
                              className={`w-full ${aspectRatio === "16:9" ? "aspect-video" : "aspect-[9/16]"} bg-black`} 
                              poster={imgUrl}
                              onError={handleVideoError}
                              onLoadStart={() => console.log(`[Video Loading] Page ${idx + 1} started loading:`, vidUrl?.substring(0, 50))}
                              onLoadedData={() => console.log(`[Video Loaded] Page ${idx + 1} loaded successfully`)}
                            />
                            <div className="px-4 pt-2 text-xs text-gray-500">
                              Video URL: {vidUrl.substring(0, 40)}...
                            </div>
                          </>
                        ) : (
                          <img src={imgUrl} alt={`Page ${idx + 1}`} className={`w-full ${aspectRatio === "16:9" ? "aspect-video" : "aspect-[9/16]"} object-cover`} />
                        )}
                        <div className="p-4 flex-1 flex flex-col gap-3">
                          <div className="flex items-center gap-2">
                            <span className="bg-purple-600 text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center shrink-0">
                              {idx + 1}
                            </span>
                            <p className="text-sm text-gray-700 font-medium line-clamp-2">
                              {story?.pages[idx]?.narration}
                            </p>
                          </div>
                          <div className="text-xs text-gray-500 italic line-clamp-2">
                            {story?.pages[idx]?.scene_description}
                          </div>
                          <div className="mt-auto flex gap-2 pt-2 border-t border-gray-50">
                            <input
                              type="text"
                              value={refineInputs[idx] || ""}
                              onChange={(e) => setRefineInputs(prev => ({ ...prev, [idx]: e.target.value }))}
                              placeholder="e.g., Change to sunset lighting"
                              className="flex-1 text-sm p-2 border border-gray-200 rounded-lg focus:outline-none focus:border-purple-500"
                              disabled={loading}
                            />
                            <button
                              onClick={() => handleRefinePage(idx, refineInputs[idx] || "")}
                              disabled={loading || !refineInputs[idx]}
                              className="text-sm bg-purple-100 text-purple-700 font-medium px-3 py-2 rounded-lg hover:bg-purple-200 disabled:opacity-50 transition-colors whitespace-nowrap"
                            >
                              🚀 Refine
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {videos.filter(Boolean).length > 0 && !loading && (
              <div className="mt-8 text-center border-t border-gray-200 pt-6">
                <button
                  onClick={handleMergeOnly}
                  className="bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold py-3 px-8 rounded-xl hover:from-purple-700 hover:to-pink-700 transition-all text-lg shadow-lg hover:shadow-xl"
                >
                  ✨ Finalize & Merge Video ({videos.filter(Boolean).length}/{story?.pages.length})
                </button>
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
                    className={`w-full ${aspectRatio === "16:9" ? "aspect-video" : "aspect-[9/16] max-h-[70vh] object-contain mx-auto"}`}
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
                    Download to Desktop
                  </button>
                  <button
                    onClick={handleShare}
                    className="flex-1 min-w-[140px] bg-white border-2 border-purple-600 text-purple-600 font-semibold py-3 px-6 rounded-xl hover:bg-purple-50 transition-all flex items-center justify-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                    </svg>
                    Share to App (Mobile)
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

            {videos.length > 0 && (
              <div className="bg-white rounded-2xl shadow-lg p-8 mb-6">
                <h3 className="text-lg font-semibold mb-4">Refine Individual Clips</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {videos.map((url, idx) => {
                    if (!url) return null;
                    const handleVideoError = (e: React.SyntheticEvent<HTMLVideoElement>) => {
                      console.error(`[Video Error] Result Page ${idx + 1} failed to load:`, url);
                      const videoElement = e.target as HTMLVideoElement;
                      videoElement.poster = images[idx]; // Fallback to image
                    };
                    return (
                      <div key={idx} className="border border-gray-100 rounded-xl overflow-hidden flex flex-col">
                        <video 
                          src={url} 
                          controls 
                          className={`w-full ${aspectRatio === "16:9" ? "aspect-video" : "aspect-[9/16]"} bg-black`} 
                          poster={images[idx]}
                          onError={handleVideoError}
                          onLoadStart={() => console.log(`[Video Loading] Result Page ${idx + 1} started loading:`, url?.substring(0, 50))}
                          onLoadedData={() => console.log(`[Video Loaded] Result Page ${idx + 1} loaded successfully`)}
                        />
                        <div className="px-4 pt-2 text-xs text-gray-500">
                          Video URL: {url.substring(0, 40)}...
                        </div>
                        <div className="p-4 flex-1 flex flex-col gap-3">
                          <div className="flex items-center gap-2">
                            <span className="bg-purple-600 text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center shrink-0">
                              {idx + 1}
                            </span>
                            <p className="text-sm text-gray-700 font-medium line-clamp-2">
                              {story.pages[idx]?.narration}
                            </p>
                          </div>
                          <div className="text-xs text-gray-500 italic line-clamp-2">
                            {story.pages[idx]?.scene_description}
                          </div>
                          <div className="mt-auto flex gap-2 pt-2 border-t border-gray-50">
                            <input
                              type="text"
                              value={refineInputs[idx] || ""}
                              onChange={(e) => setRefineInputs(prev => ({ ...prev, [idx]: e.target.value }))}
                              placeholder="e.g., Change to sunset lighting"
                              className="flex-1 text-sm p-2 border border-gray-200 rounded-lg focus:outline-none focus:border-purple-500"
                              disabled={loading}
                            />
                            <button
                              onClick={() => handleRefinePage(idx, refineInputs[idx] || "")}
                              disabled={loading || !refineInputs[idx]}
                              className="text-sm bg-purple-100 text-purple-700 font-medium px-3 py-2 rounded-lg hover:bg-purple-200 disabled:opacity-50 transition-colors whitespace-nowrap"
                            >
                              🚀 Refine
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {videos.length === 0 && images.length > 0 && (
              <div className="bg-white rounded-2xl shadow-lg p-8 mb-6">
                <h3 className="text-lg font-semibold mb-4">Story Illustrations</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {images.map((url, idx) => {
                    if (!url) return null;
                    return (
                      <div key={idx} className="bg-gray-50 rounded-xl overflow-hidden flex flex-col">
                        <img src={url} alt={`Page ${idx + 1}`} className={`w-full ${aspectRatio === "16:9" ? "aspect-video" : "aspect-[9/16]"} object-cover`} />
                        <div className="p-4 flex-1 flex flex-col gap-3">
                          <p className="text-sm text-gray-700 font-medium line-clamp-2">
                            {story.pages[idx]?.narration}
                          </p>
                          <div className="mt-auto flex gap-2 pt-2 border-t border-gray-200">
                            <input
                              type="text"
                              value={refineInputs[idx] || ""}
                              onChange={(e) => setRefineInputs(prev => ({ ...prev, [idx]: e.target.value }))}
                              placeholder="e.g., Change to sunset lighting"
                              className="flex-1 text-sm p-2 border border-gray-200 rounded-lg focus:outline-none focus:border-purple-500"
                              disabled={loading}
                            />
                            <button
                              onClick={() => handleRefinePage(idx, refineInputs[idx] || "")}
                              disabled={loading || !refineInputs[idx]}
                              className="text-sm bg-purple-100 text-purple-700 font-medium px-3 py-2 rounded-lg hover:bg-purple-200 disabled:opacity-50 transition-colors"
                            >
                              🚀 Refine
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {!mergedVideoUrl && (
              <button
                onClick={handleReset}
                className="w-full bg-gray-200 text-gray-700 font-semibold py-3 px-6 rounded-xl hover:bg-gray-300 transition-all"
              >
                Create Another Story
              </button>
            )}

            {!mergedVideoUrl && videos.filter(Boolean).length > 0 && !loading && (
              <div className="mt-4">
                <button
                  onClick={handleMergeOnly}
                  className="w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold py-3 px-6 rounded-xl hover:from-purple-700 hover:to-pink-700 transition-all"
                >
                  ✨ Finalize & Merge Video ({videos.filter(Boolean).length}/{story?.pages.length})
                </button>
              </div>
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
