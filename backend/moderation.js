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

// Parse a Llama Guard reply ("safe" or "unsafe\nS1") into a verdict.
function parseGuardResponse(content) {
  const text = (content || "").trim();
  if (text.toLowerCase().startsWith("unsafe")) {
    return { unsafe: true, category: text.split(/\s+/)[1] || "unknown" };
  }
  return { unsafe: false, category: null };
}

// Default Groq client — calls Llama Guard via the OpenAI-compatible endpoint.
// classify(text) -> { unsafe: boolean, category: string|null }
function createGroqClient() {
  return {
    async classify(text) {
      const res = await axios.post(
        "https://api.groq.com/openai/v1/chat/completions",
        {
          model: "meta-llama/llama-guard-4-12b",
          messages: [{ role: "user", content: text }],
        },
        {
          headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
          timeout: 2000,
        }
      );
      return parseGuardResponse(res.data.choices?.[0]?.message?.content);
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

module.exports = { moderateMessage, wordListHit, normalize, createGroqClient, parseGuardResponse };
