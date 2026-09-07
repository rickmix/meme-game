const express = require("express");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

const app = express();
const PORT = process.env.PORT || 3000;

const ROOT = __dirname;
const DATA = path.join(ROOT, "data");
const DB = path.join(DATA, "videos.json");
const AUDIO = path.join(DATA, "audio");
const VIDEOS = path.join(DATA, "videos");

// Current upstream yt-dlp installation
const YTDLP = "/usr/local/bin/yt-dlp";

fs.mkdirSync(DATA, { recursive: true });
fs.mkdirSync(AUDIO, { recursive: true });
fs.mkdirSync(VIDEOS, { recursive: true });

if (!fs.existsSync(DB)) {
  fs.writeFileSync(DB, "[]");
}

app.use(express.json());
app.use(express.static(path.join(ROOT, "public")));
app.use("/audio", express.static(AUDIO));

function readDb() {
  return JSON.parse(fs.readFileSync(DB, "utf8"));
}

function writeDb(videos) {
  fs.writeFileSync(
    DB,
    JSON.stringify(videos, null, 2)
  );
}
function videoIdFromUrl(input) {
  try {
    const u = new URL(input.trim());

    // youtu.be/VIDEO_ID
    if (u.hostname === "youtu.be") {
      return u.pathname
        .slice(1)
        .split("/")[0]
        .trim();
    }

    // youtube.com URLs
    if (
      u.hostname === "youtube.com" ||
      u.hostname === "www.youtube.com" ||
      u.hostname.endsWith(".youtube.com")
    ) {
      // https://www.youtube.com/watch?v=VIDEO_ID
      if (u.pathname === "/watch") {
        return u.searchParams.get("v");
      }

      // https://www.youtube.com/shorts/VIDEO_ID
      if (u.pathname.startsWith("/shorts/")) {
        return u.pathname
          .split("/")[2]
          ?.trim();
      }

      // https://www.youtube.com/embed/VIDEO_ID
      if (u.pathname.startsWith("/embed/")) {
        return u.pathname
          .split("/")[2]
          ?.trim();
      }
    }
  } catch {
    return null;
  }

  return null;
}

async function command(name, args) {
  return execFileAsync(name, args, {
    maxBuffer: 20 * 1024 * 1024
  });
}

async function processVideo(id) {
  const outputTemplate = path.join(
    VIDEOS,
    `${id}.%(ext)s`
  );

  console.log(`Downloading audio for ${id}...`);

  // Download audio only.
  // Use this only for videos you are allowed to download/use.
  await command(YTDLP, [
    "--no-playlist",
    "--cookies-from-browser", "firefox",
    "-f",
    "bestaudio/best",
    "--extract-audio",
    "--audio-format",
    "wav",
    "--audio-quality",
    "0",
    "-o",
    outputTemplate,
    `https://www.youtube.com/watch?v=${id}`
  ]);

  const wav = path.join(
    VIDEOS,
    `${id}.wav`
  );

  if (!fs.existsSync(wav)) {
    throw new Error(
      "yt-dlp did not create the expected WAV file."
    );
  }

  console.log(`Detecting silence for ${id}...`);

  // Detect silence across the full source.
  const { stderr } = await command("ffmpeg", [
    "-hide_banner",
    "-i",
    wav,
    "-af",
    "silencedetect=noise=-35dB:d=0.35",
    "-f",
    "null",
    "-"
  ]);

  const duration =
    await getDuration(wav);

  const silences = [];

  const starts = [
    ...stderr.matchAll(
      /silence_start:\s*([0-9.]+)/g
    )
  ].map(m => Number(m[1]));

  const ends = [
    ...stderr.matchAll(
      /silence_end:\s*([0-9.]+)/g
    )
  ].map(m => Number(m[1]));

  for (
    let i = 0;
    i < Math.min(
      starts.length,
      ends.length
    );
    i++
  ) {
    silences.push([
      starts[i],
      ends[i]
    ]);
  }

  // Turn silence ranges into audible ranges.
  const audible = [];

  let cursor = 0;

  for (const [start, end] of silences) {
    if (start > cursor) {
      audible.push([
        cursor,
        start
      ]);
    }

    cursor = Math.max(
      cursor,
      end
    );
  }

  if (cursor < duration) {
    audible.push([
      cursor,
      duration
    ]);
  }

  // Candidate sections:
  // At least 12 seconds of audio,
  // avoiding the first/last 5 seconds where possible.
  let candidates = audible
    .map(([a, b]) => [
      Math.max(a, 5),
      Math.min(
        b,
        duration - 5
      )
    ])
    .filter(
      ([a, b]) =>
        b - a >= 12
    );

  // If there aren't any, allow shorter sections.
  if (!candidates.length) {
    candidates = audible.filter(
      ([a, b]) =>
        b - a >= 5
    );
  }

  if (!candidates.length) {
    throw new Error(
      "Could not find a suitable audible section."
    );
  }

  // Pick a random audible section.
  const [a, b] =
    candidates[
      Math.floor(
        Math.random() *
          candidates.length
      )
    ];

  // Pick a random start point.
  const maxStart = Math.max(
    a,
    b - 12
  );

  const start =
    a +
    Math.random() *
      Math.max(
        0,
        maxStart - a
      );

  const safeStart =
    Math.max(
      0,
      Math.round(
        start * 100
      ) / 100
    );

  console.log(
    `Creating 20-second clip at ${safeStart}s...`
  );

  // Create ONLY the final clip.
  const clip = path.join(
    AUDIO,
    `${id}-clip.mp3`
  );

  await command("ffmpeg", [
    "-y",
    "-ss",
    String(safeStart),
    "-i",
    wav,
    "-t",
    "20",
    "-ac",
    "1",
    "-ar",
    "44100",
    "-af",
    "loudnorm=I=-16:TP=-1.5:LRA=11",
    "-codec:a",
    "libmp3lame",
    "-b:a",
    "128k",
    clip
  ]);

  // Remove the temporary WAV.
  fs.rmSync(wav, {
    force: true
  });

  console.log(
    `Clip created: ${clip}`
  );

  const meta = await getYoutubeMetadata(id);

  return {
    title:
      meta.title ||
      `YouTube video ${id}`,

    duration,

    clipStart: safeStart,

    audioUrl:
      `/audio/${id}-clip.mp3`
  };
}

