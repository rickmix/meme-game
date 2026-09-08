const express = require("express");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const http = require("http");
const { Server } = require("socket.io");
const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, "public");

const DATA = path.join(ROOT, "data");
const DB = path.join(DATA, "videos.json");
const AUDIO = path.join(DATA, "audio");
const VIDEOS = path.join(DATA, "videos");

const YTDLP = "/usr/local/bin/yt-dlp";


// ============================================================
// SETUP
// ============================================================

fs.mkdirSync(DATA, { recursive: true });
fs.mkdirSync(AUDIO, { recursive: true });
fs.mkdirSync(VIDEOS, { recursive: true });

if (!fs.existsSync(DB)) {
  fs.writeFileSync(DB, "[]");
}

app.use(express.json());


// ============================================================
// ADMIN AUTHENTICATION
// ============================================================

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

if (!ADMIN_PASSWORD) {
  console.warn(
    "WARNING: ADMIN_PASSWORD is not set. Admin login will be unavailable."
  );
}

const adminSessions = new Map();

const ADMIN_SESSION_DURATION =
  24 * 60 * 60 * 1000;


// ------------------------------------------------------------
// Parse cookies
// ------------------------------------------------------------

function parseCookies(req) {
  const header = req.headers.cookie;

  if (!header) {
    return {};
  }

  return Object.fromEntries(
    header
      .split(";")
      .map(cookie => cookie.trim())
      .filter(Boolean)
      .map(cookie => {
        const index = cookie.indexOf("=");

        if (index === -1) {
          return [cookie, ""];
        }

        const key = cookie.slice(0, index);
        const value = cookie.slice(index + 1);

        try {
          return [
            key,
            decodeURIComponent(value)
          ];
        } catch {
          return [
            key,
            value
          ];
        }
      })
  );
}


// ------------------------------------------------------------
// Check admin session
// ------------------------------------------------------------

function isAdminAuthenticated(req) {
  const cookies = parseCookies(req);
  const token = cookies.admin_session;

  if (!token) {
    return false;
  }

  const session = adminSessions.get(token);

  if (!session) {
    return false;
  }

  if (Date.now() > session.expiresAt) {
    adminSessions.delete(token);
    return false;
  }

  return true;
}


// ------------------------------------------------------------
// Protect admin resources
// ------------------------------------------------------------

function requireAdmin(req, res, next) {
  if (!isAdminAuthenticated(req)) {
    if (req.path === "/admin.html") {
      return res.redirect("/admin-login.html");
    }

    return res.status(401).json({
      error: "Admin authentication required."
    });
  }

  next();
}


// ------------------------------------------------------------
// Login
// ------------------------------------------------------------

app.post(
  "/admin-login",
  (req, res) => {
    const password = String(
      req.body.password || ""
    );

    if (!ADMIN_PASSWORD) {
      return res.status(500).json({
        error:
          "Admin password is not configured on the server."
      });
    }

    if (password !== ADMIN_PASSWORD) {
      return res.status(401).json({
        error: "Incorrect password."
      });
    }

    const token =
      crypto.randomBytes(32).toString("hex");

    adminSessions.set(
      token,
      {
        expiresAt:
          Date.now() +
          ADMIN_SESSION_DURATION
      }
    );

    res.setHeader(
      "Set-Cookie",
      [
        `admin_session=${token}`,
        "HttpOnly",
        "Path=/",
        "SameSite=Strict",
        `Max-Age=${ADMIN_SESSION_DURATION / 1000}`
      ].join("; ")
    );

    res.json({
      success: true
    });
  }
);


// ------------------------------------------------------------
// Logout
// ------------------------------------------------------------

app.post(
  "/admin-logout",
  (req, res) => {
    const cookies = parseCookies(req);
    const token = cookies.admin_session;

    if (token) {
      adminSessions.delete(token);
    }

    res.setHeader(
      "Set-Cookie",
      [
        "admin_session=",
        "HttpOnly",
        "Path=/",
        "SameSite=Strict",
        "Max-Age=0"
      ].join("; ")
    );

    res.json({
      success: true
    });
  }
);


// ------------------------------------------------------------
// Protected admin page
// ------------------------------------------------------------

app.get(
  "/admin.html",
  requireAdmin,
  (req, res) => {
    res.sendFile(
      path.join(
        PUBLIC,
        "admin.html"
      )
    );
  }
);


// ------------------------------------------------------------
// Public static files
// ------------------------------------------------------------

app.use(
  express.static(PUBLIC)
);

app.use(
  "/audio",
  express.static(AUDIO)
);


// ============================================================
// DATABASE
// ============================================================

function readDb() {
  try {
    return JSON.parse(
      fs.readFileSync(
        DB,
        "utf8"
      )
    );
  } catch (error) {
    console.error(
      "Could not read database:",
      error
    );

    return [];
  }
}


function writeDb(videos) {
  fs.writeFileSync(
    DB,
    JSON.stringify(
      videos,
      null,
      2
    )
  );
}


// ============================================================
// YOUTUBE HELPERS
// ============================================================

