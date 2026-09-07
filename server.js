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
const DATA = path.join(ROOT, "data");
const DB = path.join(DATA, "videos.json");
const AUDIO = path.join(DATA, "audio");
const VIDEOS = path.join(DATA, "videos");

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


// ============================================================
// DATABASE
// ============================================================

function readDb() {
  return JSON.parse(
    fs.readFileSync(DB, "utf8")
  );
}

function writeDb(videos) {
  fs.writeFileSync(
    DB,
    JSON.stringify(videos, null, 2)
  );
}


// ============================================================
// YOUTUBE HELPERS
// ============================================================

function videoIdFromUrl(input) {
  try {
    const u = new URL(input.trim());

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
  return execFileAsync(name, args, {
    maxBuffer: 20 * 1024 * 1024
  });
}


// ============================================================
// VIDEO PROCESSING
// ============================================================

async function processVideo(id) {
  const outputTemplate = path.join(
    VIDEOS,
    `${id}.%(ext)s`
  );

  console.log(
    `Downloading audio for ${id}...`
  );

  await command(YTDLP, [
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

  console.log(
    `Detecting silence for ${id}...`
  );

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

  const [a, b] =
    candidates[
      Math.floor(
        Math.random() *
          candidates.length
      )
    ];

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

  fs.rmSync(wav, {
    force: true
  });

  console.log(
    `Clip created: ${clip}`
  );

  const meta =
    await getYoutubeMetadata(id);

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
    const { stdout } =
      await command(YTDLP, [
        "--no-playlist",
        "--cookies-from-browser",
        "firefox",
        "--print",
        "%(title)s",
        "--skip-download",
        `https://www.youtube.com/watch?v=${id}`
      ]);

    return {
      title: stdout.trim()
    };
  } catch (error) {
    console.error(
      "Could not get YouTube title:",
      error.message
    );

    return {};
  }
}


// ============================================================
// SINGLE PLAYER API
// ============================================================

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

    const alreadyExists =
      db.some(v => v.id === id);

    const clipExists =
      fs.existsSync(
        path.join(
          AUDIO,
          `${id}-clip.mp3`
        )
      );

    if (
      alreadyExists ||
      clipExists
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

      const currentDb =
        readDb().filter(
          v => v.id !== id
        );

      writeDb(currentDb);

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


app.get(
  "/api/game",
  (req, res) => {
    const videos = readDb();

    const ready =
      videos.filter(v => {
        const audioFile =
          path.join(
            AUDIO,
            `${v.id}-clip.mp3`
          );

        return fs.existsSync(
          audioFile
        );
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


// ============================================================
// MULTIPLAYER
// ============================================================

const parties = new Map();

const ROUND_OPTIONS = [
  5,
  10,
  15,
  20
];

const ROUND_DURATION = 20;


// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

function generatePartyCode() {
  const chars =
    "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  let code = "";

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


function getReadyVideos() {
  const videos = readDb();

  return videos.filter(v => {
    return fs.existsSync(
      path.join(
        AUDIO,
        `${v.id}-clip.mp3`
      )
    );
  });
}


function publicParty(party) {
  return {
    code: party.code,

    hostId:
      party.hostId,

    started:
      party.started,

    rounds:
      party.rounds,

    roundNumber:
      party.roundNumber,

    players:
      party.players.map(p => ({
        id: p.id,
        name: p.name,
        score: p.score,
        answered: p.answered
      }))
  };
}


function broadcastParty(party) {
  io.to(
    party.code
  ).emit(
    "partyUpdated",
    publicParty(party)
  );
}


function findPlayer(socketId) {
  for (const party of parties.values()) {
    const player =
      party.players.find(
        p => p.id === socketId
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


// ------------------------------------------------------------
// Create multiplayer round
// ------------------------------------------------------------

function createMultiplayerRound(party) {
  const ready =
    getReadyVideos();

  if (ready.length < 6) {
    throw new Error(
      "At least 6 playable videos are required for multiplayer."
    );
  }

  const shuffled =
    [...ready].sort(
      () =>
        Math.random() - 0.5
    );

  const answer =
    shuffled[0];

  const choices =
    shuffled
      .slice(0, 6)
      .map(v => ({
        id: v.id,
        title: v.title
      }))
      .sort(
        () =>
          Math.random() - 0.5
      );

  party.answerId =
    answer.id;

  party.choices =
    choices;

  party.answerOrder = [];

  party.players.forEach(
    player => {
      player.answered = false;
      player.correct = false;
      player.pointsThisRound = 0;
      player.answerId = null;
    }
  );

  party.roundNumber++;

  // Start a little in the future so
  // clients have time to receive the event.
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
      `/audio/${answer.id}-clip.mp3`,

    startAt,

    duration:
      ROUND_DURATION
  };
}


// ------------------------------------------------------------
// Start round
// ------------------------------------------------------------

function startNextRound(party) {
  if (!parties.has(party.code)) {
    return;
  }

  if (
    party.roundNumber >=
    party.rounds
  ) {
    finishGame(party);
    return;
  }

  const round =
    createMultiplayerRound(
      party
    );

  io.to(
    party.code
  ).emit(
    "roundStarted",
    round
  );

  broadcastParty(party);

  console.log(
    `Party ${party.code}: starting round ${party.roundNumber}/${party.rounds}`
  );

  party.roundTimer =
    setTimeout(() => {
      if (
        parties.has(party.code) &&
        party.started
      ) {
        finishRound(
          party,
          "timeout"
        );
      }
    }, (ROUND_DURATION + 2) * 1000);
}


// ------------------------------------------------------------
// Finish round
// ------------------------------------------------------------

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
      v => v.id === party.answerId
    );

  const results =
    party.players
      .map(player => ({
        playerId:
          player.id,

        name:
          player.name,

        correct:
          player.correct,

        points:
          player.pointsThisRound,

        totalScore:
          player.score
      }))
      .sort(
        (a, b) =>
          b.points - a.points
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

      players:
        party.players.map(
          player => ({
            id:
              player.id,

            name:
              player.name,

            score:
              player.score
          })
        ),

      reason
    }
  );

  broadcastParty(party);

  // If this was the last round,
  // finish the entire game.
  if (
    party.roundNumber >=
    party.rounds
  ) {
    setTimeout(() => {
      finishGame(party);
    }, 3500);

    return;
  }

  // Otherwise start next round.
  setTimeout(() => {
    if (
      parties.has(party.code) &&
      party.started
    ) {
      party.roundFinished =
        false;

      startNextRound(
        party
      );
    }
  }, 3500);
}


// ------------------------------------------------------------
// Finish complete game
// ------------------------------------------------------------

function finishGame(party) {
  if (
    !parties.has(party.code)
  ) {
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

  const finalPlayers =
    [...party.players]
      .sort(
        (a, b) =>
          b.score - a.score
      )
      .map(
        (player, index) => ({
          id:
            player.id,

          name:
            player.name,

          score:
            player.score,

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

      players:
        finalPlayers
    }
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


    // --------------------------------------------------------
    // CREATE PARTY
    // --------------------------------------------------------

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

          if (
            name.length > 20
          ) {
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
            ready.length < 6
          ) {
            return socket.emit(
              "errorMessage",
              {
                message:
                  `You need at least 6 playable videos. You currently have ${ready.length}.`
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

          socket.join(code);

          socket.emit(
            "partyCreated",
            publicParty(party)
          );

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


    // --------------------------------------------------------
    // JOIN PARTY
    // --------------------------------------------------------

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

          if (
            name.length > 20
          ) {
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
            parties.get(code);

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

          if (party.players.length >= 20) {
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

          socket.join(code);

          socket.emit(
            "partyJoined",
            publicParty(party)
          );

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


    // --------------------------------------------------------
    // START PARTY
    // --------------------------------------------------------

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
          ready.length < 6
        ) {
          return socket.emit(
            "errorMessage",
            {
              message:
                `You need at least 6 playable videos. You currently have ${ready.length}.`
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

        broadcastParty(
          party
        );

        startNextRound(
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

          // First correct = 5
          // Second = 4
          // Third = 3
          // Fourth = 2
          // Fifth = 1
          // Sixth = 0
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

        socket.emit(
          "answerAccepted",
          {
            correct,
            points,

            roundNumber:
              party.roundNumber
          }
        );

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


    // --------------------------------------------------------
    // LEAVE PARTY
    // --------------------------------------------------------

    socket.on(
      "leaveParty",
      () => {
        removePlayer(
          socket
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

  // No players left.
  if (
    party.players.length === 0
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

  // If host leaves, give host
  // control to the next player.
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

  // If the game is running and
  // everyone remaining has answered,
  // finish the round.
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
  }

  broadcastParty(
    party
  );
}


// ============================================================
// START SERVER
// ============================================================

server.listen(
  PORT,
  () => {
    console.log(
      `\nGuess Game running at http://localhost:${PORT}\n`
    );
  }
);