async function getDuration(file) {
  const { stdout } =
    await command("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      file
    ]);

  return Number(
    stdout.trim()
  );
}

async function getYoutubeMetadata(id) {
  try {
    const { stdout } = await command(YTDLP, [
      "--no-playlist",
      "--cookies-from-browser", "firefox",
      "--print",
      "%(title)s",
      "--skip-download",
      `https://www.youtube.com/watch?v=${id}`
    ]);

    const title = stdout.trim();

    return {
      title
    };
  } catch (error) {
    console.error(
      "Could not get YouTube title:",
      error.message
    );

    return {};
  }
}

// Get all videos
app.get(
  "/api/videos",
  (req, res) => {
    res.json(
      readDb().map(v => ({
        id: v.id,
        title: v.title,
        channel: v.channel,
        duration: v.duration,
        ready: v.ready,
        createdAt: v.createdAt
      }))
    );
  }
);

// Add a video
app.post(
  "/api/videos",
  async (req, res) => {
    const id =
      videoIdFromUrl(
        req.body.url || ""
      );

    if (!id) {
      return res.status(400).json({
        error:
          "Invalid YouTube URL."
      });
    }

    const db = readDb();

    if (
      db.some(
        v => v.id === id
      )
    ) {
      return res.status(409).json({
        error:
          "This video is already in the list."
      });
    }

    const item = {
      id,
      title: "Processing...",
      channel: "",
      ready: false,
      createdAt:
        new Date().toISOString()
    };

    db.push(item);
    writeDb(db);

    try {
      console.log(
        `Processing video ${id}...`
      );

      const result =
        await processVideo(id);

      // IMPORTANT:
      // Read the database ONCE,
      // modify that same array,
      // then write that same array.
      const currentDb = readDb();

      const current =
        currentDb.find(
          v => v.id === id
        );

      if (!current) {
        throw new Error(
          "Video disappeared from the database during processing."
        );
      }

      Object.assign(
        current,
        result,
        {
          ready: true
        }
      );

      writeDb(currentDb);

      console.log(
        `Video ${id} is ready!`
      );

      res.status(201).json(
        current
      );

    } catch (e) {
      console.error(
        "Video processing failed:",
        e
      );

      // Remove failed video from DB.
      const currentDb =
        readDb().filter(
          v => v.id !== id
        );

      writeDb(currentDb);

      // Remove any leftover temporary files.
      fs.rmSync(
        path.join(
          VIDEOS,
          `${id}.wav`
        ),
        {
          force: true
        }
      );

      res.status(500).json({
        error:
          `Processing failed: ${e.message}`,

        hint:
          "Make sure yt-dlp, ffmpeg and ffprobe are installed and available."
      });
    }
  }
);

// Delete a video
app.delete(
  "/api/videos/:id",
  (req, res) => {
    const id =
      req.params.id;

    writeDb(
      readDb().filter(
        v => v.id !== id
      )
    );

    // Remove generated clip.
    fs.rmSync(
      path.join(
        AUDIO,
        `${id}-clip.mp3`
      ),
      {
        force: true
      }
    );

    // Remove any old MP3 created
    // by the previous version.
    fs.rmSync(
      path.join(
        AUDIO,
        `${id}.mp3`
      ),
      {
        force: true
      }
    );

    // Remove temporary WAV if one exists.
    fs.rmSync(
      path.join(
        VIDEOS,
        `${id}.wav`
      ),
      {
        force: true
      }
    );

    res.json({
      ok: true
    });
  }
);

// Start a game
app.get(
  "/api/game",
  (req, res) => {
    const videos = readDb();

    // Only use videos that actually have
    // their generated MP3 clip.
    const ready = videos.filter(v => {
      const audioFile = path.join(
        AUDIO,
        `${v.id}-clip.mp3`
      );

      return fs.existsSync(audioFile);
    });

    if (!ready.length) {
      return res.status(400).json({
        error:
          "No playable audio clips found."
      });
    }

    const answer =
      ready[
        Math.floor(
          Math.random() *
            ready.length
        )
      ];

    const choices =
      ready
        .map(v => ({
          id: v.id,
          title: v.title
        }))
        .sort(
          () =>
            Math.random() - 0.5
        );

    res.json({
      roundId:
        crypto.randomUUID(),

      answerId:
        answer.id,

      audioUrl:
        answer.audioUrl ||
        `/audio/${answer.id}-clip.mp3`,

      choices
    });
  }
);

app.listen(
  PORT,
  () => {
    console.log(
      `\nGuess Game running at http://localhost:${PORT}\n`
    );
  }
);