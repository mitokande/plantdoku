import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
const key = process.env.GEMINI_API_KEY;
if (!key) throw new Error("GEMINI_API_KEY is required");
const text = "Stop scrolling. Where does the last plant go? One plant in every row, column, and color cluster. And plants can’t touch—not even diagonally. Tap X’s to rule cells out. Double-tap to plant. Stuck? Take a hint, undo, and try again. Easy is six by six. Hard is nine by nine. Think you can solve today’s board? Plantdoku. Start your streak.";
const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent", {
  method: "POST",
  headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
  body: JSON.stringify({
    contents: [{ parts: [{ text: "Synthesize speech only. Audio profile: energetic, friendly young adult game creator. Scene: a fast-paced TikTok puzzle-game challenge. Director notes: American English, playful urgency, crisp diction, quick pace, strong first sentence, tiny pauses after each rule, confident challenge at the end. Spoken transcript:\n" + text }] }],
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } }
    }
  })
});
if (!response.ok) throw new Error(`Gemini TTS failed: ${response.status} ${await response.text()}`);
const json = await response.json();
const encoded = json.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
if (!encoded) throw new Error("Gemini TTS returned no audio");
const pcm = Buffer.from(encoded, "base64");
const rate = 24000, channels = 1, bits = 16;
const header = Buffer.alloc(44);
header.write("RIFF", 0); header.writeUInt32LE(36 + pcm.length, 4); header.write("WAVEfmt ", 8);
header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(channels, 22);
header.writeUInt32LE(rate, 24); header.writeUInt32LE((rate * channels * bits) / 8, 28);
header.writeUInt16LE((channels * bits) / 8, 32); header.writeUInt16LE(bits, 34);
header.write("data", 36); header.writeUInt32LE(pcm.length, 40);
const out = "assets/audio/voiceover.wav";
await mkdir(dirname(out), { recursive: true });
await writeFile(out, Buffer.concat([header, pcm]));
console.log(`Wrote ${out}`);
