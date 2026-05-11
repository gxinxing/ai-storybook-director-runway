# 🚀 Vercel Deployment Guide

## Option 1: Deploy via GitHub (Recommended)

### Step 1: Push to GitHub ✅
Already completed! Your code is on GitHub:
- Repository: https://github.com/gxinxing/ai-storybook-director-runway
- Latest commit: `d232d09` - feat: Complete animated storybook with music, subtitles, and TTS

### Step 2: Connect to Vercel

1. **Go to Vercel Dashboard**
   - Visit: https://vercel.com/dashboard
   - Sign in with your GitHub account

2. **Create New Project**
   - Click "Add New..." → "Project"
   - Find your repository: `gxinxing/ai-storybook-director-runway`
   - Click "Import"

3. **Configure Project**
   - Framework Preset: Next.js (auto-detected)
   - Root Directory: `./` (or `ai-storybook-director`)
   - Build Command: `npm run build` (auto-detected)
   - Output Directory: `.next` (auto-detected)

4. **Add Environment Variables** ⭐ IMPORTANT
   Click "Environment Variables" and add:

   | Name | Value | Environment |
   |------|-------|-------------|
   | `RUNWAY_API_KEY` | `your_runway_api_key` | Production ✅ |
   | `DEEPSEEK_API_KEY` | `your_deepseek_api_key` | Production ✅ |
   | `LLM_PROVIDER` | `deepseek` | Production ✅ |
   | `OPENAI_API_KEY` | (optional) | Production ✅ |
   | `ANTHROPIC_API_KEY` | (optional) | Production ✅ |

   ⚠️ **IMPORTANT**: Make sure to check ✅ "Production" for all variables!

5. **Deploy**
   - Click "Deploy"
   - Wait for build to complete (2-3 minutes)
   - Get your URL: `https://your-project.vercel.app`

### Step 3: Configure Domain (Optional)
- In project settings, you can add custom domain
- Vercel provides free `.vercel.app` subdomain

---

## Option 2: Deploy via Vercel CLI

### Prerequisites
```bash
npm install -g vercel
```

### Steps

1. **Login to Vercel**
```bash
vercel login
```

2. **Navigate to project**
```bash
cd ai-storybook-director
```

3. **Deploy to preview**
```bash
vercel
```

4. **Deploy to production**
```bash
vercel --prod
```

5. **Set environment variables**
```bash
vercel env add RUNWAY_API_KEY
vercel env add DEEPSEEK_API_KEY
```

---

## ⚠️ Important Notes

### API Keys
- **DO NOT** commit API keys to GitHub
- Use Vercel environment variables
- Keep keys secret!

### Build Timeout
The FFmpeg loading and video generation can take time. 
Configured in vercel.json:
```json
"functions": {
  "app/api/**/*.ts": {
    "maxDuration": 600
  }
}
```

### COEP/COOP Headers
Already configured for FFmpeg.wasm:
```json
"headers": [
  {
    "source": "/:path((?!api/).*)",
    "headers": [
      { "key": "Cross-Origin-Embedder-Policy", "value": "credentialless" },
      { "key": "Cross-Origin-Opener-Policy", "value": "same-origin" }
    ]
  }
]
```

### Browser Compatibility
- Chrome/Edge: ✅ Full support
- Safari: ⚠️ May have issues with FFmpeg.wasm
- Firefox: ⚠️ May have issues with FFmpeg.wasm
- Mobile: ⚠️ Limited support

---

## 🔧 Troubleshooting

### Build Fails
- Check environment variables are set
- Verify `RUNWAY_API_KEY` is valid
- Check Vercel build logs

### Runtime Errors
- Check browser console
- Verify API keys have credits
- Ensure CORS headers are set

### Video Generation Timeout
- Increase `maxDuration` in vercel.json
- Reduce number of pages (try 3 instead of 5)

### FFmpeg Not Loading
- Ensure COEP/COOP headers are set
- Try in Chrome browser
- Check browser console for errors

---

## 📊 Monitoring

### Vercel Analytics
- Enable in project settings
- Monitor:
  - Page views
  - Performance metrics
  - Error rates

### API Usage
- Runway: https://app.runwayml.com/
- DeepSeek: https://platform.deepseek.com/

---

## 🎯 Next Steps After Deployment

1. **Test the deployed app**
   - Visit your Vercel URL
   - Try generating a story
   - Verify all features work

2. **Share your project**
   - Share the Vercel URL
   - Submit to Hackathon

3. **Monitor usage**
   - Check API credits regularly
   - Monitor for errors

---

## 💡 Pro Tips

1. **Start with 2-3 pages** for testing to save API credits
2. **Use auto-select music** for fastest setup
3. **Test in Chrome** for best FFmpeg compatibility
4. **Monitor API quotas** to avoid running out of credits
5. **Keep .env.local local** - never commit real API keys!

---

## 📞 Support

- Vercel Docs: https://vercel.com/docs
- Runway API: https://docs.dev.runwayml.com/
- DeepSeek: https://platform.deepseek.com/docs

---

**Happy Deploying! 🚀**
