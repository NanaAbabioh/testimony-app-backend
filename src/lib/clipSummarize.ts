import { Clip } from "./types";

const PROVIDER = process.env.ANTHROPIC_API_KEY ? "anthropic" : (process.env.OPENAI_API_KEY ? "openai" : "none");

function buildPrompt(transcript: string, categoryHint?: string) {
  return `You write ultra-brief clip summaries for church testimonies.

GOAL:
- Produce TWO outputs:
  1) titleShort: 3–7 words, headline style, Capitalize Each Word.
  2) summaryShort: ONE sentence, ≤ 28 words, present tense, mention the unique angle (timeframe, method, obstacle, location, "point of contact", etc.).

RULES:
- No emojis. No scripture quotes. Neutral tone.
- Avoid repeating the category word unless it adds clarity.
- Prefer specifics: numbers/durations ("10 years", "2 days"), means ("point of contact", "fasting", "prophetic instruction"), obstacles ("visa refusals", "medical diagnosis").
- If transcript is thin/noisy, still give your best single sentence.

Return JSON: {"titleShort":"...","summaryShort":"..."}

TRANSCRIPT (trimmed):
${transcript.slice(0, 4000)}
CATEGORY HINT: ${categoryHint || "unknown"}
`;
}

export async function summarizeClip({ transcript = "", categoryId }: { transcript?: string; categoryId?: string; }) {
  if (!transcript.trim()) {
    return { titleShort: undefined, summaryShort: undefined };
  }

  const prompt = buildPrompt(transcript, categoryId);

  if (PROVIDER === "anthropic") {
    const { Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
    const msg = await client.messages.create({
      model: "claude-3-5-sonnet-20240620",
      max_tokens: 200,
      temperature: 0.3,
      messages: [{ role: "user", content: prompt }],
    } as any);
    const text = (msg as any).content?.[0]?.text ?? "";
    return safeParse(text);
  }

  if (PROVIDER === "openai") {
    const OpenAI = (await import("openai")).default;
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      max_tokens: 200,
      messages: [{ role: "user", content: prompt }],
    });
    const text = resp.choices?.[0]?.message?.content || "";
    return safeParse(text);
  }

  // no provider set
  return { titleShort: undefined, summaryShort: undefined };
}

function safeParse(s: string) {
  try {
    const m = s.match(/\{[\s\S]*\}/);
    const json = JSON.parse(m ? m[0] : s);
    return {
      titleShort: clampWords(json.titleShort, 3, 9),
      summaryShort: clampWords(json.summaryShort, 6, 28, true),
    };
  } catch {
    return { titleShort: undefined, summaryShort: undefined };
  }
}

function clampWords(str: string, min: number, max: number, endWithPeriod = false) {
  if (!str) return undefined;
  const words = str.replace(/\s+/g, " ").trim().split(" ");
  const clipped = words.slice(0, max).join(" ");
  const fixed = clipped.replace(/\s+/g, " ").trim();
  if (endWithPeriod && !/[.!?]$/.test(fixed)) return fixed + ".";
  return fixed;
}