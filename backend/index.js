import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import Groq from "groq-sdk";
import fetch from "node-fetch";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

const UNSPLASH_KEY = process.env.UNSPLASH_ACCESS_KEY;

app.post("/api/story", async (req, res) => {
  const { zone, query, language } = req.body;

  if (!query || !query.trim()) {
    return res.json({ error: "Story topic missing" });
  }

  try {
    console.log("📩 Request:", { zone, language, query });

    // ✅ Generate story (paragraph scenes)
    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        {
          role: "system",
          content: `Write a ${zone} cultural story in ${language}.
Split the story into exactly 4 scenes.
Each scene must be ONE paragraph (5–7 lines).
Do not use bullet points.`,
        },
        { role: "user", content: query },
      ],
      max_tokens: 900,
      temperature: 0.7,
    });

    const story = completion.choices?.[0]?.message?.content;

    if (!story) {
      return res.json({ error: "No story generated" });
    }

    // ✅ Robust scene extraction (NO strict Scene 1 format needed)
    let parts = story
      .split(/\n\s*\n/) // split by blank lines
      .map((s) => s.trim())
      .filter((s) => s.length > 30);

    // ✅ If AI returns as one block, force split into 4 parts
    if (parts.length < 4) {
      const approxLen = Math.ceil(story.length / 4);

      parts = [
        story.slice(0, approxLen).trim(),
        story.slice(approxLen, approxLen * 2).trim(),
        story.slice(approxLen * 2, approxLen * 3).trim(),
        story.slice(approxLen * 3).trim(),
      ];
    }

    // ✅ Always ensure exactly 4 scenes
    parts = parts.slice(0, 4);

    // ✅ Image Search
    const imageQuery = query
      .replace(/story/gi, "")
      .trim()
      .split(" ")
      .slice(0, 3)
      .join(" ");

    const imgRes = await fetch(
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(
        imageQuery
      )}&per_page=4&client_id=${UNSPLASH_KEY}`
    );

    const imgJson = await imgRes.json();
    const images = imgJson.results?.map((img) => img.urls.regular) || [];

    // ✅ Build final scenes with images
    const scenes = parts.map((text, i) => ({
      text,
      image: images[i] || images[0] || "",
    }));

    return res.json({ scenes });
  } catch (err) {
    console.error("❌ Backend Error:", err.message);
    return res.json({
      error: "AI is busy or API issue. Please wait and try again.",
    });
  }
});

app.listen(5000, () => {
  console.log("✅ Backend running on http://localhost:5000");
});
