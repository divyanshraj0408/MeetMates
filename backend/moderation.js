const axios = require("axios");

// Small explicit blocklist. Extend as needed. Matched with word boundaries
// (see BAD_WORD_RE) so innocent words containing a bad substring are not blocked.
const BAD_WORDS = [
  "bitch", "fuck", "shit", "asshole", "bastard", "slut", "whore",
  "nigger", "faggot", "retard", "cunt", "dick", "pussy", "rape",
];

// Normalize leet substitutions but PRESERVE spaces/punctuation so word
// boundaries survive (prevents "grape" matching "rape", "Scunthorpe" -> "cunt").
function normalize(text) {
  return String(text)
    .toLowerCase()
    .replace(/[@4]/g, "a")
    .replace(/[3]/g, "e")
    .replace(/[1!|]/g, "i")
    .replace(/[0]/g, "o")
    .replace(/[$5]/g, "s");
}

const BAD_WORD_RE = new RegExp(`\\b(${BAD_WORDS.join("|")})\\b`, "i");

function wordListHit(text) {
  return BAD_WORD_RE.test(normalize(text));
}

// The policy the classifier grades each message against. This is the lever
// that decides what the room blocks — widen or narrow it here, nowhere else.
// S4 is the judgement call: it blocks insults aimed at a person. Drop that
// line if ordinary trash-talk should be allowed to pass.
const MODERATION_POLICY = `You are a content moderation classifier for a college student chat room.
Classify the USER MESSAGE against this policy.

Unsafe categories:
S1 violence or threats
S2 sexual harassment or sexual content directed at a person
S3 hate speech or slurs targeting a protected group
S4 bullying, targeted abuse, or degrading insults aimed at a person
S5 self-harm encouragement
S6 sharing someone's private personal information

Reply with EXACTLY one line and nothing else:
safe
or
unsafe:<category code>

Do not explain. Do not reply to the message.`;

// Parse a classifier verdict. Accepts the current one-line form ("unsafe:S1")
// and the older two-line Llama Guard form ("unsafe\nS1").
//
// A reply that is neither "safe" nor "unsafe..." is marked malformed rather
// than treated as a pass: the classifier answers conversationally when the
// policy prompt is missing, and reading "I can't help with that" as safe is
// exactly how this gate failed silently before.
function parseGuardResponse(content) {
  const text = String(content || "").trim();
  const lower = text.toLowerCase();

  if (lower.startsWith("unsafe")) {
    // Everything after "unsafe" less any ":" or whitespace is the category.
    const category = text.slice("unsafe".length).replace(/[:\s]+/g, " ").trim();
    return { unsafe: true, category: category ? category.toUpperCase() : "unknown" };
  }

  if (lower.startsWith("safe")) {
    return { unsafe: false, category: null };
  }

  return { unsafe: false, category: null, malformed: true };
}

// Groq's llama-guard-4-12b was decommissioned (HTTP 400 model_decommissioned).
// gpt-oss-safeguard-20b replaces it, but it is a policy classifier rather than
// a bare guard: without a system prompt it answers conversationally.
const GROQ_MODEL = "openai/gpt-oss-safeguard-20b";

// Default Groq client — calls the classifier via the OpenAI-compatible endpoint.
// classify(text) -> { unsafe: boolean, category: string|null }
function createGroqClient() {
  return {
    async classify(text) {
      const res = await axios.post(
        "https://api.groq.com/openai/v1/chat/completions",
        {
          model: GROQ_MODEL,
          temperature: 0,
          max_completion_tokens: 2048,
          messages: [
            { role: "system", content: MODERATION_POLICY },
            { role: "user", content: text },
          ],
        },
        {
          headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
          timeout: 4000,
        }
      );
      const verdict = parseGuardResponse(res.data.choices?.[0]?.message?.content);
      if (verdict.malformed) {
        // Loud on purpose. A malformed verdict means the model or the policy
        // prompt changed under us, which is how this gate died last time.
        console.error(
          `Groq moderation returned an unrecognised verdict from ${GROQ_MODEL}; allowing message.`
        );
      }
      return verdict;
    },
  };
}

async function moderateMessage(text, { groqClient } = {}) {
  // Gate 1: local word-list, no network.
  if (wordListHit(text)) {
    return { ok: false, reason: "profanity", category: "wordlist" };
  }

  // Gate 2: Groq AI. Fail open on any error.
  const client = groqClient || createGroqClient();
  try {
    const verdict = await client.classify(text);
    if (verdict.unsafe) {
      return { ok: false, reason: `flagged: ${verdict.category}`, category: verdict.category };
    }
    return { ok: true, reason: null, category: null };
  } catch (err) {
    console.error("Groq moderation failed, allowing message:", err.message);
    return { ok: true, reason: null, category: null };
  }
}

module.exports = {
  moderateMessage,
  wordListHit,
  normalize,
  createGroqClient,
  parseGuardResponse,
  MODERATION_POLICY,
  GROQ_MODEL,
};
