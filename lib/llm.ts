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

function buildStoryPrompt(
  concept: string,
  pageCount: number,
  attachments?: Array<{ type: string; name: string }>,
  settings?: { style?: string; age?: string; lang?: string }
): string {
  let attachmentContext = "";
  if (attachments && attachments.length > 0) {
    const parts = attachments.map((a) => {
      const labels: Record<string, string> = {
        character: "角色参考",
        style: "画风参考",
        scene: "场景参考",
        text: "故事文本",
      };
      return `- ${labels[a.type] || a.type}: ${a.name}`;
    });
    attachmentContext = `\n\nThe user has provided the following reference materials:\n${parts.join("\n")}\nTake these references into account when designing characters, art style, scenes, and plot.`;
  }

  const styleHint = settings?.style ? ` Art style: ${settings.style} illustration.` : "";
  const ageHint = settings?.age ? ` Target age: ${settings.age} years old.` : "";
  const langHint = settings?.lang ? ` Write narration in ${settings.lang}.` : "";

  return `You are a world-class children's storybook writer and visual director.

Given the concept: "${concept}"${attachmentContext}${ageHint}${langHint}

Create a ${pageCount}-page children's picture book story with these elements:
- Hook: An attention-grabbing opening
- Theme: A meaningful underlying message
- Plot: A clear beginning, middle, and end
- Twist: An unexpected but delightful turn

For EACH page, provide:
1. narration: The story text for this page (1-2 sentences, child-friendly)
2. scene_description: A detailed visual description for AI image generation
   - MUST include art style: children's picture book illustration,${styleHint} soft colors, warm lighting
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

/**
 * Validate that the parsed JSON matches the Story interface
 */
function validateStory(data: unknown): Story {
  if (!data || typeof data !== "object") {
    throw new Error("LLM response is not a valid object");
  }
  const obj = data as Record<string, unknown>;
  if (typeof obj.title !== "string" || obj.title.trim().length === 0) {
    throw new Error("LLM response missing 'title'");
  }
  if (!Array.isArray(obj.pages) || obj.pages.length === 0) {
    throw new Error("LLM response missing 'pages' array");
  }
  const pages = (obj.pages as unknown[]).map((p, i) => {
    const page = p as Record<string, unknown>;
    if (typeof page.narration !== "string" || typeof page.scene_description !== "string") {
      throw new Error(`Page ${i + 1} missing required fields (narration, scene_description)`);
    }
    return {
      page: i + 1,
      narration: page.narration as string,
      scene_description: page.scene_description as string,
      emotion: (typeof page.emotion === "string" ? page.emotion : "neutral") as string,
    };
  });
  return {
    title: obj.title as string,
    hook: (typeof obj.hook === "string" ? obj.hook : "") as string,
    theme: (typeof obj.theme === "string" ? obj.theme : "") as string,
    pages,
  };
}

function parseStoryResponse(content: string): Story {
  // Try direct parse first
  try {
    const data = JSON.parse(content);
    return validateStory(data);
  } catch {
    // Try stripping markdown code blocks (Claude sometimes wraps in ```json)
    const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    try {
      const data = JSON.parse(cleaned);
      return validateStory(data);
    } catch {
      throw new Error("LLM response is not valid JSON or missing required fields");
    }
  }
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
  return parseStoryResponse(content);
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
  return parseStoryResponse(content);
}

async function callClaude(prompt: string): Promise<Story> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY || "",
      "anthropic-version": "2023-06-01",
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
  return parseStoryResponse(content);
}

export async function generateStory(
  concept: string,
  pageCount: number = 5,
  attachments?: Array<{ type: string; name: string }>,
  settings?: { style?: string; age?: string; lang?: string }
): Promise<Story> {
  const provider = (process.env.LLM_PROVIDER || "deepseek") as LLMProvider;
  const prompt = buildStoryPrompt(concept, pageCount, attachments, settings);

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
