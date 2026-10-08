// Fetches the public-domain test songs for Magic Sequence's fit-score tuning (test-songs.md) into
// .songs/, which is gitignored: recordings stay out of the repository. With ffmpeg on the PATH it
// also writes a 22.05 kHz mono WAV of each, which the score test reads (Node can't decode MP3).
//
//   node tools/sequence-corpus/fetch-test-songs.mjs

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const SONGS = [
  {
    id: "jingle-bells",
    character: "upbeat",
    title: "Jingle Bells",
    url: "https://upload.wikimedia.org/wikipedia/commons/7/72/Jingle_Bells_%282020%29_-_Starlifter_and_Roots_in_Blue_-_United_States_Air_Force_Band_of_Mid-America.mp3",
  },
  {
    id: "silent-night",
    character: "slow",
    title: "Silent Night",
    url: "https://upload.wikimedia.org/wikipedia/commons/5/51/Silent_Night_%282020%29_-_Starlifter_and_Roots_in_Blue_-_United_States_Air_Force_Band_of_Mid-America.mp3",
  },
  {
    id: "carol-of-the-bells",
    character: "dramatic",
    title: "Carol of the Bells",
    url: "https://upload.wikimedia.org/wikipedia/commons/3/32/Carol_of_the_Bells_-_Concert_Band_-_United_States_Air_Force_Band_of_the_Rockies.mp3",
  },
];

const dir = join(dirname(fileURLToPath(import.meta.url)), ".songs");

async function main() {
  mkdirSync(dir, { recursive: true });
  for (const song of SONGS) {
    const mp3 = join(dir, `${song.id}.mp3`);
    if (!existsSync(mp3)) {
      const res = await fetch(song.url, { headers: { "User-Agent": "webxlights-magic-sequence/1.0 (https://github.com/loganjmoore/webxlights)" } });
      if (!res.ok) throw new Error(`${song.title}: HTTP ${res.status}`);
      writeFileSync(mp3, Buffer.from(await res.arrayBuffer()));
      console.log(`fetched ${song.title}`);
    }
    const wav = join(dir, `${song.id}.wav`);
    if (!existsSync(wav)) {
      try {
        execFileSync("ffmpeg", ["-loglevel", "error", "-i", mp3, "-ac", "1", "-ar", "22050", "-c:a", "pcm_s16le", wav]);
        console.log(`decoded ${song.title}`);
      } catch {
        console.log(`ffmpeg not found: ${song.title} stays MP3 only`);
      }
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
