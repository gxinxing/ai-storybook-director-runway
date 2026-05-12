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

  return `You are a world-class AI Video Prompt Engineer, Story Director, and Intent Classifier.

Given the user's raw concept: "${concept}"${attachmentContext}${ageHint}${langHint}

Your task is to act as an intelligent agent that transforms this raw, sometimes vague input into a highly structured, emotionally resonant ${pageCount}-page storyboard optimized for AI video generation (Runway Gen-3).

Create the storyboard with these elements:
- Hook: An attention-grabbing opening
- Theme: A meaningful underlying message
- Plot: A clear beginning, middle, and end
- Twist: An unexpected but delightful turn

For EACH page, provide:
1. narration: The story text for this page (1-2 sentences)
2. scene_description: The enhanced, structured prompt for the AI generation API.
   - Translate vague ideas into concrete cinematic language.
   - MUST include: Subject details + Environment + Lighting (e.g., volumetric lighting, soft fill) + Camera Shot (e.g., wide establishing shot, dolly in, close-up) + Color Palette.
   - Emphasize the art style: ${settings?.style ? settings.style : "children's picture book illustration"}
   - Keep it comma-separated, professional, and entirely in ENGLISH.
3. emotion: The emotional tone (e.g., wonder, joy, surprise, courage)

CRITICAL: EXTREMELY IMPORTANT - MAINTAIN ABSOLUTE CHARACTER CONSISTENCY ACROSS ALL PAGES!

SPECIAL INSTRUCTIONS FOR CHARACTER CONSISTENCY:
1. On PAGE 1 ONLY: Define a MAIN CHARACTER with FULL DETAILED DESCRIPTION (name, age, gender, hair color/style, eye color, clothing, accessories, unique features, body type, height, distinctive marks, etc.) in the scene_description.
2. On ALL SUBSEQUENT PAGES (2+): EXPLICITLY REFERENCE and REUSE the EXACT SAME character description from page 1. DO NOT change any details.
3. The main character MUST look EXACTLY the same in EVERY single page - same hair, same clothes, same face, same everything.
4. In scene_description for EVERY page, ALWAYS start with the character description, THEN describe the scene/environment/camera details.

Example Page 1 format: "character: [full detailed character description], [environment, [lighting], [camera shot], [color palette]"
Example Page 2+ format: "same character as page 1: [brief reminder of key features], [environment change], [lighting], [camera shot], [color palette]"
"

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
  if (!content || typeof content !== "string") {
    throw new Error(`Invalid response content: expected string, got ${typeof content}`);
  }

  const trimmed = content.trim();
  if (!trimmed) {
    throw new Error("LLM response is empty");
  }

  try {
    const data = JSON.parse(trimmed);
    return validateStory(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const msg2 = `LLM response parse error: ${msg}`;

    try {
      const cleaned = trimmed.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      if (cleaned !== trimmed) {
        const data2 = JSON.parse(cleaned);
        return validateStory(data2);
      }
    } catch {
      throw new Error(`${msg2}\nRaw content: ${trimmed.substring(0, 500)}`);
    }

    throw new Error(`${msg2}\nRaw content: ${trimmed.substring(0, 500)}`);
  }
}

async function callDeepSeek(prompt: string): Promise<Story> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error("DeepSeek API key is not configured - Please check your .env.local file");
  }

  const res = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
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
    const status = res.status;
    let errorMsg = `DeepSeek API error (${status}): ${error}`;

    if (status === 401) {
      errorMsg = `DeepSeek API authentication failed (401): Invalid API key - Please check your .env.local file`;
    } else if (status === 429) {
      errorMsg = `DeepSeek API rate limit exceeded (429): Please try again later`;
    } else if (status >= 500) {
      errorMsg = `DeepSeek API server error (${status}): ${error}`;
    }

    throw new Error(errorMsg);
  }

  const data = await res.json();

  if (!data.choices || !Array.isArray(data.choices) || data.choices.length === 0) {
    throw new Error(`DeepSeek API returned unexpected format: ${JSON.stringify(data).substring(0, 200)}`);
  }

  if (!data.choices[0] || !data.choices[0].message || typeof data.choices[0].message.content !== "string") {
    throw new Error(`DeepSeek API response missing expected fields: ${JSON.stringify(data).substring(0, 200)}`);
  }

  const content = data.choices[0].message.content;
  return parseStoryResponse(content);
}

async function callOpenAI(prompt: string): Promise<Story> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OpenAI API key is not configured - Please check your .env.local file");
  }

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
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
    const status = res.status;
    let errorMsg = `OpenAI API error (${status}): ${error}`;

    if (status === 401) {
      errorMsg = `OpenAI API authentication failed (401): Invalid API key - Please check your .env.local file`;
    } else if (status === 429) {
      errorMsg = `OpenAI API rate limit exceeded (429): Please try again later`;
    } else if (status >= 500) {
      errorMsg = `OpenAI API server error (${status}): ${error}`;
    }

    throw new Error(errorMsg);
  }

  const data = await res.json();

  if (!data.choices || !Array.isArray(data.choices) || data.choices.length === 0) {
    throw new Error(`OpenAI API returned unexpected format: ${JSON.stringify(data).substring(0, 200)}`);
  }

  if (!data.choices[0] || !data.choices[0].message || typeof data.choices[0].message.content !== "string") {
    throw new Error(`OpenAI API response missing expected fields: ${JSON.stringify(data).substring(0, 200)}`);
  }

  const content = data.choices[0].message.content;
  return parseStoryResponse(content);
}

async function callClaude(prompt: string): Promise<Story> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("Anthropic API key is not configured - Please check your .env.local file");
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
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
    const status = res.status;
    let errorMsg = `Claude API error (${status}): ${error}`;

    if (status === 401) {
      errorMsg = `Claude API authentication failed (401): Invalid API key - Please check your .env.local file`;
    } else if (status === 429) {
      errorMsg = `Claude API rate limit exceeded (429): Please try again later`;
    } else if (status >= 500) {
      errorMsg = `Claude API server error (${status}): ${error}`;
    }

    throw new Error(errorMsg);
  }

  const data = await res.json();

  if (!data.content || !Array.isArray(data.content) || data.content.length === 0) {
    throw new Error(`Claude API returned unexpected format: ${JSON.stringify(data).substring(0, 200)}`);
  }

  if (!data.content[0] || !data.content[0].text || typeof data.content[0].text !== "string") {
    throw new Error(`Claude API response missing expected fields: ${JSON.stringify(data).substring(0, 200)}`);
  }

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

/**
 * Refine an existing scene description based on user natural language feedback
 */
export async function refineScenePrompt(
  originalPrompt: string,
  userInstruction: string
): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error("DeepSeek API key is not configured.");
  }

  const systemPrompt = `You are an expert AI Video Prompt Engineer.
The user wants to modify an existing scene prompt based on their feedback.

Original Prompt: "${originalPrompt}"
User Feedback: "${userInstruction}"

Task:
1. Understand the user's intent (e.g., "too dark" means add bright lighting, "make it panning" means add camera pan).
2. Rewrite the Original Prompt to incorporate these changes.
3. Keep it as a comma-separated list of visual keywords in ENGLISH.
4. Do NOT output markdown, conversational text, or explanations.

Return ONLY a JSON object in this exact format:
{"refined_prompt": "the new complete prompt..."}`;

  const res = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [{ role: "user", content: systemPrompt }],
      temperature: 0.7,
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    throw new Error(`Failed to refine prompt: ${await res.text()}`);
  }

  const data = await res.json();
  const content = data.choices[0]?.message?.content;
  if (!content) throw new Error("Invalid response from LLM");

  const parsed = JSON.parse(content);
  return parsed.refined_prompt || originalPrompt;
}