function videoIdFromUrl(input) {
  try {
    const u = new URL(
      input.trim()
    );

    if (u.hostname === "youtu.be") {
      return u.pathname
        .slice(1)
        .split("/")[0]
        .trim();
    }

    if (
      u.hostname === "youtube.com" ||
      u.hostname === "www.youtube.com" ||
      u.hostname.endsWith(".youtube.com")
    ) {
      if (u.pathname === "/watch") {
        return u.searchParams.get("v");
      }

      if (u.pathname.startsWith("/shorts/")) {
        return u.pathname
          .split("/")[2]
          ?.trim();
      }

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
  return execFileAsync(
    name,
    args,
    {
      maxBuffer:
        20 * 1024 * 1024
    }
  );
}


// ============================================================
// AUDIO HELPERS
// ============================================================

async function getDuration(file) {
  const { stdout } =
    await command(
      "ffprobe",
      [
        "-v",
        "error",

        "-show_entries",
        "format=duration",

        "-of",
        "default=noprint_wrappers=1:nokey=1",

        file
      ]
    );

  const duration =
    Number(
      stdout.trim()
    );

  if (!Number.isFinite(duration)) {
    throw new Error(
      "Could not determine audio duration."
    );
  }

  return duration;
}


// ============================================================
// FIND GOOD AUDIO SECTIONS
// ============================================================

async function findGoodSections(audioFile) {
  console.log(
    `Analyzing audio for good sections: ${audioFile}`
  );

  const duration = await getDuration(audioFile);

  if (!Number.isFinite(duration) || duration < 2) {
    throw new Error(
      "Audio is shorter than the 2-second minimum."
    );
  }

  // ==========================================================
  // SHORT AUDIO
  // ==========================================================

  if (duration <= 10) {
    console.log(
      `Video is ${duration.toFixed(2)} seconds long. Using the full audio.`
    );

    return {
      duration,

      goodSections: [
        {
          start: 0,
          duration: Number(duration.toFixed(2))
        }
      ]
    };
  }

  // ==========================================================
  // CREATE TEMPORARY PCM FILE
  // ==========================================================

  const path = require("path");
  const fs = require("fs/promises");
  const os = require("os");
  const crypto = require("crypto");

  const tempFile = path.join(
    os.tmpdir(),
    `audio-analysis-${crypto.randomUUID()}.pcm`
  );

  console.log(
    "Converting audio for analysis..."
  );

  try {
    await command(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",

        "-i",
        audioFile,

        "-vn",

        "-ac",
        "1",

        "-ar",
        "8000",

        "-f",
        "s16le",

        "-y",

        tempFile
      ]
    );

    const pcm =
      await fs.readFile(tempFile);

    if (
      !Buffer.isBuffer(pcm) ||
      pcm.length < 2
    ) {
      throw new Error(
        "FFmpeg produced an empty audio analysis file."
      );
    }

    console.log(
      `Audio analysis data: ${(
        pcm.length /
        1024 /
        1024
      ).toFixed(2)} MB`
    );

    // ========================================================
    // PCM SETTINGS
    // ========================================================

    const SAMPLE_RATE = 8000;

    const BYTES_PER_SAMPLE = 2;

    const totalSamples =
      Math.floor(
        pcm.length /
          BYTES_PER_SAMPLE
      );

    const samples =
      new Float32Array(
        totalSamples
      );

    for (
      let i = 0;
      i < totalSamples;
      i++
    ) {
      samples[i] =
        pcm.readInt16LE(
          i * 2
        ) / 32768;
    }

    // ========================================================
    // SETTINGS
    // ========================================================

    const CLIP_DURATION = 10;

    // Check every 2 seconds.
    const STEP = 2;

    // Analyze audio in 0.5 second pieces.
    const WINDOW = 0.5;

    const WINDOW_SAMPLES =
      Math.floor(
        SAMPLE_RATE *
          WINDOW
      );

    const CLIP_SAMPLES =
      Math.floor(
        SAMPLE_RATE *
          CLIP_DURATION
      );

    // Anything below this is effectively silence.
    const SILENCE_THRESHOLD =
      Math.pow(
        10,
        -45 / 20
      );

    // A 0.5 second window above this is considered audible.
    const AUDIBLE_RMS =
      Math.pow(
        10,
        -35 / 20
      );

    // Only 25% of the 10-second clip needs to contain
    // clearly audible audio.
    //
    // Example:
    //
    // 3 seconds music
    // 7 seconds quiet
    //
    // = VALID
    const MIN_GOOD_RATIO = 0.25;

    const candidates = [];

    // ========================================================
    // ANALYZE 10-SECOND SECTIONS
    // ========================================================

    for (
      let startSample = 0;

      startSample +
          CLIP_SAMPLES <=
        totalSamples;

      startSample +=
        SAMPLE_RATE *
        STEP
    ) {
      const endSample =
        startSample +
        CLIP_SAMPLES;

      let goodWindows = 0;

      let totalWindows = 0;

      let rmsSum = 0;

      let peak = 0;

      // ------------------------------------------------------
      // Analyze 0.5-second windows
      // ------------------------------------------------------

      for (
        let windowStart =
          startSample;

        windowStart <
          endSample;

        windowStart +=
          WINDOW_SAMPLES
      ) {
        const windowEnd =
          Math.min(
            windowStart +
              WINDOW_SAMPLES,

            endSample
          );

        let sumSquares = 0;

        let count = 0;

        let windowPeak = 0;

        for (
          let i =
            windowStart;

          i <
            windowEnd;

          i++
        ) {
          const sample =
            samples[i];

          const absolute =
            Math.abs(
              sample
            );

          sumSquares +=
            sample *
            sample;

          if (
            absolute >
            windowPeak
          ) {
            windowPeak =
              absolute;
          }

          count++;
        }

        if (count === 0) {
          continue;
        }

        const windowRms =
          Math.sqrt(
            sumSquares /
              count
          );

        rmsSum +=
          windowRms;

        totalWindows++;

        if (
          windowPeak >
          peak
        ) {
          peak =
            windowPeak;
        }

        // Audible window
        if (
          windowRms >=
          AUDIBLE_RMS
        ) {
          goodWindows++;
        }
      }

      if (totalWindows === 0) {
        continue;
      }

      const goodRatio =
        goodWindows /
        totalWindows;

      const averageRms =
        rmsSum /
        totalWindows;

      // ------------------------------------------------------
      // Reject sections that are almost entirely silent
      // ------------------------------------------------------

      if (
        goodRatio <
        MIN_GOOD_RATIO
      ) {
        continue;
      }

      // ------------------------------------------------------
      // Convert volume to dB
      // ------------------------------------------------------

      const rmsDb =
        20 *
        Math.log10(
          Math.max(
            averageRms,
            0.000001
          )
        );

      const peakDb =
        20 *
        Math.log10(
          Math.max(
            peak,
            0.000001
          )
        );

      // ------------------------------------------------------
      // Scores
      // ------------------------------------------------------

      const volumeScore =
        Math.max(
          0,
          Math.min(
            1,
            (rmsDb + 45) /
              25
          )
        );

      const audioScore =
        Math.max(
          0,
          Math.min(
            1,
            goodRatio
          )
        );

      const peakScore =
        Math.max(
          0,
          Math.min(
            1,
            (peakDb + 30) /
              25
          )
        );

      const score =
        audioScore * 0.60 +
        volumeScore * 0.30 +
        peakScore * 0.10;

      candidates.push({
        start: Number(
          (
            startSample /
            SAMPLE_RATE
          ).toFixed(2)
        ),

        duration:
          CLIP_DURATION,

        score,

        goodRatio,

        rmsDb,

        peakDb
      });
    }

    console.log(
      `Found ${candidates.length} usable 10-second sections.`
    );

    // ========================================================
    // FALLBACK
    // ========================================================

    if (
      candidates.length === 0
    ) {
      console.warn(
        "No sections passed audio analysis. Using random 10-second sections."
      );

      const fallback = [];

      const maxStart =
        duration -
        CLIP_DURATION;

      for (
        let start = 0;

        start <=
          maxStart;

        start += STEP
      ) {
        fallback.push({
          start: Number(
            start.toFixed(2)
          ),

          duration:
            CLIP_DURATION
        });
      }

      if (
        fallback.length === 0
      ) {
        fallback.push({
          start: 0,
          duration:
            CLIP_DURATION
        });
      }

      fallback.sort(
        () =>
          Math.random() -
          0.5
      );

      return {
        duration,

        goodSections:
          fallback.slice(
            0,
            Math.min(
              10,
              fallback.length
            )
          )
      };
    }

    // ========================================================
    // SORT BY QUALITY
    // ========================================================

    candidates.sort(
      (a, b) =>
        b.score -
        a.score
    );

    // ========================================================
    // SELECT SECTIONS
    // ========================================================

    const selected = [];

    const MIN_DISTANCE = 6;

    for (
      const candidate of candidates
    ) {
      const tooClose =
        selected.some(
          existing =>
            Math.abs(
              existing.start -
                candidate.start
            ) <
            MIN_DISTANCE
        );

      if (tooClose) {
        continue;
      }

      selected.push(
        candidate
      );

      if (
        selected.length >=
        20
      ) {
        break;
      }
    }

    // ========================================================
    // FILL IF NEEDED
    // ========================================================

    if (
      selected.length < 10
    ) {
      for (
        const candidate of candidates
      ) {
        if (
          selected.some(
            existing =>
              existing.start ===
              candidate.start
          )
        ) {
          continue;
        }

        selected.push(
          candidate
        );

        if (
          selected.length >=
          10
        ) {
          break;
        }
      }
    }

    // ========================================================
    // SHUFFLE
    // ========================================================

    const goodSections =
      selected
        .map(
          section => ({
            start:
              section.start,

            duration:
              section.duration
          })
        )
        .sort(
          () =>
            Math.random() -
            0.5
        );

    console.log(
      `Selected ${goodSections.length} good sections.`
    );

    console.log(
      "Best candidates:",
      selected
        .slice(0, 5)
        .map(
          section => ({
            start:
              section.start,

            score:
              Number(
                section.score.toFixed(
                  3
                )
              ),

            audible:
              `${Math.round(
                section.goodRatio *
                  100
              )}%`,

            rms:
              `${section.rmsDb.toFixed(
                1
              )} dB`
          })
        )
    );

    return {
      duration,
      goodSections
    };

  } finally {
    // ========================================================
    // CLEAN UP TEMP FILE
    // ========================================================

    try {
      await fs.unlink(
        tempFile
      );
    } catch {
      // File may already be gone.
    }
  }
}


// ============================================================
// PICK RANDOM SECTION
// ============================================================

function pickRandomSection(video) {
  if (
    !video.goodSections ||
    !Array.isArray(
      video.goodSections
    ) ||
    video.goodSections.length === 0
  ) {
    throw new Error(
      `Video ${video.id} does not have any good audio sections.`
    );
  }

  const index =
    Math.floor(
      Math.random() *
        video.goodSections.length
    );

  return video.goodSections[
    index
  ];
}


// ============================================================
// YOUTUBE METADATA
// ============================================================

async function getYoutubeMetadata(id) {
  try {
    const { stdout } =
      await command(
        YTDLP,
        [
          "--no-playlist",

          "--cookies-from-browser",
          "firefox",

          "--print",
          "%(title)s\t%(channel)s",

          "--skip-download",

          `https://www.youtube.com/watch?v=${id}`
        ]
      );

    const line =
      stdout.trim();

    const separator =
      line.indexOf("\t");

    if (separator === -1) {
      return {
        title:
          line,

        channel:
          ""
      };
    }

    return {
      title:
        line.slice(
          0,
          separator
        ).trim(),

      channel:
        line.slice(
          separator + 1
        ).trim()
    };

  } catch (error) {
    console.error(
      "Could not get YouTube metadata:",
      error.message
    );

    return {
      title:
        `YouTube video ${id}`,

      channel:
        ""
    };
  }
}


// ============================================================
// VIDEO PROCESSING
// ============================================================

async function processVideo(id) {
  const outputTemplate =
    path.join(
      AUDIO,
      `${id}.%(ext)s`
    );

  console.log(
    `Downloading full audio for ${id}...`
  );

  await command(
    YTDLP,
    [
      "--no-playlist",

      "--cookies-from-browser",
      "firefox",

      "-f",
      "bestaudio/best",

      "--extract-audio",

      "--audio-format",
      "mp3",

      "--audio-quality",
      "0",

      "-o",
      outputTemplate,

      `https://www.youtube.com/watch?v=${id}`
    ]
  );

  const audioFile =
    path.join(
      AUDIO,
      `${id}.mp3`
    );

  if (!fs.existsSync(audioFile)) {
    throw new Error(
      "yt-dlp did not create the expected MP3 file."
    );
  }

  console.log(
    `Full audio downloaded for ${id}.`
  );


  const meta =
    await getYoutubeMetadata(
      id
    );


  const {
    duration,
    goodSections
  } =
    await findGoodSections(
      audioFile
    );


  console.log(
    `Audio analysis complete for ${id}.`
  );


  return {
    title:
      meta.title ||
      `YouTube video ${id}`,

    channel:
      meta.channel ||
      "",

    duration,

    goodSections,

    audioUrl:
      `/audio/${id}.mp3`
  };
}


// ============================================================
// VIDEO API
// ============================================================

app.get(
  "/api/videos",
  requireAdmin,
  (req, res) => {
    res.json(
      readDb().map(
        v => ({
          id:
            v.id,

          title:
            v.title,

          channel:
            v.channel,

          duration:
            v.duration,

          goodSections:
            v.goodSections?.length || 0,

          ready:
            v.ready,

          createdAt:
            v.createdAt
        })
      )
    );
  }
);


app.post(
  "/api/videos",
  requireAdmin,
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

    const db =
      readDb();

    const alreadyExists =
      db.some(
        v =>
          v.id === id
      );

    const audioExists =
      fs.existsSync(
        path.join(
          AUDIO,
          `${id}.mp3`
        )
      );

    if (
      alreadyExists ||
      audioExists
    ) {
      return res.status(409).json({
        error:
          "This video is already in the list."
      });
    }

    const item = {
      id,

      title:
        "Processing...",

      channel:
        "",

      duration:
        0,

      goodSections:
        [],

      ready:
        false,

      createdAt:
        new Date().toISOString()
    };

    db.push(
      item
    );

    writeDb(
      db
    );

    try {
      console.log(
        `Processing video ${id}...`
      );

      const result =
        await processVideo(
          id
        );

      const currentDb =
        readDb();

      const current =
        currentDb.find(
          v =>
            v.id === id
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
          ready:
            true
        }
      );

      writeDb(
        currentDb
      );

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

      writeDb(
        readDb().filter(
          v =>
            v.id !== id
        )
      );

      fs.rmSync(
        path.join(
          AUDIO,
          `${id}.mp3`
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


app.delete(
  "/api/videos/:id",
  requireAdmin,
  (req, res) => {
    const id =
      req.params.id;

    writeDb(
      readDb().filter(
        v =>
          v.id !== id
      )
    );

    fs.rmSync(
      path.join(
        AUDIO,
        `${id}.mp3`
      ),
      {
        force: true
      }
    );

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


// ============================================================
// SINGLE PLAYER
// ============================================================

app.get(
  "/api/game",
  async (req, res) => {
    try {
      const videos =
        readDb();

      const ready =
        videos.filter(
          v =>
            v.ready &&
            fs.existsSync(
              path.join(
                AUDIO,
                `${v.id}.mp3`
              )
            ) &&
            Array.isArray(
              v.goodSections
            ) &&
            v.goodSections.length > 0
        );

      if (!ready.length) {
        return res.status(400).json({
          error:
            "No playable audio files found."
        });
      }

      const answer =
        ready[
          Math.floor(
            Math.random() *
              ready.length
          )
        ];

      const section =
        pickRandomSection(
          answer
        );

      const choices =
        ready
          .map(
            v => ({
              id:
                v.id,

              title:
                v.title
            })
          )
          .sort(
            () =>
              Math.random() -
              0.5
          );

      res.json({
        roundId:
          crypto.randomUUID(),

        answerId:
          answer.id,

        audioUrl:
          `/audio/${answer.id}.mp3`,

        startTime:
          section.start,

        duration:
          section.duration,

        choices
      });

    } catch (error) {
      console.error(
        "Could not create game round:",
        error
      );

      res.status(500).json({
        error:
          `Could not create game round: ${error.message}`
      });
    }
  }
);


// ============================================================
// MULTIPLAYER
// ============================================================

const parties =
  new Map();

const ROUND_OPTIONS = [
  5,
  10,
  15,
  20
];

const ROUND_DURATION =
  20;


// ------------------------------------------------------------
// Generate party code
// ------------------------------------------------------------

function generatePartyCode() {
  const chars =
    "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  let code;

  do {
    code = "";

    for (
      let i = 0;
      i < 5;
      i++
    ) {
      code +=
        chars[
          Math.floor(
            Math.random() *
              chars.length
          )
        ];
    }

  } while (
    parties.has(code)
  );

  return code;
}


// ------------------------------------------------------------
// Get playable videos
// ------------------------------------------------------------

function getReadyVideos() {
  return readDb().filter(
    v =>
      v.ready &&
      fs.existsSync(
        path.join(
          AUDIO,
          `${v.id}.mp3`
        )
      ) &&
      Array.isArray(
        v.goodSections
      ) &&
      v.goodSections.length > 0
  );
}


// ============================================================
// MULTIPLAYER PLAYER SERIALIZATION
// ============================================================
//
// Keep ALL clients receiving exactly the same player format.
//

function publicPlayer(player) {
  return {
    id:
      player.id,

    playerId:
      player.id,

    socketId:
      player.id,

    name:
      player.name,

    username:
      player.name,

    score:
      Number(player.score) || 0,

    totalScore:
      Number(player.score) || 0,

    points:
      Number(player.score) || 0,

    answered:
      Boolean(player.answered),

    correct:
      Boolean(player.correct),

    pointsThisRound:
      Number(player.pointsThisRound) || 0
  };
}


// ------------------------------------------------------------
// Public party information
// ------------------------------------------------------------

function publicParty(party) {
  return {
    code:
      party.code,

    partyCode:
      party.code,

    hostId:
      party.hostId,

    started:
      Boolean(party.started),

    gameFinished:
      Boolean(party.gameFinished),

    rounds:
      party.rounds,

    totalRounds:
      party.rounds,

    roundNumber:
      party.roundNumber,

    players:
      party.players.map(
        publicPlayer
      )
  };
}


// ============================================================
// BROADCAST PARTY STATE
// ============================================================
//
// This is the important part for the live lobby and scoreboard.
//
// Every time a player joins, leaves, answers, or the host changes,
// EVERY player receives the complete current player list.
//

function broadcastParty(party) {
  const state =
    publicParty(
      party
    );

  io.to(
    party.code
  ).emit(
    "partyUpdated",
    state
  );
}


// ============================================================
// FIND PLAYER
// ============================================================

function findPlayer(socketId) {
  for (
    const party
    of parties.values()
  ) {
    const player =
      party.players.find(
        p =>
          p.id ===
          socketId
      );

    if (player) {
      return {
        party,
        player
      };
    }
  }

  return null;
}


// ============================================================
// CREATE MULTIPLAYER ROUND
// ============================================================

async function createMultiplayerRound(party) {
  const ready =
    getReadyVideos();

  if (
    ready.length <
    party.rounds
  ) {
    throw new Error(
      `Not enough playable videos for this game. The game needs ${party.rounds}, but only ${ready.length} are available.`
    );
  }

  const available =
    ready.filter(
      video =>
        !party.usedVideoIds.includes(
          video.id
        )
    );

  if (!available.length) {
    throw new Error(
      `There are no unused playable videos left for round ${party.roundNumber + 1}.`
    );
  }


  const answer =
    available[
      Math.floor(
        Math.random() *
          available.length
      )
    ];


  const section =
    pickRandomSection(
      answer
    );


  party.usedVideoIds.push(
    answer.id
  );


  const distractors =
    ready
      .filter(
        video =>
          video.id !==
          answer.id
      )
      .sort(
        () =>
          Math.random() -
          0.5
      )
      .slice(
        0,
        5
      );


  const choices = [
    answer,
    ...distractors
  ]
    .map(
      v => ({
        id:
          v.id,

        title:
          v.title
      })
    )
    .sort(
      () =>
        Math.random() -
        0.5
    );


  party.answerId =
    answer.id;

  party.choices =
    choices;

  party.answerOrder =
    [];


  party.players.forEach(
    player => {
      player.answered =
        false;

      player.correct =
        false;

      player.pointsThisRound =
        0;

      player.answerId =
        null;
    }
  );


  party.roundNumber++;


  const startAt =
    Date.now() + 1500;

  party.startAt =
    startAt;


  return {
    roundNumber:
      party.roundNumber,

    totalRounds:
      party.rounds,

    choices,

    audioUrl:
      `/audio/${answer.id}.mp3`,

    startTime:
      section.start,

    audioDuration:
      section.duration,

    duration:
      ROUND_DURATION,

    startAt
  };
}


// ============================================================
// START NEXT ROUND
// ============================================================

async function startNextRound(party) {
  if (!parties.has(party.code)) {
    return;
  }

  if (
    party.roundNumber >=
    party.rounds
  ) {
    finishGame(
      party
    );

    return;
  }

  try {
    const round =
      await createMultiplayerRound(
        party
      );

    if (
      !parties.has(party.code) ||
      !party.started ||
      party.gameFinished
    ) {
      return;
    }


    io.to(
      party.code
    ).emit(
      "roundStarted",
      round
    );


    // Immediately send the updated player state.
    broadcastParty(
      party
    );


    console.log(
      `Party ${party.code}: starting round ${party.roundNumber}/${party.rounds}`
    );


    party.roundTimer =
      setTimeout(
        () => {
          if (
            parties.has(
              party.code
            ) &&
            party.started
          ) {
            finishRound(
              party,
              "timeout"
            );
          }
        },
        (ROUND_DURATION + 2) *
          1000
      );

  } catch (error) {
    console.error(
      `Could not create multiplayer round for ${party.code}:`,
      error
    );

    io.to(
      party.code
    ).emit(
      "errorMessage",
      {
        message:
          `Could not create audio round: ${error.message}`
      }
    );
  }
}


// ============================================================
// FINISH ROUND
// ============================================================

function finishRound(
  party,
  reason = "allAnswered"
) {
  if (
    !parties.has(party.code) ||
    party.roundFinished
  ) {
    return;
  }

  party.roundFinished =
    true;


  if (party.roundTimer) {
    clearTimeout(
      party.roundTimer
    );

    party.roundTimer =
      null;
  }


  const db =
    readDb();


  const answer =
    db.find(
      v =>
        v.id ===
        party.answerId
    );


  const results =
    party.players
      .map(
        player => ({
          playerId:
            player.id,

          id:
            player.id,

          name:
            player.name,

          correct:
            Boolean(player.correct),

          points:
            Number(
              player.pointsThisRound
            ) || 0,

          totalScore:
            Number(
              player.score
            ) || 0,

          score:
            Number(
              player.score
            ) || 0
        })
      )
      .sort(
        (a, b) =>
          b.points -
          a.points
      );


  const players =
    party.players.map(
      publicPlayer
    );


  io.to(
    party.code
  ).emit(
    "roundFinished",
    {
      roundNumber:
        party.roundNumber,

      totalRounds:
        party.rounds,

      correctAnswer: {
        id:
          party.answerId,

        title:
          answer?.title ||
          "Unknown"
      },

      results,

      players,

      scoreboard:
        players,

      reason
    }
  );


  // Keep the live scoreboard synchronized.
  broadcastParty(
    party
  );


  if (
    party.roundNumber >=
    party.rounds
  ) {
    setTimeout(
      () => {
        finishGame(
          party
        );
      },
      3500
    );

    return;
  }


  setTimeout(
    () => {
      if (
        parties.has(
          party.code
        ) &&
        party.started
      ) {
        party.roundFinished =
          false;

        startNextRound(
          party
        );
      }
    },
    3500
  );
}


// ============================================================
// FINISH GAME
// ============================================================

function finishGame(party) {
  if (!parties.has(party.code)) {
    return;
  }


  if (party.roundTimer) {
    clearTimeout(
      party.roundTimer
    );

    party.roundTimer =
      null;
  }


  party.gameFinished =
    true;

  party.started =
    false;


  const finalPlayers =
    [...party.players]
      .sort(
        (a, b) =>
          (Number(b.score) || 0) -
          (Number(a.score) || 0)
      )
      .map(
        (
          player,
          index
        ) => ({
          ...publicPlayer(
            player
          ),

          position:
            index + 1
        })
      );


  io.to(
    party.code
  ).emit(
    "gameFinished",
    {
      code:
        party.code,

      rounds:
        party.rounds,

      totalRounds:
        party.rounds,

      players:
        finalPlayers,

      scoreboard:
        finalPlayers
    }
  );


  // Also update normal party state.
  broadcastParty(
    party
  );


  console.log(
    `Party ${party.code}: game finished`
  );
}


// ============================================================
// SOCKET.IO
// ============================================================

io.on(
  "connection",
  socket => {
    console.log(
      `Socket connected: ${socket.id}`
    );


    // ========================================================
    // CREATE PARTY
    // ========================================================

    socket.on(
      "createParty",
      data => {
        try {
          const name =
            String(
              data?.name || ""
            ).trim();

          let rounds =
            Number(
              data?.rounds
            );


          if (!name) {
            return socket.emit(
              "errorMessage",
              {
                message:
                  "Please enter your name."
              }
            );
          }


          if (name.length > 20) {
            return socket.emit(
              "errorMessage",
              {
                message:
                  "Name must be 20 characters or less."
              }
            );
          }


          if (
            !ROUND_OPTIONS.includes(
              rounds
            )
          ) {
            rounds = 10;
          }


          const ready =
            getReadyVideos();


          if (
            ready.length <
            rounds
          ) {
            return socket.emit(
              "errorMessage",
              {
                message:
                  `You need at least ${rounds} playable videos for a ${rounds}-round game. You currently have ${ready.length}.`
              }
            );
          }


          const code =
            generatePartyCode();


          const party = {
            code,

            hostId:
              socket.id,

            started:
              false,

            rounds,

            roundNumber:
              0,

            usedVideoIds:
              [],

            players: [
              {
                id:
                  socket.id,

                name,

                score:
                  0,

                answered:
                  false,

                correct:
                  false,

                pointsThisRound:
                  0,

                answerId:
                  null
              }
            ],

            answerId:
              null,

            choices:
              [],

            answerOrder:
              [],

            startAt:
              null,

            roundFinished:
              false,

            gameFinished:
              false,

            roundTimer:
              null
          };


          parties.set(
            code,
            party
          );


          socket.join(
            code
          );


          const state =
            publicParty(
              party
            );


          socket.emit(
            "partyCreated",
            state
          );


          // Tell every player in the party.
          broadcastParty(
            party
          );


          console.log(
            `Party ${code} created by ${name} (${rounds} rounds)`
          );

        } catch (error) {
          console.error(
            error
          );

          socket.emit(
            "errorMessage",
            {
              message:
                error.message
            }
          );
        }
      }
    );


    // ========================================================
    // JOIN PARTY
    // ========================================================

    socket.on(
      "joinParty",
      data => {
        try {
          const name =
            String(
              data?.name || ""
            ).trim();


          const code =
            String(
              data?.code || ""
            )
              .trim()
              .toUpperCase();


          if (!name) {
            return socket.emit(
              "errorMessage",
              {
                message:
                  "Please enter your name."
              }
            );
          }


          if (name.length > 20) {
            return socket.emit(
              "errorMessage",
              {
                message:
                  "Name must be 20 characters or less."
              }
            );
          }


          if (!code) {
            return socket.emit(
              "errorMessage",
              {
                message:
                  "Please enter a party code."
              }
            );
          }


          const party =
            parties.get(
              code
            );


          if (!party) {
            return socket.emit(
              "errorMessage",
              {
                message:
                  "Party not found."
              }
            );
          }


          if (party.started) {
            return socket.emit(
              "errorMessage",
              {
                message:
                  "This game has already started. You cannot join now."
              }
            );
          }


          if (
            party.players.length >=
            20
          ) {
            return socket.emit(
              "errorMessage",
              {
                message:
                  "This party is full."
              }
            );
          }


          const duplicateName =
            party.players.some(
              p =>
                p.name.toLowerCase() ===
                name.toLowerCase()
            );


          if (duplicateName) {
            return socket.emit(
              "errorMessage",
              {
                message:
                  "That name is already being used."
              }
            );
          }


          party.players.push({
            id:
              socket.id,

            name,

            score:
              0,

            answered:
              false,

            correct:
              false,

            pointsThisRound:
              0,

            answerId:
              null
          });


          socket.join(
            code
          );


          // Send the complete party to the new player.
          socket.emit(
            "partyJoined",
            publicParty(
              party
            )
          );


          // IMPORTANT:
          // Send the updated player list to EVERYONE,
          // including the host and all existing players.
          broadcastParty(
            party
          );


          console.log(
            `${name} joined party ${code}`
          );

        } catch (error) {
          console.error(
            error
          );

          socket.emit(
            "errorMessage",
            {
              message:
                error.message
            }
          );
        }
      }
    );


    // ========================================================
    // START PARTY
    // ========================================================

    socket.on(
      "startParty",
      () => {
        const found =
          findPlayer(
            socket.id
          );


        if (!found) {
          return socket.emit(
            "errorMessage",
            {
              message:
                "You are not in a party."
            }
          );
        }


        const {
          party
        } = found;


        if (
          party.hostId !==
          socket.id
        ) {
          return socket.emit(
            "errorMessage",
            {
              message:
                "Only the host can start the game."
            }
          );
        }


        if (party.started) {
          return;
        }


        const ready =
          getReadyVideos();


        if (
          ready.length <
          party.rounds
        ) {
          return socket.emit(
            "errorMessage",
            {
              message:
                `You need at least ${party.rounds} playable videos for a ${party.rounds}-round game. You currently have ${ready.length}.`
            }
          );
        }


        party.started =
          true;

        party.roundNumber =
          0;

        party.gameFinished =
          false;

        party.roundFinished =
          false;

        party.usedVideoIds =
          [];


        // Tell everyone immediately that the game is starting.
        broadcastParty(
          party
        );


        startNextRound(
          party
        );
      }
    );


    // ========================================================
    // SUBMIT ANSWER
    // ========================================================

    socket.on(
      "submitAnswer",
      data => {
        const found =
          findPlayer(
            socket.id
          );


        if (!found) {
          return;
        }


        const {
          party,
          player
        } = found;


        if (
          !party.started ||
          party.gameFinished ||
          party.roundFinished
        ) {
          return;
        }


        if (player.answered) {
          return;
        }


        const choiceId =
          String(
            data?.choiceId || ""
          );


        const validChoice =
          party.choices.some(
            choice =>
              choice.id ===
              choiceId
          );


        if (!validChoice) {
          return socket.emit(
            "errorMessage",
            {
              message:
                "Invalid answer."
            }
          );
        }


        player.answered =
          true;

        player.answerId =
          choiceId;


        const correct =
          choiceId ===
          party.answerId;


        player.correct =
          correct;


        let points = 0;


        if (correct) {
          const correctCount =
            party.players.filter(
              p =>
                p.correct
            ).length;


          points =
            Math.max(
              5 -
                correctCount,
              0
            );


          party.answerOrder.push(
            player.id
          );
        }


        player.pointsThisRound =
          points;


        player.score +=
          points;


        const players =
          party.players.map(
            publicPlayer
          );


        // Send the answer result to the player who answered.
        socket.emit(
          "answerAccepted",
          {
            correct,

            points,

            score:
              player.score,

            totalScore:
              player.score,

            roundNumber:
              party.roundNumber,

            players,

            scoreboard:
              players
          }
        );


        // IMPORTANT:
        // Send the NEW scores and answered states
        // to every player in the party.
        broadcastParty(
          party
        );


        const allAnswered =
          party.players.every(
            p =>
              p.answered
          );


        if (allAnswered) {
          finishRound(
            party,
            "allAnswered"
          );
        }
      }
    );


    // ========================================================
    // LEAVE PARTY
    // ========================================================

    socket.on(
      "leaveParty",
      data => {
        const partyCodeToLeave =
          String(
            data?.code ||
            data?.partyCode ||
            ""
          )
            .trim()
            .toUpperCase();


        if (!partyCodeToLeave) {
          return;
        }


        const party =
          parties.get(
            partyCodeToLeave
          );


        if (!party) {
          return;
        }


        party.players =
          party.players.filter(
            player =>
              player.id !==
              socket.id
          );


        socket.leave(
          partyCodeToLeave
        );


        if (
          party.hostId ===
          socket.id
        ) {
          party.hostId =
            party.players[0]?.id ||
            null;


          if (party.hostId) {
            io.to(
              party.code
            ).emit(
              "hostChanged",
              {
                hostId:
                  party.hostId
              }
            );
          }
        }


        if (
          party.roundTimer
        ) {
          clearTimeout(
            party.roundTimer
          );

          party.roundTimer =
            null;
        }


        if (
          party.players.length ===
          0
        ) {
          parties.delete(
            partyCodeToLeave
          );

          console.log(
            `Party ${partyCodeToLeave} deleted because everyone left`
          );

          return;
        }


        if (
          party.started &&
          !party.gameFinished &&
          !party.roundFinished &&
          party.players.every(
            player =>
              player.answered
          )
        ) {
          finishRound(
            party,
            "allAnswered"
          );

          return;
        }


        // Send the new player list to everyone remaining.
        broadcastParty(
          party
        );


        console.log(
          `Socket ${socket.id} left party ${partyCodeToLeave}`
        );
      }
    );


    // ========================================================
    // DISCONNECT
    // ========================================================

    socket.on(
      "disconnect",
      () => {
        console.log(
          `Socket disconnected: ${socket.id}`
        );

        removePlayer(
          socket
        );
      }
    );
  }
);


// ============================================================
// REMOVE PLAYER
// ============================================================

function removePlayer(socket) {
  const found =
    findPlayer(
      socket.id
    );


  if (!found) {
    return;
  }


  const {
    party
  } = found;


  party.players =
    party.players.filter(
      p =>
        p.id !==
        socket.id
    );


  // ----------------------------------------------------------
  // Party empty
  // ----------------------------------------------------------

  if (
    party.players.length ===
    0
  ) {
    if (party.roundTimer) {
      clearTimeout(
        party.roundTimer
      );
    }

    parties.delete(
      party.code
    );

    console.log(
      `Party ${party.code} deleted`
    );

    return;
  }


  // ----------------------------------------------------------
  // Host left
  // ----------------------------------------------------------

  if (
    party.hostId ===
    socket.id
  ) {
    party.hostId =
      party.players[0].id;


    io.to(
      party.code
    ).emit(
      "hostChanged",
      {
        hostId:
          party.hostId
      }
    );
  }


  // ----------------------------------------------------------
  // Everyone remaining has answered
  // ----------------------------------------------------------

  if (
    party.started &&
    !party.roundFinished &&
    party.players.length > 0 &&
    party.players.every(
      p =>
        p.answered
    )
  ) {
    finishRound(
      party,
      "allAnswered"
    );

    return;
  }


  // Send updated player list.
  broadcastParty(
    party
  );
}


// ============================================================
// START SERVER
// ============================================================

server.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      `\nGuess Game running at http://localhost:${PORT}\n`
    );
  }
);