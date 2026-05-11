"use client";

import { useState, useEffect } from "react";

interface MusicTrack {
  id: string;
  name: string;
  description: string;
  mood: string;
  url: string;
}

interface MusicSelectorProps {
  selected: MusicTrack | null;
  onSelect: (track: MusicTrack | null) => void;
  storyTheme?: string;
}

const musicOptions: MusicTrack[] = [
  {
    id: "auto",
    name: "🎵 Auto Select",
    description: "根据故事主题自动选择最佳音乐",
    mood: "auto",
    url: ""
  },
  {
    id: "peaceful-piano",
    name: "🎹 Peaceful Piano",
    description: "轻柔的钢琴音乐，适合温馨故事",
    mood: "温馨",
    url: "https://cdn.pixabay.com/audio/2022/08/30/audio_884fe92c21.mp3"
  },
  {
    id: "gentle-melody",
    name: "🎶 Gentle Melody",
    description: "柔和的旋律，营造温暖氛围",
    mood: "温暖",
    url: "https://cdn.pixabay.com/audio/2021/08/09/audio_dc39bcc8c3.mp3"
  },
  {
    id: "happy-ukulele",
    name: "🪕 Happy Ukulele",
    description: "欢快的尤克里里，充满童趣",
    mood: "欢快",
    url: "https://cdn.pixabay.com/audio/2022/05/27/audio_1808fbf07a.mp3"
  },
  {
    id: "soft-magic",
    name: "✨ Soft Magic",
    description: "梦幻轻柔的音乐，适合魔法故事",
    mood: "梦幻",
    url: "https://cdn.pixabay.com/audio/2022/10/25/audio_052689915f.mp3"
  },
  {
    id: "adventure-theme",
    name: "🚀 Adventure Theme",
    description: "冒险主题音乐，充满探索精神",
    mood: "冒险",
    url: "https://cdn.pixabay.com/audio/2022/03/15/audio_115b9b6f82.mp3"
  },
  {
    id: "sad-story",
    name: "🎭 Emotional Piano",
    description: "情感丰富的钢琴曲，适合感人故事",
    mood: "感人",
    url: "https://cdn.pixabay.com/audio/2022/03/10/audio_4dedf5d0d3.mp3"
  },
  {
    id: "lullaby-dreams",
    name: "🌙 Lullaby Dreams",
    description: "摇篮曲风格，适合睡前故事",
    mood: "睡前",
    url: "https://cdn.pixabay.com/audio/2022/08/02/audio_884fe92c21.mp3"
  },
  {
    id: "cute-animals",
    name: "🐰 Cute Animals",
    description: "可爱动物主题，轻快活泼",
    mood: "可爱",
    url: "https://cdn.pixabay.com/audio/2023/07/30/audio_a4bad30ec3.mp3"
  },
  {
    id: "space-exploration",
    name: "🌌 Space Exploration",
    description: "太空探索主题，科幻感强",
    mood: "科幻",
    url: "https://cdn.pixabay.com/audio/2024/01/08/audio_5f43bcc8c3.mp3"
  }
];

export default function MusicSelector({ selected, onSelect, storyTheme }: MusicSelectorProps) {
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
      }
    };
  }, [audio]);

  const handlePlayPreview = (track: MusicTrack) => {
    if (!track.url) {
      alert("Auto Select 模式下将根据故事主题自动选择音乐");
      return;
    }

    if (playingId === track.id) {
      audio?.pause();
      setPlayingId(null);
    } else {
      if (audio) {
        audio.pause();
      }
      const newAudio = new Audio(track.url);
      newAudio.volume = 0.3;
      newAudio.play().catch(console.error);
      newAudio.onended = () => setPlayingId(null);
      setAudio(newAudio);
      setPlayingId(track.id);
    }
  };

  const handleSelect = (track: MusicTrack) => {
    if (track.id === "auto") {
      onSelect(null);
    } else {
      onSelect(track);
    }
  };

  const isSelected = (track: MusicTrack) => {
    if (track.id === "auto") {
      return selected === null;
    }
    return selected?.id === track.id;
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {musicOptions.map((track) => (
          <div
            key={track.id}
            className={`
              relative p-4 rounded-xl border-2 cursor-pointer transition-all
              ${isSelected(track)
                ? "border-purple-600 bg-purple-50"
                : "border-gray-200 hover:border-purple-300 hover:bg-gray-50"
              }
            `}
            onClick={() => handleSelect(track)}
          >
            {isSelected(track) && (
              <div className="absolute top-2 right-2 w-5 h-5 bg-purple-600 rounded-full flex items-center justify-center">
                <span className="text-white text-xs">✓</span>
              </div>
            )}
            
            <div className="flex items-start gap-3">
              <button
                className={`
                  w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0
                  ${playingId === track.id
                    ? "bg-purple-600 text-white"
                    : "bg-gray-200 text-gray-600 hover:bg-purple-600 hover:text-white"
                  }
                `}
                onClick={(e) => {
                  e.stopPropagation();
                  handlePlayPreview(track);
                }}
              >
                {playingId === track.id ? "⏸" : "▶"}
              </button>
              
              <div className="flex-1 min-w-0">
                <h4 className="font-medium text-sm text-gray-900">
                  {track.name}
                </h4>
                <p className="text-xs text-gray-500 mt-1">
                  {track.description}
                </p>
                <span className="inline-block mt-2 text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
                  {track.mood}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {selected && selected.id !== "auto" && (
        <div className="mt-4 p-4 bg-purple-50 rounded-xl border border-purple-200">
          <p className="text-sm text-purple-700">
            <strong>Selected:</strong> {selected.name} - {selected.description}
          </p>
          <p className="text-xs text-purple-500 mt-1">
            音乐将以 30% 音量与原视频音频混合
          </p>
        </div>
      )}

      {!selected && (
        <div className="mt-4 p-4 bg-blue-50 rounded-xl border border-blue-200">
          <p className="text-sm text-blue-700">
            <strong>Auto Select Mode</strong> - 将根据故事主题自动选择最合适的背景音乐
          </p>
          {storyTheme && (
            <p className="text-xs text-blue-500 mt-1">
              Detected theme: {storyTheme}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
