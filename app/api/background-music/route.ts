import { NextRequest, NextResponse } from "next/server";

interface MusicTrack {
  id: string;
  name: string;
  description: string;
  mood: string;
  url: string;
}

const backgroundMusic: MusicTrack[] = [
  {
    id: "peaceful-piano",
    name: "Peaceful Piano",
    description: "轻柔的钢琴音乐，适合温馨故事",
    mood: "温馨",
    url: "https://cdn.pixabay.com/audio/2022/08/30/audio_884fe92c21.mp3"
  },
  {
    id: "gentle-melody",
    name: "Gentle Melody",
    description: "柔和的旋律，营造温暖氛围",
    mood: "温暖",
    url: "https://cdn.pixabay.com/audio/2021/08/09/audio_dc39bcc8c3.mp3"
  },
  {
    id: "happy-ukulele",
    name: "Happy Ukulele",
    description: "欢快的尤克里里，充满童趣",
    mood: "欢快",
    url: "https://cdn.pixabay.com/audio/2022/05/27/audio_1808fbf07a.mp3"
  },
  {
    id: "soft-magic",
    name: "Soft Magic",
    description: "梦幻轻柔的音乐，适合魔法故事",
    mood: "梦幻",
    url: "https://cdn.pixabay.com/audio/2022/10/25/audio_052689915f.mp3"
  },
  {
    id: "adventure-theme",
    name: "Adventure Theme",
    description: "冒险主题音乐，充满探索精神",
    mood: "冒险",
    url: "https://cdn.pixabay.com/audio/2022/03/15/audio_115b9b6f82.mp3"
  },
  {
    id: "sad-story",
    name: "Emotional Piano",
    description: "情感丰富的钢琴曲，适合感人故事",
    mood: "感人",
    url: "https://cdn.pixabay.com/audio/2022/03/10/audio_4dedf5d0d3.mp3"
  },
  {
    id: "magical-forest",
    name: "Magical Forest",
    description: "奇幻森林风格，神秘而美丽",
    mood: "奇幻",
    url: "https://cdn.pixabay.com/audio/2024/02/14/audio_4dedf5d0d3.mp3"
  },
  {
    id: "lullaby-dreams",
    name: "Lullaby Dreams",
    description: "摇篮曲风格，适合睡前故事",
    mood: "睡前",
    url: "https://cdn.pixabay.com/audio/2022/08/02/audio_884fe92c21.mp3"
  },
  {
    id: "cute-animals",
    name: "Cute Animals",
    description: "可爱动物主题，轻快活泼",
    mood: "可爱",
    url: "https://cdn.pixabay.com/audio/2023/07/30/audio_a4bad30ec3.mp3"
  },
  {
    id: "space-exploration",
    name: "Space Exploration",
    description: "太空探索主题，科幻感强",
    mood: "科幻",
    url: "https://cdn.pixabay.com/audio/2024/01/08/audio_5f43bcc8c3.mp3"
  }
];

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const mood = searchParams.get("mood");
  const trackId = searchParams.get("id");

  if (trackId) {
    const track = backgroundMusic.find(t => t.id === trackId);
    if (!track) {
      return NextResponse.json(
        { error: "Music track not found" },
        { status: 404 }
      );
    }
    return NextResponse.json({ track });
  }

  if (mood) {
    const filtered = backgroundMusic.filter(t => 
      t.mood.includes(mood) || t.name.toLowerCase().includes(mood.toLowerCase())
    );
    return NextResponse.json({ tracks: filtered });
  }

  return NextResponse.json({
    tracks: backgroundMusic,
    total: backgroundMusic.length
  });
}

export async function POST(req: NextRequest) {
  try {
    const { text, mood, duration } = await req.json();

    let selectedTrack: MusicTrack;

    if (text && !mood) {
      const keywords = text.toLowerCase();
      if (keywords.includes("冒险") || keywords.includes("exploration")) {
        selectedTrack = backgroundMusic.find(t => t.mood === "冒险")!;
      } else if (keywords.includes("魔法") || keywords.includes("梦幻")) {
        selectedTrack = backgroundMusic.find(t => t.mood === "梦幻")!;
      } else if (keywords.includes("可爱") || keywords.includes("动物")) {
        selectedTrack = backgroundMusic.find(t => t.mood === "可爱")!;
      } else if (keywords.includes("太空") || keywords.includes("宇宙")) {
        selectedTrack = backgroundMusic.find(t => t.mood === "科幻")!;
      } else if (keywords.includes("睡前") || keywords.includes("睡觉")) {
        selectedTrack = backgroundMusic.find(t => t.mood === "睡前")!;
      } else if (keywords.includes("感人") || keywords.includes("悲伤")) {
        selectedTrack = backgroundMusic.find(t => t.mood === "感人")!;
      } else if (keywords.includes("温馨") || keywords.includes("温暖")) {
        selectedTrack = backgroundMusic.find(t => t.mood === "温馨")!;
      } else {
        selectedTrack = backgroundMusic[Math.floor(Math.random() * backgroundMusic.length)];
      }
    } else if (mood) {
      selectedTrack = backgroundMusic.find(t => t.mood === mood) || backgroundMusic[0];
    } else {
      selectedTrack = backgroundMusic[Math.floor(Math.random() * backgroundMusic.length)];
    }

    console.log(`[Background Music] Selected: ${selectedTrack.name} for ${text || mood || "auto"}`);

    return NextResponse.json({
      track: selectedTrack,
      message: `Selected "${selectedTrack.name}" - ${selectedTrack.description}`
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Background music selection error:", errorMessage);
    return NextResponse.json(
      { error: `Failed to select music: ${errorMessage}` },
      { status: 500 }
    );
  }
}
