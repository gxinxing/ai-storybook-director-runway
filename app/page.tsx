"use client";

import { useState } from "react";

type Step = "input" | "story" | "generating" | "result";

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
  const [concept, setConcept] = useState("");
  const [pageCount, setPageCount] = useState(5);
  const [story, setStory] = useState<Story | null>(null);
  const [images, setImages] = useState<string[]>([]);
  const [videos, setVideos] = useState<string[]>([]);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Step 1: Generate story
  const handleGenerateStory = async () => {
    if (!concept.trim()) return;
    setLoading(true);
    setError("");
    setProgress("Generating story...");

    try {
      const res = await fetch("/api/generate-story", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ concept, pageCount }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to generate story");
      }

      setStory(data);
      setStep("story");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
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

    try {
      const imageUrls: string[] = [];
      const videoUrls: string[] = [];

      for (let i = 0; i < story.pages.length; i++) {
        const page = story.pages[i];

        // Generate image
        setProgress(
          `Generating image ${i + 1}/${story.pages.length}: ${page.emotion}...`
        );
        const imgRes = await fetch("/api/generate-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sceneDescription: page.scene_description }),
        });

        const imgData = await imgRes.json();
        if (!imgRes.ok) throw new Error(imgData.error || "Image generation failed");
        imageUrls.push(imgData.imageUrl);
        setImages([...imageUrls]);

        // Generate video
        setProgress(
          `Generating video ${i + 1}/${story.pages.length}: ${page.emotion}...`
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
        if (!vidRes.ok) throw new Error(vidData.error || "Video generation failed");
        videoUrls.push(vidData.videoUrl);
        setVideos([...videoUrls]);
      }

      setProgress("Done!");
      setStep("result");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
      // Don't go back to input - show what we have so far
      if (images.length > 0) {
        setStep("result");
      }
    } finally {
      setLoading(false);
    }
  };

  // Reset everything
  const handleReset = () => {
    setStep("input");
    setConcept("");
    setStory(null);
    setImages([]);
    setVideos([]);
    setProgress("");
    setError("");
  };

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
              Transform your story concept into an animated picture book
            </p>
          </div>
          {step !== "input" && (
            <button
              onClick={handleReset}
              className="text-sm text-gray-500 hover:text-gray-700 border border-gray-300 rounded-lg px-3 py-1.5 hover:bg-gray-50"
            >
              Start Over
            </button>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        {/* Error Banner */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-4 text-red-700">
            <p className="font-medium">Error</p>
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
                What story would you like to create?
              </h2>
              <p className="text-gray-500 mb-6">
                Enter a story concept and we&apos;ll generate a complete animated
                picture book for you.
              </p>

              <textarea
                value={concept}
                onChange={(e) => setConcept(e.target.value)}
                placeholder='e.g., "A little rabbit travels to the moon", "Alice in Wonderland", "A brave cat saves the forest"...'
                className="w-full h-32 p-4 border border-gray-300 rounded-xl text-lg resize-none focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />

              <div className="mt-4 flex items-center gap-4">
                <label className="text-sm text-gray-600">Pages:</label>
                <select
                  value={pageCount}
                  onChange={(e) => setPageCount(Number(e.target.value))}
                  className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  {[3, 4, 5, 6, 7, 8].map((n) => (
                    <option key={n} value={n}>
                      {n} pages
                    </option>
                  ))}
                </select>
              </div>

              <button
                onClick={handleGenerateStory}
                disabled={loading || !concept.trim()}
                className="mt-6 w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold py-3 px-6 rounded-xl hover:from-purple-700 hover:to-pink-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {loading ? "Generating..." : "Generate Story"}
              </button>
            </div>

            {/* Examples */}
            <div className="mt-6">
              <p className="text-sm text-gray-500 mb-3">Try these concepts:</p>
              <div className="flex flex-wrap gap-2">
                {[
                  "A little rabbit travels to the moon",
                  "A brave cat saves the enchanted forest",
                  "A girl discovers a door to a candy world",
                  "A robot learns to paint",
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

              <button
                onClick={handleGenerateAll}
                disabled={loading}
                className="mt-6 w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold py-3 px-6 rounded-xl hover:from-purple-700 hover:to-pink-700 disabled:opacity-50 transition-all"
              >
                {loading ? "Generating..." : "Generate Animated Book"}
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
                      {idx < images.length ? (
                        <span className="text-green-600 text-sm">
                          {idx < videos.length ? "Video done" : "Image done"}
                        </span>
                      ) : idx === images.length ? (
                        <span className="text-blue-600 text-sm animate-pulse">
                          Generating...
                        </span>
                      ) : (
                        <span className="text-gray-300 text-sm">Waiting</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Show images as they're generated */}
            {images.length > 0 && (
              <div className="mt-6">
                <h3 className="text-lg font-semibold mb-3">Generated Images</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {images.map((url, idx) => (
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

        {/* Step 4: Result */}
        {step === "result" && story && (
          <div>
            <div className="bg-white rounded-2xl shadow-lg p-8 mb-6">
              <h2 className="text-2xl font-bold mb-1">{story.title}</h2>
              <p className="text-gray-500 mb-6">
                Theme: {story.theme} | {videos.length > 0 ? "Animated" : "Illustrated"}{" "}
                Picture Book
              </p>

              {/* Videos */}
              {videos.length > 0 && (
                <div className="space-y-4 mb-6">
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
              )}

              {/* Images only (if videos failed) */}
              {videos.length === 0 && images.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                  {images.map((url, idx) => (
                    <div key={idx} className="bg-gray-50 rounded-xl overflow-hidden">
                      <img
                        src={url}
                        alt={`Page ${idx + 1}`}
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
              )}

              <button
                onClick={handleReset}
                className="w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold py-3 px-6 rounded-xl hover:from-purple-700 hover:to-pink-700 transition-all"
              >
                Create Another Story
              </button>
            </div>
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
