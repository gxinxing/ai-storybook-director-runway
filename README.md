# 🎬 AI Storybook Director

Transform stories into animated picture books with AI! This application uses DeepSeek LLM for story generation and Runway API for video/image generation, creating complete animated storybooks with subtitles, voice narration, and background music.

## ✨ Features

- **🤖 AI Story Generation** - Generate complete story structures with DeepSeek LLM
- **🎨 Image Generation** - Create illustrations using Runway's Gen4 Image model
- **🎬 Video Generation** - Animate images into videos with Runway's Gen3a Turbo
- **🎤 Voice Narration** - Automatic TTS narration for each page
- **🎵 Background Music** - Choose from 10 music tracks or auto-select based on story theme
- **📝 Subtitles** - Automatic subtitle generation for each page
- **🔗 Video Merging** - Combine all clips into a complete animated storybook
- **📱 Responsive Design** - Works on desktop and mobile devices

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ 
- npm or yarn
- [Runway API Key](https://app.runwayml.com/)
- [DeepSeek API Key](https://platform.deepseek.com/)

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/gxinxing/ai-storybook-director-runway.git
cd ai-storybook-director-runway
```

2. **Install dependencies**
```bash
npm install
```

3. **Configure environment variables**
```bash
cp .env.example .env.local
```

Edit `.env.local` and add your API keys:
```env
RUNWAY_API_KEY=your_runway_api_key
DEEPSEEK_API_KEY=your_deepseek_api_key
```

4. **Start the development server**
```bash
npm run dev
```

5. **Open your browser**
Navigate to [http://localhost:3000](http://localhost:3000)

## 🎯 Usage

1. **Enter a story concept** - Describe the story you want to create
2. **Customize settings** - Select art style, page count, target age
3. **Generate story** - AI creates the story structure
4. **Preview and edit** - Review the generated story
5. **Select background music** - Choose from 10 tracks or use auto-select
6. **Generate animated storybook** - Watch as AI creates:
   - 📖 Story text with narration
   - 🎨 Illustrations for each page
   - 🎬 Animated video clips
   - 🎤 Voice narration (TTS)
   - 🎵 Background music
   - 📝 Subtitles
7. **Download** - Get your complete animated storybook as MP4

## 🎨 Supported Art Styles

- **Watercolor** - Soft, children's picture book style
- **3D** - Pixar-like, vibrant 3D rendered animation
- **Ink** - Chinese ink wash painting (sumi-e)
- **Pixel** - Retro pixel art, 16-bit aesthetic

## 🎵 Background Music Tracks

1. **Auto Select** - Intelligent selection based on story theme
2. **Peaceful Piano** - Gentle piano for warm stories
3. **Gentle Melody** - Soft melody for cozy atmospheres
4. **Happy Ukulele** - Cheerful, childlike vibes
5. **Soft Magic** - Dreamy, magical stories
6. **Adventure Theme** - Exploratory, adventurous tales
7. **Emotional Piano** - Touching, emotional stories
8. **Lullaby Dreams** - Bedtime stories
9. **Cute Animals** - Animal-themed, playful content
10. **Space Exploration** - Sci-fi, cosmic adventures

## 🔧 Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Styling**: Tailwind CSS
- **AI Services**: 
  - DeepSeek (Story Generation)
  - Runway ML (Image & Video Generation)
- **Video Processing**: FFmpeg.wasm
- **State Management**: React Hooks
- **Deployment**: Vercel-ready

## 📁 Project Structure

```
├── app/
│   ├── api/
│   │   ├── background-music/    # Music selection API
│   │   ├── generate-audio/      # TTS generation
│   │   ├── generate-image/      # Image generation
│   │   ├── generate-story/       # Story generation
│   │   ├── generate-video/      # Video generation
│   │   └── task-status/         # Task status checking
│   ├── components/
│   │   ├── Composer.tsx         # Main input component
│   │   └── MusicSelector.tsx    # Music selection UI
│   ├── page.tsx                 # Main page
│   └── layout.tsx               # App layout
├── lib/
│   ├── llm.ts                   # LLM integration
│   ├── runway.ts                 # Runway API client
│   └── video-merge.ts           # FFmpeg video processing
└── public/                      # Static assets
```

## 🚢 Deployment

### Vercel (Recommended)

1. **Push to GitHub**
```bash
git add .
git commit -m "Your commit message"
git push origin main
```

2. **Connect to Vercel**
   - Go to [vercel.com](https://vercel.com)
   - Click "New Project"
   - Import your GitHub repository
   - Add environment variables in Vercel dashboard:
     - `RUNWAY_API_KEY`
     - `DEEPSEEK_API_KEY`
     - `LLM_PROVIDER` (optional)

3. **Deploy**
   - Vercel will automatically detect Next.js
   - Click "Deploy"
   - Your app will be live at `your-project.vercel.app`

### Manual Deployment

```bash
npm run build
npm start
```

## ⚙️ Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `RUNWAY_API_KEY` | Runway API authentication | ✅ Yes |
| `DEEPSEEK_API_KEY` | DeepSeek API key | ✅ Yes |
| `LLM_PROVIDER` | LLM provider: `deepseek`, `openai`, or `claude` | No (default: deepseek) |
| `OPENAI_API_KEY` | OpenAI API key (backup) | No |
| `ANTHROPIC_API_KEY` | Claude API key (backup) | No |

## 🎓 API Documentation

### Generate Story
```http
POST /api/generate-story
Content-Type: application/json

{
  "concept": "A little rabbit looking for its mother on the moon",
  "pageCount": 5,
  "style": "Watercolor",
  "age": "3-6",
  "lang": "中文"
}
```

### Generate Image
```http
POST /api/generate-image
Content-Type: application/json

{
  "sceneDescription": "A cute white rabbit sitting on a crescent moon",
  "styleHint": "children's picture book, watercolor, soft colors"
}
```

### Generate Video
```http
POST /api/generate-video
Content-Type: application/json

{
  "imageUrl": "https://example.com/image.png",
  "prompt": "A cute rabbit hopping on the moon"
}
```

## 🐛 Troubleshooting

### Common Issues

**500 Error on Generation**
- Check API keys are correctly configured
- Verify Runway API credits are sufficient
- Check DeepSeek API quota

**Video Merge Fails**
- Ensure browser supports WebAssembly
- Check COOP/COEP headers are configured
- Try in Chrome/Edge for best compatibility

**No Audio in Final Video**
- Background music URLs may be blocked by CORS
- Check browser console for errors
- Try refreshing the page

## 📄 License

MIT License - feel free to use this project for learning and development.

## 🙏 Acknowledgments

- [Runway ML](https://runwayml.com/) - For providing the amazing Gen3 video generation API
- [DeepSeek](https://deepseek.com/) - For powering story generation
- [Next.js](https://nextjs.org/) - For the excellent React framework
- [FFmpeg](https://ffmpeg.org/) - For video processing capabilities

---

Built with ❤️ for the Runway 2026 API Hackathon
