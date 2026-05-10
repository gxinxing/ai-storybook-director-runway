export interface StoryPage {
  page: number;
  narration: string;
  scene_description: string;
  emotion: string;
}

export interface Story {
  title: string;
  hook: string;
  theme: string;
  pages: StoryPage[];
}

type LLMProvider = "deepseek" | "openai" | "claude";

function buildStoryPrompt(concept: string, pageCount: number): string {
  return `You are a world-class children's storybook writer and visual director.

Given the concept: "${concept}"

Create a ${pageCount}-page children's picture book story with these elements:
- Hook: An attention-grabbing opening
- Theme: A meaningful underlying message
- Plot: A clear beginning, middle, and end
- Twist: An unexpected but delightful turn

For EACH page, provide:
1. narration: The story text for this page (1-2 sentences, child-friendly)
2. scene_description: A detailed visual description for AI image generation
   - MUST include art style: children's picture book illustration, watercolor style, soft colors, warm lighting
   - Describe characters, setting, action, mood
   - Keep consistent character descriptions across pages
3. emotion: The emotional tone (e.g., wonder, joy, surprise, courage)

IMPORTANT: Keep character appearance CONSISTENT across all pages.
IMPORTANT: scene_description must be in ENGLISH for image generation.
IMPORTANT: narration can be in the same language as the concept.
IMPORTANT: Return ONLY valid JSON, no markdown, no code blocks.

Return ONLY valid JSON in this exact format:
{
  "title": "string",
  "hook": "string",
  "theme": "string",
  "pages": [
    { "page": 1, "narration": "string", "scene_description": "string", "emotion": "string" }
  ]
}`;
}

async function callDeepSeek(prompt: string): Promise<Story> {
  const res = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.9,
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`DeepSeek API error: ${res.status} - ${error}`);
  }

  const data = await res.json();
  const content = data.choices[0].message.content;
  return JSON.parse(content) as Story;
}

async function callOpenAI(prompt: string): Promise<Story> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.9,
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`OpenAI API error: ${res.status} - ${error}`);
  }

  const data = await res.json();
  const content = data.choices[0].message.content;
  return JSON.parse(content) as Story;
}

async function callClaude(prompt: string): Promise<Story> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY || "",
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Claude API error: ${res.status} - ${error}`);
  }

  const data = await res.json();
  const content = data.content[0].text;
  // Claude might wrap JSON in markdown code blocks
  const jsonStr = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  return JSON.parse(jsonStr) as Story;
}

export async function generateStory(
  concept: string,
  pageCount: number = 5
): Promise<Story> {
  const provider = (process.env.LLM_PROVIDER || "deepseek") as LLMProvider;
  const prompt = buildStoryPrompt(concept, pageCount);

  switch (provider) {
    case "openai":
      return callOpenAI(prompt);
    case "claude":
      return callClaude(prompt);
    case "deepseek":
    default:
      return callDeepSeek(prompt);
  }
}
