require("dotenv").config();

const express = require("express");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const http = require("http");
const { execFile } = require("child_process");
const { promisify } = require("util");

const { Server } = require("socket.io");
const { createClient } = require("@supabase/supabase-js");

const {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand
} = require("@aws-sdk/client-s3");

const {
  getSignedUrl
} = require("@aws-sdk/s3-request-presigner");

const execFileAsync = promisify(execFile);

// ============================================================
// APP
// ============================================================

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: true,
    credentials: true
  }
});

const PORT = process.env.PORT || 3000;

// ============================================================
// PATHS
// ============================================================

const ROOT = __dirname;
const DATA = path.join(ROOT, "data");
const AUDIO = path.join(DATA, "audio");
const VIDEOS = path.join(DATA, "videos");
const PUBLIC = path.join(ROOT, "public");

fs.mkdirSync(DATA, { recursive: true });
fs.mkdirSync(AUDIO, { recursive: true });
fs.mkdirSync(VIDEOS, { recursive: true });

// ============================================================
// ENVIRONMENT
// ============================================================

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

// ============================================================
// SUPABASE
// ============================================================

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

if (
  !SUPABASE_URL ||
  !SUPABASE_SERVICE_ROLE_KEY
) {
  console.error(
    "ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured."
  );

  process.exit(1);
}

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY
);

let videoDb = [];

// ============================================================
// CLOUDFLARE R2
// ============================================================

const R2_ACCOUNT_ID =
  process.env.R2_ACCOUNT_ID;

const R2_ACCESS_KEY_ID =
  process.env.R2_ACCESS_KEY_ID;

const R2_SECRET_ACCESS_KEY =
  process.env.R2_SECRET_ACCESS_KEY;

const R2_BUCKET_NAME =
  process.env.R2_BUCKET_NAME;

if (
  !R2_ACCOUNT_ID ||
  !R2_ACCESS_KEY_ID ||
  !R2_SECRET_ACCESS_KEY ||
  !R2_BUCKET_NAME
) {
  console.error(
    "ERROR: R2 environment variables must be configured."
  );

  process.exit(1);
}

