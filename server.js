require("dotenv").config();

const express = require("express");
const crypto = require("crypto");
const path = require("path");
const http = require("http");

const { Server } = require("socket.io");
const { createClient } = require("@supabase/supabase-js");

const {
  S3Client,
  GetObjectCommand,
} = require("@aws-sdk/client-s3");

const {
  getSignedUrl,
} = require("@aws-sdk/s3-request-presigner");

// ============================================================
// APP
// ============================================================

const app = express();

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: true,
    credentials: true,
  },
});

const PORT = process.env.PORT || 3000;

// ============================================================
// PATHS
// ============================================================

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, "public");

// ============================================================
// SUPABASE
// ============================================================

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    "ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured.",
  );

  process.exit(1);
}

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
);

// ============================================================
// CLOUDFLARE R2
// ============================================================

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY =
  process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;

if (
  !R2_ACCOUNT_ID ||
  !R2_ACCESS_KEY_ID ||
  !R2_SECRET_ACCESS_KEY ||
  !R2_BUCKET_NAME
) {
  console.error(
    "ERROR: R2 environment variables must be configured.",
  );

  process.exit(1);
}

const r2 = new S3Client({
  region: "auto",

  endpoint:
    `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,

  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

// ============================================================
// MIDDLEWARE
// ============================================================

app.use(express.json());

app.use(express.static(PUBLIC));

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
    duration: Number(row.duration) || 0,

    goodSections: Array.isArray(row.good_sections)
      ? row.good_sections
      : [],

    ready: Boolean(row.ready),

    createdAt: row.created_at,

    audioUrl:
      row.audio_url || getAudioKey(row.id),
  };
}

// ============================================================
// DATABASE
// ============================================================

let videoDb = [];

async function loadDb() {
  const {
    data,
    error,
  } = await supabase
    .from("videos")
    .select("*")
    .order("created_at", {
      ascending: true,
    });

  if (error) {
    throw error;
  }

  videoDb = (data || []).map(fromSupabase);

  console.log(
    `Loaded ${videoDb.length} videos from Supabase.`,
  );

  return videoDb;
}

function readDb() {
  return videoDb;
}

// ============================================================
// R2 AUDIO
// ============================================================

async function getAudioUrl(id) {
  const key = getAudioKey(id);

  return getSignedUrl(
    r2,
    new GetObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
    }),
    {
      expiresIn: 60 * 60,
    },
  );
}

// ============================================================
// READY VIDEOS
// ============================================================

function getReadyVideos() {
  return readDb().filter(
    (video) =>
      video.ready === true &&
      Array.isArray(video.goodSections) &&
      video.goodSections.length > 0,
  );
}

function pickRandomSection(sections) {
  if (
    !Array.isArray(sections) ||
    sections.length === 0
  ) {
    return null;
  }

  const top = sections.slice(
    0,
    Math.min(sections.length, 10),
  );

  return top[
    Math.floor(Math.random() * top.length)
  ];
}

// ============================================================
// SINGLE PLAYER GAME
// ============================================================

app.get("/api/game", async (req, res) => {
  try {
    const ready = getReadyVideos();

    if (ready.length < 1) {
      return res.status(400).json({
        error: "Add at least one ready video first.",
      });
    }

    const answer =
      ready[
        Math.floor(Math.random() * ready.length)
      ];

    const choices = ready
      .map((video) => ({
        id: video.id,
        title: video.title,
      }))
      .sort(() => Math.random() - 0.5);

    const section = pickRandomSection(
      answer.goodSections,
    );

    const audioUrl = await getAudioUrl(answer.id);

    res.json({
      roundId: crypto.randomUUID(),

      answerId: answer.id,

      audioUrl,

      startTime: section?.start || 0,

      duration:
        section?.duration ||
        Math.min(answer.duration, 10),

      choices,
    });
  } catch (error) {
    console.error(
      "Could not create game:",
      error,
    );

    res.status(500).json({
      error: "Could not create game.",
    });
  }
});

// ============================================================
// MULTIPLAYER
// ============================================================

const parties = new Map();

const ROUND_OPTIONS = [
  5,
  10,
  15,
  20,
];

const ROUND_DURATION = 15 * 1000;

// ============================================================
// PARTY HELPERS
// ============================================================

function generatePartyCode() {
  const chars =
    "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  let code = "";

  do {
    code = "";

    for (let i = 0; i < 6; i++) {
      code +=
        chars[
          Math.floor(
            Math.random() * chars.length,
          )
        ];
    }
  } while (parties.has(code));

  return code;
}

function getPartyCode(data) {
  return String(
    data?.code ||
      data?.partyCode ||
      "",
  )
    .trim()
    .toUpperCase();
}

function sanitizeName(name) {
  const value = String(name || "")
    .trim()
    .slice(0, 30);

  return value || "Player";
}

function serializePlayer(player) {
  return {
    id: player.id,
    name: player.name,
    score: player.score || 0,
    answered: Boolean(player.answered),
  };
}

function serializeParty(party) {
  return {
    code: party.code,

    hostId: party.hostId,

    rounds: party.totalRounds,

    totalRounds: party.totalRounds,

    started: party.started,

    finished: party.finished,

    players: Array.from(
      party.players.values(),
    ).map(serializePlayer),
  };
}

function emitPartyUpdate(party) {
  io.to(party.code).emit(
    "partyUpdated",
    {
      party: serializeParty(party),
    },
  );
}

function getPartyPlayer(
  party,
  socketId,
) {
  return party.players.get(socketId);
}

// ============================================================
// CREATE MULTIPLAYER ROUND
// ============================================================

async function createMultiplayerRound(
  party,
) {
  const ready = getReadyVideos();

  if (ready.length < 1) {
    throw new Error(
      "There are no ready videos available.",
    );
  }

  let availableVideos = ready.filter(
    (video) =>
      !party.usedVideoIds.has(video.id),
  );

  if (availableVideos.length === 0) {
    party.usedVideoIds.clear();

    availableVideos = ready;
  }

  const answer =
    availableVideos[
      Math.floor(
        Math.random() *
          availableVideos.length,
      )
    ];

  party.usedVideoIds.add(answer.id);

  const otherChoices = ready
    .filter(
      (video) =>
        video.id !== answer.id,
    )
    .sort(() => Math.random() - 0.5)
    .slice(0, 5);

  const choices = [
    answer,
    ...otherChoices,
  ]
    .map((video) => ({
      id: video.id,
      title: video.title,
    }))
    .sort(() => Math.random() - 0.5);

  const section = pickRandomSection(
    answer.goodSections,
  );

  const audioUrl = await getAudioUrl(
    answer.id,
  );

  const round = {
    roundNumber: party.roundNumber,

    totalRounds: party.totalRounds,

    answerId: answer.id,

    audioUrl,

    startTime: section?.start || 0,

    audioDuration:
      section?.duration || 10,

    choices,
  };

  return round;
}

// ============================================================
// START NEXT ROUND
// ============================================================

async function startNextRound(party) {
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
    finishPartyGame(party);
    return;
  }

  try {
    const round =
      await createMultiplayerRound(party);

    /*
     * One official start timestamp for EVERY player.
     *
     * Give clients a little time to receive the
     * roundStarted event and prepare the audio.
     */
    const startAt =
      Date.now() + 1000;

    party.currentRound = round;

    party.roundStartedAt = startAt;

    party.roundEndsAt =
      startAt + ROUND_DURATION;

    for (
      const player of
      party.players.values()
    ) {
      player.answered = false;
      player.currentRoundPoints = 0;
    }

    /*
     * Send the exact same startAt to everyone.
     */
    io.to(party.code).emit(
      "roundStarted",
      {
        ...round,
        startAt: new Date(
          startAt,
        ).toISOString(),

        duration:
          ROUND_DURATION / 1000,
      },
    );

    if (party.roundTimer) {
      clearTimeout(
        party.roundTimer,
      );
    }

    /*
     * Server also uses the exact same timestamp.
     */
    const remaining =
      Math.max(
        0,
        party.roundEndsAt -
          Date.now(),
      );

    party.roundTimer =
      setTimeout(() => {
        finishCurrentRound(party);
      }, remaining);
  } catch (error) {
    console.error(
      "Could not start multiplayer round:",
      error,
    );

    io.to(party.code).emit(
      "partyError",
      {
        message:
          "Could not start the round.",
      },
    );
  }
}

// ============================================================
// FINISH CURRENT ROUND
// ============================================================

function finishCurrentRound(party) {
  if (!party.currentRound) {
    return;
  }

  if (party.roundFinished) {
    return;
  }

  party.roundFinished = true;

  if (party.roundTimer) {
    clearTimeout(
      party.roundTimer,
    );

    party.roundTimer = null;
  }

  const results = Array.from(
    party.players.values(),
  )
    .map((player) => ({
      id: player.id,

      name: player.name,

      score: player.score || 0,

      points:
        player.currentRoundPoints ||
        0,

      answered: Boolean(
        player.answered,
      ),
    }))
    .sort(
      (a, b) =>
        b.points - a.points,
    );

  const answer =
    getReadyVideos().find(
      (video) =>
        video.id ===
        party.currentRound
          .answerId,
    );

  io.to(party.code).emit(
    "roundFinished",
    {
      roundNumber:
        party.roundNumber,

      totalRounds:
        party.totalRounds,

      answerId:
        party.currentRound
          .answerId,

      answerTitle:
        answer?.title ||
        "Unknown",

      results,

      players: Array.from(
        party.players.values(),
      ).map(serializePlayer),
    },
  );

  party.currentRound = null;

  party.roundFinished = false;

  party.roundNumber++;

  if (
    party.roundNumber >
    party.totalRounds
  ) {
    setTimeout(() => {
      finishPartyGame(party);
    }, 1000);

    return;
  }

  setTimeout(() => {
    if (
      party.started &&
      !party.finished
    ) {
      startNextRound(party);
    }
  }, 3000);
}

// ============================================================
// FINISH PARTY GAME
// ============================================================

function finishPartyGame(party) {
  if (party.finished) {
    return;
  }

  party.finished = true;

  party.started = false;

  if (party.roundTimer) {
    clearTimeout(
      party.roundTimer,
    );

    party.roundTimer = null;
  }

  const players = Array.from(
    party.players.values(),
  )
    .map(serializePlayer)
    .sort(
      (a, b) =>
        b.score - a.score,
    );

  io.to(party.code).emit(
    "gameFinished",
    {
      players,

      scoreboard: players,

      results: players,
    },
  );
}

// ============================================================
// SOCKET CONNECTION
// ============================================================

io.on("connection", (socket) => {
  console.log(
    `Socket connected: ${socket.id}`,
  );

  // ----------------------------------------------------------
  // CREATE PARTY
  // ----------------------------------------------------------

  socket.on(
    "createParty",
    (data) => {
      try {
        const name =
          sanitizeName(
            data?.name,
          );

        let rounds =
          Number(
            data?.rounds ??
              data?.totalRounds,
          ) || 10;

        if (
          !ROUND_OPTIONS.includes(
            rounds,
          )
        ) {
          rounds = 10;
        }

        const code =
          generatePartyCode();

        const party = {
          code,

          hostId: socket.id,

          totalRounds: rounds,

          roundNumber: 1,

          started: false,

          finished: false,

          players: new Map(),

          currentRound: null,

          roundTimer: null,

          roundStartedAt: null,

          roundEndsAt: null,

          roundFinished: false,

          usedVideoIds: new Set(),
        };

        party.players.set(
          socket.id,
          {
            id: socket.id,

            name,

            score: 0,

            answered: false,

            currentRoundPoints: 0,
          },
        );

        parties.set(
          code,
          party,
        );

        socket.join(code);

        socket.data.partyCode =
          code;

        socket.emit(
          "partyCreated",
          {
            party:
              serializeParty(
                party,
              ),
          },
        );

        console.log(
          `Party created: ${code}`,
        );
      } catch (error) {
        console.error(error);

        socket.emit(
          "partyError",
          {
            message:
              "Could not create party.",
          },
        );
      }
    },
  );

  // ----------------------------------------------------------
  // JOIN PARTY
  // ----------------------------------------------------------

  socket.on(
    "joinParty",
    (data) => {
      try {
        const code =
          getPartyCode(data);

        const name =
          sanitizeName(
            data?.name,
          );

        if (!code) {
          return socket.emit(
            "partyError",
            {
              message:
                "Please enter a party code.",
            },
          );
        }

        const party =
          parties.get(code);

        if (!party) {
          return socket.emit(
            "partyError",
            {
              message:
                "Party not found.",
            },
          );
        }

        if (party.started) {
          return socket.emit(
            "partyError",
            {
              message:
                "This game has already started.",
            },
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
                "This party is full.",
            },
          );
        }

        party.players.set(
          socket.id,
          {
            id: socket.id,

            name,

            score: 0,

            answered: false,

            currentRoundPoints: 0,
          },
        );

        socket.join(code);

        socket.data.partyCode =
          code;

        socket.emit(
          "partyJoined",
          {
            party:
              serializeParty(
                party,
              ),
          },
        );

        emitPartyUpdate(
          party,
        );

        console.log(
          `${name} joined party ${code}`,
        );
      } catch (error) {
        console.error(error);

        socket.emit(
          "partyError",
          {
            message:
              "Could not join party.",
          },
        );
      }
    },
  );

  // ----------------------------------------------------------
  // START PARTY
  // ----------------------------------------------------------

  socket.on(
    "startParty",
    async (data) => {
      const code =
        getPartyCode(data);

      const party =
        parties.get(code);

      if (!party) {
        return socket.emit(
          "partyError",
          {
            message:
              "Party not found.",
          },
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
              "Only the host can start the game.",
          },
        );
      }

      if (party.started) {
        return;
      }

      if (
        party.players.size < 1
      ) {
        return socket.emit(
          "partyError",
          {
            message:
              "At least one player is required.",
          },
        );
      }

      const ready =
        getReadyVideos();

      if (ready.length < 1) {
        return socket.emit(
          "partyError",
          {
            message:
              "There are no ready videos available.",
          },
        );
      }

      party.started = true;

      party.finished = false;

      party.roundNumber = 1;

      for (
        const player of
        party.players.values()
      ) {
        player.score = 0;

        player.answered = false;

        player.currentRoundPoints = 0;
      }

      emitPartyUpdate(
        party,
      );

      await startNextRound(
        party,
      );
    },
  );

  // ----------------------------------------------------------
  // NEW GAME
  // ----------------------------------------------------------

  socket.on(
    "newGame",
    async (data) => {
      const code =
        getPartyCode(data);

      const party =
        parties.get(code);

      if (!party) {
        return socket.emit(
          "partyError",
          {
            message:
              "Party not found.",
          },
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
              "Only the host can start a new game.",
          },
        );
      }

      if (party.started) {
        return;
      }

      const ready =
        getReadyVideos();

      if (ready.length < 1) {
        return socket.emit(
          "partyError",
          {
            message:
              "There are no ready videos available.",
          },
        );
      }

      party.started = true;

      party.finished = false;

      party.roundNumber = 1;

      party.currentRound = null;

      party.roundFinished = false;

      party.roundStartedAt =
        null;

      party.roundEndsAt = null;

      party.usedVideoIds =
        new Set();

      if (party.roundTimer) {
        clearTimeout(
          party.roundTimer,
        );

        party.roundTimer = null;
      }

      for (
        const player of
        party.players.values()
      ) {
        player.score = 0;

        player.answered = false;

        player.currentRoundPoints = 0;
      }

      io.to(party.code).emit(
        "newGameStarted",
        {
          party:
            serializeParty(
              party,
            ),
        },
      );

      emitPartyUpdate(
        party,
      );

      await startNextRound(
        party,
      );
    },
  );

  // ----------------------------------------------------------
  // SUBMIT ANSWER
  // ----------------------------------------------------------

  socket.on(
    "submitAnswer",
    (data) => {
      const code =
        getPartyCode(data);

      const party =
        parties.get(code);

      if (!party) {
        return socket.emit(
          "partyError",
          {
            message:
              "Party not found.",
          },
        );
      }

      const player =
        getPartyPlayer(
          party,
          socket.id,
        );

      if (!player) {
        return socket.emit(
          "partyError",
          {
            message:
              "You are not in this party.",
          },
        );
      }

      if (
        !party.started ||
        party.finished
      ) {
        return;
      }

      if (!party.currentRound) {
        return;
      }

      if (player.answered) {
        return;
      }

      const answerId =
        data?.answerId ??
        data?.videoId ??
        null;

      player.answered = true;

      const correct =
        answerId !== null &&
        String(answerId) ===
          String(
            party.currentRound
              .answerId,
          );

      let points = 0;

      if (correct) {
        const now =
          Date.now();

        const elapsed =
          now -
          party.roundStartedAt;

        const remaining =
          Math.max(
            0,
            ROUND_DURATION -
              elapsed,
          );

        points = Math.max(
          1,
          Math.round(
            10000 *
              (remaining /
                ROUND_DURATION),
          ),
        );

        player.score +=
          points;

        player.currentRoundPoints =
          points;
      }

      io.to(party.code).emit(
        "answerAccepted",
        {
          playerId: player.id,

          correct,

          points,

          score: player.score,

          totalScore:
            player.score,

          answerId,

          correctAnswerId:
            party.currentRound
              .answerId,
        },
      );

      emitPartyUpdate(
        party,
      );

      const everyoneAnswered =
        Array.from(
          party.players.values(),
        ).every(
          (p) => p.answered,
        );

      if (everyoneAnswered) {
        finishCurrentRound(
          party,
        );
      }
    },
  );

  // ----------------------------------------------------------
  // LEAVE PARTY
  // ----------------------------------------------------------

  socket.on(
    "leaveParty",
    (data) => {
      const code =
        getPartyCode(data);

      const party =
        parties.get(code);

      if (!party) {
        return;
      }

      party.players.delete(
        socket.id,
      );

      socket.leave(code);

      socket.data.partyCode =
        null;

      if (
        party.players.size ===
        0
      ) {
        if (party.roundTimer) {
          clearTimeout(
            party.roundTimer,
          );
        }

        parties.delete(code);

        console.log(
          `Party ${code} deleted because it became empty.`,
        );

        return;
      }

      if (
        party.hostId ===
        socket.id
      ) {
        const nextHost =
          party.players.values()
            .next().value;

        if (nextHost) {
          party.hostId =
            nextHost.id;

          io.to(code).emit(
            "hostChanged",
            {
              hostId:
                nextHost.id,

              party:
                serializeParty(
                  party,
                ),
            },
          );
        }
      }

      emitPartyUpdate(
        party,
      );
    },
  );

  // ----------------------------------------------------------
  // DISCONNECT
  // ----------------------------------------------------------

  socket.on(
    "disconnect",
    () => {
      console.log(
        `Socket disconnected: ${socket.id}`,
      );

      const code =
        socket.data.partyCode;

      if (!code) {
        return;
      }

      const party =
        parties.get(code);

      if (!party) {
        return;
      }

      party.players.delete(
        socket.id,
      );

      if (
        party.players.size ===
        0
      ) {
        if (party.roundTimer) {
          clearTimeout(
            party.roundTimer,
          );
        }

        parties.delete(code);

        return;
      }

      if (
        party.hostId ===
        socket.id
      ) {
        const nextHost =
          party.players.values()
            .next().value;

        if (nextHost) {
          party.hostId =
            nextHost.id;

          io.to(code).emit(
            "hostChanged",
            {
              hostId:
                nextHost.id,

              party:
                serializeParty(
                  party,
                ),
            },
          );
        }
      }

      emitPartyUpdate(
        party,
      );
    },
  );
});

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
        console.log("");

        console.log(
          "======================================",
        );

        console.log(
          `Guess Game running on port ${PORT}`,
        );

        console.log(
          `http://localhost:${PORT}`,
        );

        console.log(
          "======================================",
        );

        console.log(
          `Loaded ${videoDb.length} online videos`,
        );

        console.log(
          `R2 bucket: ${R2_BUCKET_NAME}`,
        );

        console.log("");
      },
    );
  } catch (error) {
    console.error(
      "Failed to start server:",
      error,
    );

    process.exit(1);
  }
}

startServer();