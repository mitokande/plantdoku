import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
const key = process.env.GEMINI_API_KEY;
if (!key) throw new Error("GEMINI_API_KEY is required");
const text = "Quick brain teaser: where can this last plant go? Plantdoku gives you three rules. Exactly one plant in every row and column. Exactly one in every colored patch. And plants can’t touch, even diagonally. Mark impossible cells with X’s. Spot the forced move. Made a mistake? Undo it or take a hint. Easy starts at six by six. Hard goes nine by nine. Can your brain solve today’s board?";
const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent", {
  method: "POST",
  headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
  body: JSON.stringify({
    contents: [{ parts: [{ text: "Synthesize speech only. Audio profile: energetic, clever mobile-game creator. Scene: a rapid Instagram Reels brain-teaser challenge. Director notes: American English, fast but clear, playful competitive energy, punch the three rules, finish with a direct challenge. Spoken transcript:\n" + text }] }],
    generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } } }
  })
});
if (!response.ok) throw new Error(`Gemini TTS failed: ${response.status} ${await response.text()}`);
const json = await response.json();
const encoded = json.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
if (!encoded) throw new Error("Gemini TTS returned no audio");
const pcm = Buffer.from(encoded, "base64");
const header = Buffer.alloc(44), rate = 24000, channels = 1, bits = 16;
header.write("RIFF",0); header.writeUInt32LE(36+pcm.length,4); header.write("WAVEfmt ",8);
header.writeUInt32LE(16,16); header.writeUInt16LE(1,20); header.writeUInt16LE(channels,22);
header.writeUInt32LE(rate,24); header.writeUInt32LE(rate*channels*bits/8,28); header.writeUInt16LE(channels*bits/8,32); header.writeUInt16LE(bits,34);
header.write("data",36); header.writeUInt32LE(pcm.length,40);
const out="assets/audio/voiceover.wav"; await mkdir(dirname(out),{recursive:true}); await writeFile(out,Buffer.concat([header,pcm]));
console.log(`Wrote ${out}`);