const r2 = new S3Client({
  region: "auto",

  endpoint:
    `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,

  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY
  }
});

// ============================================================
// MIDDLEWARE
// ============================================================

app.use(express.json());

app.use(
  express.static(PUBLIC)
);

// IMPORTANT:
// Do NOT expose the local audio directory anymore.
// Audio is served through signed R2 URLs.
//
// app.use("/audio", express.static(AUDIO));

// ============================================================
// SUPABASE HELPERS
// ============================================================

function getAudioKey(id) {
  return `audio/${id}.mp3`;
}

function fromSupabase(row) {
  return {
    id: row.id,

    title: row.title,

    channel: row.channel || "",

    duration:
      Number(row.duration) || 0,

    goodSections:
      Array.isArray(row.good_sections)
        ? row.good_sections
        : [],

    ready:
      Boolean(row.ready),

    createdAt:
      row.created_at,

    // Keep the database value if present.
    // Old records may contain /audio/... but
    // actual playback always uses getAudioUrl().
    audioUrl:
      row.audio_url ||
      getAudioKey(row.id)
  };
}

async function loadDb() {
  const {
    data,
    error
  } = await supabase
    .from("videos")
    .select("*")
    .order("created_at", {
      ascending: true
    });

  if (error) {
    throw error;
  }

  videoDb =
    (data || []).map(fromSupabase);

  console.log(
    `Loaded ${videoDb.length} videos from Supabase.`
  );

  return videoDb;
}

function readDb() {
  return videoDb;
}

async function insertVideo(video) {
  const row = {
    id: video.id,

    title:
      video.title ||
      `YouTube video ${video.id}`,

    channel:
      video.channel || "",

    duration:
      Number(video.duration) || 0,

    good_sections:
      Array.isArray(video.goodSections)
        ? video.goodSections
        : [],

    ready:
      Boolean(video.ready),

    created_at:
      video.createdAt ||
      new Date().toISOString(),

    audio_url:
      video.audioUrl ||
      getAudioKey(video.id)
  };

  const {
    data,
    error
  } = await supabase
    .from("videos")
    .insert(row)
    .select()
    .single();

  if (error) {
    throw error;
  }

  const result =
    fromSupabase(data);

  videoDb.push(result);

  return result;
}

async function updateVideo(
  id,
  updates
) {
  const payload = {};

  if (
    updates.title !== undefined
  ) {
    payload.title =
      updates.title;
  }

  if (
    updates.channel !== undefined
  ) {
    payload.channel =
      updates.channel;
  }

  if (
    updates.duration !== undefined
  ) {
    payload.duration =
      Number(updates.duration) || 0;
  }

  if (
    updates.goodSections !== undefined
  ) {
    payload.good_sections =
      Array.isArray(updates.goodSections)
        ? updates.goodSections
        : [];
  }

  if (
    updates.ready !== undefined
  ) {
    payload.ready =
      Boolean(updates.ready);
  }

  if (
    updates.audioUrl !== undefined
  ) {
    payload.audio_url =
      updates.audioUrl;
  }

  if (
    payload.audio_url === undefined
  ) {
    payload.audio_url =
      getAudioKey(id);
  }

  const {
    data,
    error
  } = await supabase
    .from("videos")
    .update(payload)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    throw error;
  }

  const updated =
    fromSupabase(data);

  const index =
    videoDb.findIndex(
      v => v.id === id
    );

  if (index !== -1) {
    videoDb[index] =
      updated;
  } else {
    videoDb.push(updated);
  }

  return updated;
}

async function deleteVideoFromDb(id) {
  const {
    error
  } = await supabase
    .from("videos")
    .delete()
    .eq("id", id);

  if (error) {
    throw error;
  }

  videoDb =
    videoDb.filter(
      v => v.id !== id
    );
}

// ============================================================
// R2 HELPERS
// ============================================================

async function uploadAudioToR2(
  id,
  file
) {
  const key =
    getAudioKey(id);

  console.log(
    `Uploading ${id}.mp3 to R2...`
  );

  await r2.send(
    new PutObjectCommand({
      Bucket:
        R2_BUCKET_NAME,

      Key:
        key,

      Body:
        fs.createReadStream(file),

      ContentType:
        "audio/mpeg"
    })
  );

  console.log(
    `Uploaded ${id}.mp3 to R2.`
  );

  return key;
}

async function deleteAudioFromR2(
  id
) {
  const key =
    getAudioKey(id);

  try {
    await r2.send(
      new DeleteObjectCommand({
        Bucket:
          R2_BUCKET_NAME,

        Key:
          key
      })
    );

    console.log(
      `Deleted ${key} from R2.`
    );
  } catch (error) {
    console.error(
      `Could not delete ${key} from R2:`,
      error.message
    );
  }
}

async function getAudioUrl(
  id
) {
  const key =
    getAudioKey(id);

  return getSignedUrl(
    r2,

    new GetObjectCommand({
      Bucket:
        R2_BUCKET_NAME,

      Key:
        key
    }),

    {
      expiresIn:
        60 * 60
    }
  );
}

// ============================================================
// YOUTUBE HELPERS
// ============================================================

function videoIdFromUrl(
  input
) {
  try {
    const u =
      new URL(
        input.trim()
      );

    if (
      u.hostname ===
      "youtu.be"
    ) {
      return u.pathname
        .slice(1)
        .split("/")[0];
    }

    if (
      u.hostname.includes(
        "youtube.com"
      )
    ) {
      if (
        u.pathname ===
        "/watch"
      ) {
        return u.searchParams.get(
          "v"
        );
      }

      if (
        u.pathname.startsWith(
          "/shorts/"
        )
      ) {
        return u.pathname
          .split("/")[2];
      }

      if (
        u.pathname.startsWith(
          "/embed/"
        )
      ) {
        return u.pathname
          .split("/")[2];
      }
    }
  } catch {}

  return null;
}

async function command(
  name,
  args
) {
  return execFileAsync(
    name,
    args,
    {
      maxBuffer:
        50 * 1024 * 1024
    }
  );
}

// ============================================================
// AUDIO ANALYSIS
// ============================================================

async function getDuration(
  file
) {
  const {
    stdout
  } = await command(
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

  return Number(
    stdout.trim()
  );
}

// ============================================================
// FIND GOOD SECTIONS
// ============================================================

async function findGoodSections(
  file,
  duration
) {
  console.log(
    `Analyzing audio for good sections...`
  );

  const {
    stdout
  } = await command(
    "ffmpeg",
    [
      "-hide_banner",

      "-i",
      file,

      "-vn",

      "-ac",
      "1",

      "-ar",
      "8000",

      "-f",
      "s16le",

      "-"
    ]
  );

  const buffer =
    Buffer.from(
      stdout,
      "binary"
    );

  const sampleRate =
    8000;

  const bytesPerSample =
    2;

  const totalSamples =
    Math.floor(
      buffer.length /
        bytesPerSample
    );

  const actualDuration =
    totalSamples /
    sampleRate;

  const sections = [];

  const windowDuration =
    10;

  const step =
    2;

  const subWindow =
    0.5;

  for (
    let start = 0;
    start + windowDuration <=
      Math.min(
        actualDuration,
        duration
      );
    start += step
  ) {
    let loudSubWindows = 0;
    let totalSubWindows = 0;

    let peak = 0;
    let sumSquares = 0;
    let sampleCount = 0;

    for (
      let subStart = 0;
      subStart < windowDuration;
      subStart += subWindow
    ) {
      const absoluteStart =
        start + subStart;

      const sampleStart =
        Math.floor(
          absoluteStart *
            sampleRate
        );

      const sampleEnd =
        Math.min(
          totalSamples,

          Math.floor(
            (
              absoluteStart +
              subWindow
            ) *
              sampleRate
          )
        );

      let subSumSquares = 0;
      let subSamples = 0;
      let subPeak = 0;

      for (
        let i =
          sampleStart;
        i < sampleEnd;
        i++
      ) {
        const offset =
          i *
          bytesPerSample;

        if (
          offset + 1 >=
          buffer.length
        ) {
          break;
        }

        const sample =
          buffer.readInt16LE(
            offset
          );

        const normalized =
          Math.abs(
            sample /
              32768
          );

        subPeak =
          Math.max(
            subPeak,
            normalized
          );

        subSumSquares +=
          normalized *
          normalized;

        subSamples++;
      }

      if (
        subSamples === 0
      ) {
        continue;
      }

      const rms =
        Math.sqrt(
          subSumSquares /
            subSamples
        );

      const db =
        20 *
        Math.log10(
          Math.max(
            rms,
            0.00001
          )
        );

      if (
        db > -30 &&
        subPeak > 0.04
      ) {
        loudSubWindows++;
      }

      totalSubWindows++;

      sumSquares +=
        subSumSquares;

      sampleCount +=
        subSamples;

      peak =
        Math.max(
          peak,
          subPeak
        );
    }

    if (
      totalSubWindows === 0
    ) {
      continue;
    }

    const loudRatio =
      loudSubWindows /
      totalSubWindows;

    const rms =
      Math.sqrt(
        sumSquares /
          Math.max(
            sampleCount,
            1
          )
      );

    const db =
      20 *
      Math.log10(
        Math.max(
          rms,
          0.00001
        )
      );

    let score = 0;

    if (
      loudRatio >= 0.8
    ) {
      score += 4;
    } else if (
      loudRatio >= 0.6
    ) {
      score += 3;
    } else if (
      loudRatio >= 0.4
    ) {
      score += 2;
    } else if (
      loudRatio >= 0.25
    ) {
      score += 1;
    }

    if (
      db > -18
    ) {
      score += 3;
    } else if (
      db > -24
    ) {
      score += 2;
    } else if (
      db > -30
    ) {
      score += 1;
    }

    if (
      peak > 0.5
    ) {
      score += 1;
    }

    if (
      start > 5
    ) {
      score += 1;
    }

    if (
      start <
      duration - 15
    ) {
      score += 1;
    }

    if (
      loudRatio >= 0.4 &&
      db > -32
    ) {
      sections.push({
        start:
          Number(
            start.toFixed(2)
          ),

        duration:
          windowDuration,

        score
      });
    }
  }

  sections.sort(
    (a, b) =>
      b.score -
      a.score
  );

  // Keep the best sections while
  // avoiding too many nearly identical
  // timestamps.
  const goodSections = [];

  for (
    const section of sections
  ) {
    const tooClose =
      goodSections.some(
        existing =>
          Math.abs(
            existing.start -
              section.start
          ) < 10
      );

    if (
      tooClose
    ) {
      continue;
    }

    goodSections.push(
      section
    );

    if (
      goodSections.length >=
      20
    ) {
      break;
    }
  }

  // If the analysis didn't find enough
  // sections, fall back to several
  // random 10-second windows.
  if (
    goodSections.length === 0
  ) {
    const maxStart =
      Math.max(
        0,
        duration - 10
      );

    const fallback = [];

    for (
      let i = 0;
      i < 10;
      i++
    ) {
      const start =
        Math.random() *
        maxStart;

      fallback.push({
        start:
          Number(
            start.toFixed(2)
          ),

        duration:
          Math.min(
            10,
            duration -
              start
          ),

        score: 0
      });
    }

    return fallback;
  }

  console.log(
    `Found ${goodSections.length} good sections.`
  );

  return goodSections;
}

function pickRandomSection(
  sections
) {
  if (
    !Array.isArray(
      sections
    ) ||
    sections.length === 0
  ) {
    return null;
  }

  const top =
    sections.slice(
      0,
      Math.min(
        sections.length,
        10
      )
    );

  return top[
    Math.floor(
      Math.random() *
        top.length
    )
  ];
}

// ============================================================
// YOUTUBE METADATA
// ============================================================

async function getYoutubeMetadata(
  id
) {
  try {
    const {
      stdout
    } = await command(
      "yt-dlp",
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

    const [
      title,
      channel
    ] =
      stdout
        .trim()
        .split("\t");

    return {
      title,
      channel
    };
  } catch (
    error
  ) {
    console.error(
      `Could not get metadata for ${id}:`,
      error.message
    );

    return {};
  }
}

// ============================================================
// PROCESS VIDEO
// ============================================================

async function processVideo(
  id
) {
  const outputTemplate =
    path.join(
      VIDEOS,
      `${id}.%(ext)s`
    );

  const wav =
    path.join(
      VIDEOS,
      `${id}.wav`
    );

  const mp3 =
    path.join(
      AUDIO,
      `${id}.mp3`
    );

  // ----------------------------------------------------------
  // DOWNLOAD
  // ----------------------------------------------------------

  console.log(
    `Downloading ${id}...`
  );

  await command(
    "yt-dlp",
    [
      "--no-playlist",

      "--cookies-from-browser",
      "firefox",

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
    ]
  );

  if (
    !fs.existsSync(wav)
  ) {
    throw new Error(
      "yt-dlp did not create the expected WAV file."
    );
  }

  // ----------------------------------------------------------
  // DURATION
  // ----------------------------------------------------------

  const duration =
    await getDuration(
      wav
    );

  if (
    !duration ||
    duration <= 0
  ) {
    throw new Error(
      "Could not determine video duration."
    );
  }

  // ----------------------------------------------------------
  // ANALYZE
  // ----------------------------------------------------------

  const goodSections =
    await findGoodSections(
      wav,
      duration
    );

  if (
    !goodSections.length
  ) {
    throw new Error(
      "Could not find any suitable audio sections."
    );
  }

  // ----------------------------------------------------------
  // CREATE FULL MP3
  // ----------------------------------------------------------

  console.log(
    `Converting ${id} to MP3...`
  );

  await command(
    "ffmpeg",
    [
      "-y",

      "-i",
      wav,

      "-vn",

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

      mp3
    ]
  );

  if (
    !fs.existsSync(mp3)
  ) {
    throw new Error(
      "ffmpeg did not create the expected MP3 file."
    );
  }

  // ----------------------------------------------------------
  // METADATA
  // ----------------------------------------------------------

  const meta =
    await getYoutubeMetadata(
      id
    );

  // ----------------------------------------------------------
  // UPLOAD TO R2
  // ----------------------------------------------------------

  const audioKey =
    await uploadAudioToR2(
      id,
      mp3
    );

  // WAV is no longer needed.
  fs.rmSync(
    wav,
    {
      force: true
    }
  );

  return {
    title:
      meta.title ||
      `YouTube video ${id}`,

    channel:
      meta.channel || "",

    duration,

    goodSections,

    audioUrl:
      audioKey
  };
}

// ============================================================
// READY VIDEOS
// ============================================================

function getReadyVideos() {
  return readDb().filter(
    video =>
      video.ready === true &&
      Array.isArray(
        video.goodSections
      ) &&
      video.goodSections.length > 0
  );
}

// ============================================================
// ADMIN AUTH
// ============================================================

const adminSessions =
  new Map();

const ADMIN_SESSION_DURATION =
  24 * 60 * 60 * 1000;

function parseCookies(
  request
) {
  const header =
    request.headers.cookie;

  if (!header) {
    return {};
  }

  const cookies = {};

  for (
    const part of
      header.split(";")
  ) {
    const [
      key,
      ...rest
    ] =
      part.trim().split("=");

    cookies[key] =
      decodeURIComponent(
        rest.join("=")
      );
  }

  return cookies;
}

function isAdminAuthenticated(
  req
) {
  const cookies =
    parseCookies(req);

  const token =
    cookies.admin_session;

  if (!token) {
    return false;
  }

  const session =
    adminSessions.get(
      token
    );

  if (!session) {
    return false;
  }

  if (
    Date.now() >
    session.expiresAt
  ) {
    adminSessions.delete(
      token
    );

    return false;
  }

  return true;
}

function requireAdmin(
  req,
  res,
  next
) {
  if (
    !isAdminAuthenticated(req)
  ) {
    return res
      .status(401)
      .json({
        error:
          "Unauthorized"
      });
  }

  next();
}

// ============================================================
// ADMIN LOGIN
// ============================================================

app.post(
  "/admin-login",
  (req, res) => {
    if (!ADMIN_PASSWORD) {
      return res
        .status(500)
        .json({
          error:
            "ADMIN_PASSWORD is not configured."
        });
    }

    const password =
      String(
        req.body?.password ||
        ""
      );

    if (
      password !==
      ADMIN_PASSWORD
    ) {
      return res
        .status(401)
        .json({
          error:
            "Incorrect password."
        });
    }

    const token =
      crypto.randomBytes(
        32
      ).toString("hex");

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
        `admin_session=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${Math.floor(
          ADMIN_SESSION_DURATION /
            1000
        )}`
      ]
    );

    res.json({
      ok: true
    });
  }
);

// ============================================================
// ADMIN LOGOUT
// ============================================================

app.post(
  "/admin-logout",
  (req, res) => {
    const cookies =
      parseCookies(req);

    const token =
      cookies.admin_session;

    if (token) {
      adminSessions.delete(
        token
      );
    }

    res.setHeader(
      "Set-Cookie",
      [
        "admin_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0"
      ]
    );

    res.json({
      ok: true
    });
  }
);

// ============================================================
// ADMIN PAGE
// ============================================================

app.get(
  "/admin.html",
  (req, res) => {
    if (
      !isAdminAuthenticated(req)
    ) {
      return res.redirect(
        "/"
      );
    }

    res.sendFile(
      path.join(
        PUBLIC,
        "admin.html"
      )
    );
  }
);

// ============================================================
// GET VIDEOS
// ============================================================

app.get(
  "/api/videos",
  requireAdmin,
  (req, res) => {
    res.json(
      readDb().map(
        video => ({
          id:
            video.id,

          title:
            video.title,

          channel:
            video.channel,

          duration:
            video.duration,

          ready:
            video.ready,

          createdAt:
            video.createdAt
        })
      )
    );
  }
);

// ============================================================
// ADD VIDEO
// ============================================================

app.post(
  "/api/videos",
  requireAdmin,
  async (req, res) => {
    const id =
      videoIdFromUrl(
        req.body?.url || ""
      );

    if (!id) {
      return res
        .status(400)
        .json({
          error:
            "Invalid YouTube URL."
        });
    }

    // Supabase is the source of truth.
    // Do NOT check local files because
    // local files may not exist on Render.
    const db =
      readDb();

    const alreadyExists =
      db.some(
        video =>
          video.id === id
      );

    if (
      alreadyExists
    ) {
      return res
        .status(409)
        .json({
          error:
            "This video is already in the list."
        });
    }

    const item = {
      id,

      title:
        "Processing…",

      channel:
        "",

      duration:
        0,

      goodSections:
        [],

      ready:
        false,

      createdAt:
        new Date().toISOString(),

      audioUrl:
        getAudioKey(id)
    };

    try {
      // Insert processing placeholder.
      await insertVideo(
        item
      );

      console.log(
        `Processing video ${id}...`
      );

      const result =
        await processVideo(
          id
        );

      const updated =
        await updateVideo(
          id,
          {
            title:
              result.title,

            channel:
              result.channel,

            duration:
              result.duration,

            goodSections:
              result.goodSections,

            audioUrl:
              result.audioUrl,

            ready:
              true
          }
        );

      res
        .status(201)
        .json(updated);
    } catch (
      error
    ) {
      console.error(
        `Processing failed for ${id}:`,
        error
      );

      // Clean up R2 in case the upload
      // succeeded but something afterwards failed.
      await deleteAudioFromR2(
        id
      );

      // Remove local files.
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
          AUDIO,
          `${id}-clip.mp3`
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

      fs.rmSync(
        path.join(
          VIDEOS,
          `${id}.mp3`
        ),
        {
          force: true
        }
      );

      try {
        await deleteVideoFromDb(
          id
        );
      } catch (
        cleanupError
      ) {
        console.error(
          "Could not remove failed video from Supabase:",
          cleanupError
        );
      }

      res
        .status(500)
        .json({
          error:
            `Processing failed: ${error.message}`,

          hint:
            "Make sure yt-dlp, ffmpeg and ffprobe are installed and available in PATH."
        });
    }
  }
);

// ============================================================
// DELETE VIDEO
// ============================================================

app.delete(
  "/api/videos/:id",
  requireAdmin,
  async (req, res) => {
    const id =
      req.params.id;

    try {
      // Delete R2 object first.
      await deleteAudioFromR2(
        id
      );

      // Delete database record.
      await deleteVideoFromDb(
        id
      );

      // Remove any old local files.
      for (
        const filename of [
          `${id}.mp3`,
          `${id}-clip.mp3`
        ]
      ) {
        fs.rmSync(
          path.join(
            AUDIO,
            filename
          ),
          {
            force: true
          }
        );
      }

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
    } catch (
      error
    ) {
      console.error(
        `Could not delete ${id}:`,
        error
      );

      res
        .status(500)
        .json({
          error:
            error.message
        });
    }
  }
);

// ============================================================
// SINGLE PLAYER GAME
// ============================================================

app.get(
  "/api/game",
  async (req, res) => {
    try {
      const ready =
        getReadyVideos();

      if (
        ready.length < 1
      ) {
        return res
          .status(400)
          .json({
            error:
              "Add at least one ready video first."
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
          .map(
            video => ({
              id:
                video.id,

              title:
                video.title
            })
          )
          .sort(
            () =>
              Math.random() -
              0.5
          );

      const audioUrl =
        await getAudioUrl(
          answer.id
        );

      res.json({
        roundId:
          crypto.randomUUID(),

        answerId:
          answer.id,

        audioUrl,
        duration: answer.duration,

        choices
      });
    } catch (
      error
    ) {
      console.error(
        "Could not create game:",
        error
      );

      res
        .status(500)
        .json({
          error:
            "Could not create game."
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
  20 * 1000;

// ============================================================
// PARTY HELPERS
// ============================================================

function generatePartyCode() {
  const chars =
    "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  let code = "";

  do {
    code = "";

    for (
      let i = 0;
      i < 6;
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

function getPartyCode(
  data
) {
  return String(
    data?.code ||
    data?.partyCode ||
    ""
  )
    .trim()
    .toUpperCase();
}

function sanitizeName(
  name
) {
  const value =
    String(
      name || ""
    )
      .trim()
      .slice(0, 30);

  return (
    value ||
    "Player"
  );
}

function serializePlayer(
  player
) {
  return {
    id:
      player.id,

    name:
      player.name,

    score:
      player.score || 0,

    answered:
      Boolean(
        player.answered
      )
  };
}

function serializeParty(
  party
) {
  return {
    code:
      party.code,

    hostId:
      party.hostId,

    rounds:
      party.totalRounds,

    totalRounds:
      party.totalRounds,

    started:
      party.started,

    finished:
      party.finished,

    players:
      Array.from(
        party.players.values()
      ).map(
        serializePlayer
      )
  };
}

function emitPartyUpdate(
  party
) {
  io.to(
    party.code
  ).emit(
    "partyUpdated",
    {
      party:
        serializeParty(
          party
        )
    }
  );
}

function getPartyPlayer(
  party,
  socketId
) {
  return party.players.get(
    socketId
  );
}

// ============================================================
// CREATE MULTIPLAYER ROUND
// ============================================================

async function createMultiplayerRound(
  party
) {
  const ready =
    getReadyVideos();

  if (
    ready.length < 1
  ) {
    throw new Error(
      "There are no ready videos available."
    );
  }

  const answer =
    ready[
      Math.floor(
        Math.random() *
          ready.length
      )
    ];

  const otherChoices = ready
    .filter(video => video.id !== answer.id)
    .sort(() => Math.random() - 0.5)
    .slice(0, 5);

  const choices = [answer, ...otherChoices]
    .map(video => ({
      id: video.id,
      title: video.title
    }))
    .sort(() => Math.random() - 0.5);

  const section =
    pickRandomSection(
      answer.goodSections
    );

  const audioUrl =
    await getAudioUrl(
      answer.id
    );

  const roundId =
    crypto.randomUUID();

    const round = {
      roundNumber: party.roundNumber,
      totalRounds: party.totalRounds,
      answerId: answer.id,
      audioUrl,
      startTime: section?.start || 0,
      audioDuration: section?.duration || 10,
      choices
    };

    return round;

  // return {
  //   roundId,

  //   answerId:
  //     answer.id,

  //   audioUrl,

  //   clipStart:
  //     section?.start || 0,

  //   clipDuration:
  //     section?.duration ||
  //     10,

  //   choices,

  //   roundNumber:
  //     party.roundNumber,

  //   totalRounds:
  //     party.totalRounds,

  //   duration:
  //     20,

  //   startAt:
  //     Date.now() +
  //     1000
  // };
}

// ============================================================
// START NEXT ROUND
// ============================================================

async function startNextRound(
  party
) {
  if (
    !party.started ||
    party.finished
  ) {
    return;
  }

  if (
    party.roundNumber >
    party.totalRounds
  ) {
    finishPartyGame(
      party
    );

    return;
  }

  try {
    const round =
      await createMultiplayerRound(
        party
      );

    party.currentRound =
      round;

    party.roundStartedAt =
      Date.now();

    party.roundEndsAt =
      Date.now() +
      ROUND_DURATION;

    for (
      const player of
        party.players.values()
    ) {
      player.answered =
        false;

      player.currentRoundPoints =
        0;
    }

    io.to(
      party.code
    ).emit(
      "roundStarted",
      round
    );

    if (
      party.roundTimer
    ) {
      clearTimeout(
        party.roundTimer
      );
    }

    party.roundTimer =
      setTimeout(
        () => {
          finishCurrentRound(
            party
          );
        },
        ROUND_DURATION
      );
  } catch (
    error
  ) {
    console.error(
      "Could not start multiplayer round:",
      error
    );

    io.to(
      party.code
    ).emit(
      "partyError",
      {
        message:
          "Could not start the round."
      }
    );
  }
}

// ============================================================
// FINISH CURRENT ROUND
// ============================================================

function finishCurrentRound(
  party
) {
  if (
    !party.currentRound
  ) {
    return;
  }

  if (
    party.roundFinished
  ) {
    return;
  }

  party.roundFinished =
    true;

  if (
    party.roundTimer
  ) {
    clearTimeout(
      party.roundTimer
    );

    party.roundTimer =
      null;
  }

  const results =
    Array.from(
      party.players.values()
    )
      .map(
        player => ({
          id:
            player.id,

          name:
            player.name,

          score:
            player.score || 0,

          points:
            player.currentRoundPoints ||
            0,

          answered:
            Boolean(
              player.answered
            )
        })
      )
      .sort(
        (a, b) =>
          b.points -
          a.points
      );

  const answer =
    getReadyVideos().find(
      video =>
        video.id ===
        party.currentRound.answerId
    );

  io.to(
    party.code
  ).emit(
    "roundFinished",
    {
      roundNumber:
        party.roundNumber,

      totalRounds:
        party.totalRounds,

      answerId:
        party.currentRound.answerId,

      answerTitle:
        answer?.title ||
        "Unknown",

      results,

      players:
        Array.from(
          party.players.values()
        ).map(
          serializePlayer
        )
    }
  );

  party.currentRound =
    null;

  party.roundFinished =
    false;

  party.roundNumber++;

  if (
    party.roundNumber >
    party.totalRounds
  ) {
    setTimeout(
      () => {
        finishPartyGame(
          party
        );
      },
      2500
    );

    return;
  }

  setTimeout(
    () => {
      if (
        party.started &&
        !party.finished
      ) {
        startNextRound(
          party
        );
      }
    },
    2500
  );
}

// ============================================================
// FINISH PARTY GAME
// ============================================================

function finishPartyGame(
  party
) {
  if (
    party.finished
  ) {
    return;
  }

  party.finished =
    true;

  party.started =
    false;

  if (
    party.roundTimer
  ) {
    clearTimeout(
      party.roundTimer
    );

    party.roundTimer =
      null;
  }

  const players =
    Array.from(
      party.players.values()
    )
      .map(
        serializePlayer
      )
      .sort(
        (a, b) =>
          b.score -
          a.score
      );

  io.to(
    party.code
  ).emit(
    "gameFinished",
    {
      players,

      scoreboard:
        players,

      results:
        players
    }
  );
}

// ============================================================
// SOCKET CONNECTION
// ============================================================

io.on(
  "connection",
  socket => {
    console.log(
      `Socket connected: ${socket.id}`
    );

    // --------------------------------------------------------
    // CREATE PARTY
    // --------------------------------------------------------

    socket.on(
      "createParty",
      data => {
        try {
          const name =
            sanitizeName(
              data?.name
            );

          let rounds =
            Number(
              data?.rounds ??
              data?.totalRounds
            ) || 10;

          if (
            !ROUND_OPTIONS.includes(
              rounds
            )
          ) {
            rounds = 10;
          }

          const code =
            generatePartyCode();

          const party = {
            code,

            hostId:
              socket.id,

            totalRounds:
              rounds,

            roundNumber:
              1,

            started:
              false,

            finished:
              false,

            players:
              new Map(),

            currentRound:
              null,

            roundTimer:
              null,

            roundStartedAt:
              null,

            roundEndsAt:
              null,

            roundFinished:
              false
          };

          party.players.set(
            socket.id,
            {
              id:
                socket.id,

              name,

              score:
                0,

              answered:
                false,

              currentRoundPoints:
                0
            }
          );

          parties.set(
            code,
            party
          );

          socket.join(
            code
          );

          socket.data.partyCode =
            code;

          socket.emit(
            "partyCreated",
            {
              party:
                serializeParty(
                  party
                )
            }
          );

          console.log(
            `Party created: ${code}`
          );
        } catch (
          error
        ) {
          console.error(
            error
          );

          socket.emit(
            "partyError",
            {
              message:
                "Could not create party."
            }
          );
        }
      }
    );

    // --------------------------------------------------------
    // JOIN PARTY
    // --------------------------------------------------------

    socket.on(
      "joinParty",
      data => {
        try {
          const code =
            getPartyCode(
              data
            );

          const name =
            sanitizeName(
              data?.name
            );

          if (!code) {
            return socket.emit(
              "partyError",
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
              "partyError",
              {
                message:
                  "Party not found."
              }
            );
          }

          if (
            party.started
          ) {
            return socket.emit(
              "partyError",
              {
                message:
                  "This game has already started."
              }
            );
          }

          if (
            party.players.size >=
            20
          ) {
            return socket.emit(
              "partyError",
              {
                message:
                  "This party is full."
              }
            );
          }

          party.players.set(
            socket.id,
            {
              id:
                socket.id,

              name,

              score:
                0,

              answered:
                false,

              currentRoundPoints:
                0
            }
          );

          socket.join(
            code
          );

          socket.data.partyCode =
            code;

          socket.emit(
            "partyJoined",
            {
              party:
                serializeParty(
                  party
                )
            }
          );

          emitPartyUpdate(
            party
          );

          console.log(
            `${name} joined party ${code}`
          );
        } catch (
          error
        ) {
          console.error(
            error
          );

          socket.emit(
            "partyError",
            {
              message:
                "Could not join party."
            }
          );
        }
      }
    );

    // --------------------------------------------------------
    // START PARTY
    // --------------------------------------------------------

    socket.on(
      "startParty",
      async data => {
        const code =
          getPartyCode(
            data
          );

        const party =
          parties.get(
            code
          );

        if (!party) {
          return socket.emit(
            "partyError",
            {
              message:
                "Party not found."
            }
          );
        }

        if (
          party.hostId !==
          socket.id
        ) {
          return socket.emit(
            "partyError",
            {
              message:
                "Only the host can start the game."
            }
          );
        }

        if (
          party.started
        ) {
          return;
        }

        if (
          party.players.size <
          1
        ) {
          return socket.emit(
            "partyError",
            {
              message:
                "At least one player is required."
            }
          );
        }

        const ready =
          getReadyVideos();

        if (
          ready.length < 1
        ) {
          return socket.emit(
            "partyError",
            {
              message:
                "There are no ready videos available."
            }
          );
        }

        party.started =
          true;

        party.finished =
          false;

        party.roundNumber =
          1;

        for (
          const player of
            party.players.values()
        ) {
          player.score =
            0;

          player.answered =
            false;

          player.currentRoundPoints =
            0;
        }

        emitPartyUpdate(
          party
        );

        await startNextRound(
          party
        );
      }
    );

    // --------------------------------------------------------
    // SUBMIT ANSWER
    // --------------------------------------------------------

    socket.on(
      "submitAnswer",
      data => {
        const code =
          getPartyCode(
            data
          );

        const party =
          parties.get(
            code
          );

        if (!party) {
          return socket.emit(
            "partyError",
            {
              message:
                "Party not found."
            }
          );
        }

        const player =
          getPartyPlayer(
            party,
            socket.id
          );

        if (!player) {
          return socket.emit(
            "partyError",
            {
              message:
                "You are not in this party."
            }
          );
        }

        if (
          !party.started ||
          party.finished
        ) {
          return;
        }

        if (
          !party.currentRound
        ) {
          return;
        }

        if (
          player.answered
        ) {
          return;
        }

        const answerId =
          data?.answerId ??
          data?.videoId ??
          null;

        player.answered =
          true;

        const correct =
          answerId !== null &&
          String(
            answerId
          ) ===
          String(
            party.currentRound
              .answerId
          );

        let points = 0;

        if (
          correct
        ) {
          const now =
            Date.now();

          const elapsed =
            now -
            party.roundStartedAt;

          const remaining =
            Math.max(
              0,
              ROUND_DURATION -
                elapsed
            );

          points =
            Math.max(
              1,
              Math.round(
                100 *
                  (
                    remaining /
                    ROUND_DURATION
                  )
              )
            );

          player.score +=
            points;

          player.currentRoundPoints =
            points;
        }

        socket.emit(
          "answerAccepted",
          {
            correct,

            points,

            score:
              player.score,

            totalScore:
              player.score
          }
        );

        emitPartyUpdate(
          party
        );

        const everyoneAnswered =
          Array.from(
            party.players.values()
          ).every(
            p =>
              p.answered
          );

        if (
          everyoneAnswered
        ) {
          finishCurrentRound(
            party
          );
        }
      }
    );

    // --------------------------------------------------------
    // LEAVE PARTY
    // --------------------------------------------------------

    socket.on(
      "leaveParty",
      data => {
        const code =
          getPartyCode(
            data
          );

        const party =
          parties.get(
            code
          );

        if (!party) {
          return;
        }

        party.players.delete(
          socket.id
        );

        socket.leave(
          code
        );

        socket.data.partyCode =
          null;

        if (
          party.players.size ===
          0
        ) {
          if (
            party.roundTimer
          ) {
            clearTimeout(
              party.roundTimer
            );
          }

          parties.delete(
            code
          );

          console.log(
            `Party ${code} deleted because it became empty.`
          );

          return;
        }

        // If the host leaves, transfer
        // host to another player.
        if (
          party.hostId ===
          socket.id
        ) {
          const nextHost =
            party.players
              .values()
              .next()
              .value;

          if (
            nextHost
          ) {
            party.hostId =
              nextHost.id;

            io.to(
              code
            ).emit(
              "hostChanged",
              {
                hostId:
                  nextHost.id,

                party:
                  serializeParty(
                    party
                  )
              }
            );
          }
        }

        emitPartyUpdate(
          party
        );
      }
    );

    // --------------------------------------------------------
    // DISCONNECT
    // --------------------------------------------------------

    socket.on(
      "disconnect",
      () => {
        console.log(
          `Socket disconnected: ${socket.id}`
        );

        const code =
          socket.data.partyCode;

        if (!code) {
          return;
        }

        const party =
          parties.get(
            code
          );

        if (!party) {
          return;
        }

        party.players.delete(
          socket.id
        );

        if (
          party.players.size ===
          0
        ) {
          if (
            party.roundTimer
          ) {
            clearTimeout(
              party.roundTimer
            );
          }

          parties.delete(
            code
          );

          return;
        }

        if (
          party.hostId ===
          socket.id
        ) {
          const nextHost =
            party.players
              .values()
              .next()
              .value;

          if (
            nextHost
          ) {
            party.hostId =
              nextHost.id;

            io.to(
              code
            ).emit(
              "hostChanged",
              {
                hostId:
                  nextHost.id,

                party:
                  serializeParty(
                    party
                  )
              }
            );
          }
        }

        emitPartyUpdate(
          party
        );
      }
    );
  }
);

// ============================================================
// START SERVER
// ============================================================

async function startServer() {
  try {
    await loadDb();

    server.listen(
      PORT,
      "0.0.0.0",
      () => {
        console.log(
          ""
        );

        console.log(
          "======================================"
        );

        console.log(
          `Guess Game running on port ${PORT}`
        );

        console.log(
          `http://localhost:${PORT}`
        );

        console.log(
          "======================================"
        );

        console.log(
          `Loaded ${videoDb.length} videos`
        );

        console.log(
          `R2 bucket: ${R2_BUCKET_NAME}`
        );

        console.log(
          ""
        );
      }
    );
  } catch (
    error
  ) {
    console.error(
      "Failed to start server:",
      error
    );

    process.exit(1);
  }
}

startServer();