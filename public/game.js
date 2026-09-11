const socket = io();

const $ = (selector) => document.querySelector(selector);

// ============================================================
// SINGLE PLAYER REVEAL TIMINGS
// ============================================================
//
// Change ONLY this list when you want different reveal times.
//
// Example:
// [0.3, 0.5, 1, 5, 10]
//
// The game will automatically progress through the list
// when the player clicks "I don't know".
//
// ============================================================

const SINGLE_REVEAL_TIMINGS = [
  0.5,
  1,
  3,
  5,
  10
];

// ============================================================
// SINGLE PLAYER DOM
// ============================================================

const singleTab = $("#singleTab");
const multiTab = $("#multiTab");

const singlePlayer = $("#singlePlayer");
const multiplayer = $("#multiplayer");

const setup = $("#setup");
const startBtn = $("#startBtn");
const setupError = $("#setupError");

const game = $("#game");

const scoreEl = $("#score");
const clipTimeEl = $("#clipTime");
const roundEl = $("#round");

const audio = $("#audio");
const playBtn = $("#playBtn");
const progressEl = $("#progress");
const durationLabel = $("#durationLabel");

const answerInput = $("#answerInput");
const suggestions = $("#suggestions");
const dontKnowBtn = $("#dontKnow");

const result = $("#result");
const clipAudio = $("#clipAudio");

// ============================================================
// MULTIPLAYER DOM
// ============================================================

const multiSetup = $("#multiSetup");
const multiSetupError = $("#multiSetupError");

const createName = $("#createName");
const joinName = $("#joinName");
const partyCodeInput = $("#partyCodeInput");
const roundCount = $("#roundCount");

const createPartyBtn = $("#createPartyBtn");
const joinPartyBtn = $("#joinPartyBtn");

const multiLobby = $("#multiLobby");
const partyCode = $("#partyCode");
const leavePartyBtn = $("#leavePartyBtn");
const lobbyRounds = $("#lobbyRounds");
const playerList = $("#playerList");
const startPartyBtn = $("#startPartyBtn");
const lobbyHint = $("#lobbyHint");

const multiGame = $("#multiGame");

const multiRoundCurrent = $("#multiRoundCurrent");
const multiRoundTotal = document.querySelector(
  ".multi-round-total"
);
const multiRoundProgress = $("#multiRoundProgress");

const multiScore = $("#multiScore");
const multiPlayerCount = $("#multiPlayerCount");

const multiAudio = $("#multiAudio");
const multiPlayBtn = $("#multiPlayBtn");
const multiProgress = $("#multiProgress");
const multiDuration = $("#multiDuration");

const multiChoices = $("#multiChoices");
const multiAnswerStatus = $("#multiAnswerStatus");
const multiScoreboard = $("#multiScoreboard");

const multiRoundResult = $("#multiRoundResult");
const roundAnswer = $("#roundAnswer");
const roundResults = $("#roundResults");

const multiFinalResult = $("#multiFinalResult");
const finalScoreboard = $("#finalScoreboard");
const finalLeaveBtn = $("#finalLeaveBtn");
const finalNewGameBtn = $("#finalNewGameBtn");

// ============================================================
// SINGLE PLAYER STATE
// ============================================================

const singleState = {
  score: 0,
  round: 0,

  roundId: null,
  answerId: null,
  choices: [],

  startTime: 0,
  audioDuration: 0,

  revealDuration:
    SINGLE_REVEAL_TIMINGS[0],

  playing: false,
  answered: false,

  gameActive: false,

  clipTimer: null,
  progressAnimation: null
};

// ============================================================
// MULTIPLAYER STATE
// ============================================================

const multiState = {
  inParty: false,
  partyCode: null,
  isHost: false,
  hostId: null,

  players: [],

  started: false,
  finished: false,

  roundNumber: 0,
  totalRounds: 10,

  duration: 20,

  audioDuration: 0,
  startTime: 0,
  startAt: null,

  choices: [],
  answered: false,
  selectedAnswerId: null,
  timeUp: false,

  clipTimer: null,
  countdownTimer: null,
  timer: null,
  progressAnimation: null
};

// ============================================================
// INITIALIZATION
// ============================================================

document.addEventListener(
  "DOMContentLoaded",
  initialize
);

function initialize() {
  setupTabs();
  setupSinglePlayer();
  setupMultiplayer();

  resetSingleState();
  resetMultiState();

  showSingleMode();
}

// ============================================================
// MODE SWITCHING
// ============================================================

function setupTabs() {
  singleTab?.addEventListener(
    "click",
    () => {
      if (
        singleTab?.classList.contains("active")
      ) {
        return;
      }

      if (
        multiState.started ||
        multiplayerGameActive()
      ) {
        const confirmed = confirm(
          "Are you sure you want to switch to Single Player?\n\n" +
          "Your current multiplayer game will be ended."
        );

        if (!confirmed) {
          return;
        }

        endMultiplayerGame(true);
      }

      showSingleMode();
    }
  );

  multiTab?.addEventListener(
    "click",
    () => {
      if (
        multiTab?.classList.contains("active")
      ) {
        return;
      }

      if (singleState.gameActive) {
        const confirmed = confirm(
          "Are you sure you want to switch to Multiplayer?\n\n" +
          "Your current single-player game will be ended."
        );

        if (!confirmed) {
          return;
        }

        endSinglePlayerGame();
      }

      showMultiMode();
    }
  );
}

// ============================================================
// CHECK MULTIPLAYER GAME STATE
// ============================================================

function multiplayerGameActive() {
  return (
    multiState.inParty &&
    !multiState.finished &&
    (
      multiState.started ||
      multiState.roundNumber > 0
    )
  );
}

// ============================================================
// SHOW SINGLE PLAYER
// ============================================================

function showSingleMode() {
  singleTab?.classList.add("active");
  multiTab?.classList.remove("active");

  singlePlayer?.classList.remove("hidden");
  multiplayer?.classList.add("hidden");
}

// ============================================================
// SHOW MULTIPLAYER
// ============================================================

function showMultiMode() {
  singleTab?.classList.remove("active");
  multiTab?.classList.add("active");

  singlePlayer?.classList.add("hidden");
  multiplayer?.classList.remove("hidden");

  if (!multiState.inParty) {
    showMultiSetup();
  } else if (multiState.finished) {
    showMultiFinal();
  } else if (multiState.started) {
    showMultiGame();
  } else {
    showMultiLobby();
  }
}

// ============================================================
// END SINGLE PLAYER GAME
// ============================================================

function endSinglePlayerGame() {
  clearSingleTimers();
  stopSingleAudio();

  singleState.gameActive = false;
  singleState.score = 0;
  singleState.round = 0;
  singleState.roundId = null;
  singleState.answerId = null;
  singleState.choices = [];
  singleState.startTime = 0;
  singleState.audioDuration = 0;

  singleState.revealDuration =
    SINGLE_REVEAL_TIMINGS[0];

  singleState.playing = false;
  singleState.answered = false;

  if (audio) {
    audio.pause();
    audio.currentTime = 0;
    audio.removeAttribute("src");
    audio.load();
  }

  if (clipAudio) {
    clipAudio.pause();
    clipAudio.currentTime = 0;
    clipAudio.removeAttribute("src");
    clipAudio.load();
  }

  hideSuggestions();
  removeSingleActionButtons();

  if (answerInput) {
    answerInput.value = "";
    answerInput.disabled = false;
  }

  if (dontKnowBtn) {
    dontKnowBtn.disabled = false;
    dontKnowBtn.textContent = "I don't know";
  }

  if (result) {
    result.className = "result hidden";
    result.textContent = "";
  }

  resetSingleUI();
}

// ============================================================
// END MULTIPLAYER GAME
// ============================================================

function endMultiplayerGame(sendLeave = true) {
  if (
    sendLeave &&
    multiState.inParty &&
    multiState.partyCode
  ) {
    socket.emit(
      "leaveParty",
      {
        code: multiState.partyCode,
        partyCode: multiState.partyCode
      }
    );
  }

  clearMultiTimers();
  stopMultiAudio();

  resetMultiState();

  showMultiSetup();
}

// ============================================================
// SINGLE PLAYER SETUP
// ============================================================

function setupSinglePlayer() {
  startBtn?.addEventListener(
    "click",
    startSingleGame
  );

  playBtn?.addEventListener(
    "click",
    () => {
      if (singleState.playing) {
        stopSingleAudio();
      } else {
        playSingleClip();
      }
    }
  );

  dontKnowBtn?.addEventListener(
    "click",
    revealMoreSingle
  );

  answerInput?.addEventListener(
    "input",
    handleAnswerInput
  );

  answerInput?.addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "Enter") {
        return;
      }

      event.preventDefault();

      const value =
        answerInput.value.trim();

      if (value) {
        submitSingleAnswer(value);
      }
    }
  );

  answerInput?.addEventListener(
    "blur",
    () => {
      setTimeout(
        hideSuggestions,
        150
      );
    }
  );

  audio?.addEventListener(
    "timeupdate",
    updateSingleProgress
  );

  audio?.addEventListener(
    "ended",
    () => {
      singleState.playing = false;

      if (playBtn) {
        playBtn.textContent = "▶";
      }

      cancelAnimationFrame(
        singleState.progressAnimation
      );
    }
  );
}

// ============================================================
// START SINGLE GAME
// ============================================================

async function startSingleGame() {
  singleState.gameActive = true;

  clearSingleTimers();
  stopSingleAudio();

  singleState.score = 0;
  singleState.round = 0;

  updateSingleScore();

  setup?.classList.add("hidden");
  game?.classList.remove("hidden");

  await loadSingleRound();
}

// ============================================================
// LOAD SINGLE ROUND
// ============================================================

async function loadSingleRound() {
  if (!singleState.gameActive) {
    return;
  }

  clearSingleTimers();
  stopSingleAudio();

  singleState.round += 1;
  singleState.answered = false;

  singleState.revealDuration =
    SINGLE_REVEAL_TIMINGS[0];

  updateSingleRound();

  if (answerInput) {
    answerInput.value = "";
    answerInput.disabled = false;
  }

  hideSuggestions();

  if (result) {
    result.className = "result hidden";
    result.textContent = "";
  }

  if (dontKnowBtn) {
    dontKnowBtn.disabled = false;
    dontKnowBtn.classList.remove("hidden");
    dontKnowBtn.textContent = "I don't know";
  }

  removeSingleActionButtons();

  if (progressEl) {
    progressEl.style.width = "0%";
  }

  if (clipTimeEl) {
    clipTimeEl.textContent =
      `${formatSeconds(
        SINGLE_REVEAL_TIMINGS[0]
      )}s`;
  }

  if (durationLabel) {
    durationLabel.textContent =
      `${formatSeconds(
        SINGLE_REVEAL_TIMINGS[0]
      )}s`;
  }

  if (playBtn) {
    playBtn.disabled = true;
    playBtn.textContent = "▶";
  }

  try {
    const response =
      await fetch("/api/game");

    if (!singleState.gameActive) {
      return;
    }

    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status}`
      );
    }

    const data =
      await response.json();

    if (!singleState.gameActive) {
      return;
    }

    console.log(
      "Single-player round:",
      data
    );

    singleState.roundId =
      data.roundId;

    singleState.answerId =
      data.answerId;

    singleState.choices =
      Array.isArray(data.choices)
        ? data.choices
        : [];

    singleState.startTime =
      Number(data.startTime) || 0;

    singleState.audioDuration =
      Number(data.duration) || 0;

    if (
      singleState.audioDuration < 2
    ) {
      throw new Error(
        "Selected clip is shorter than the 2-second minimum."
      );
    }

    updateSingleClipDisplay();
    updateRevealButton();

    audio.pause();
    audio.currentTime = 0;
    audio.src = data.audioUrl;
    audio.load();

    if (playBtn) {
      playBtn.disabled = false;
    }

    waitForSingleAudioAndPlay();
  } catch (error) {
    console.error(
      "Could not load single-player round:",
      error
    );

    if (!singleState.gameActive) {
      return;
    }

    singleState.gameActive = false;

    if (setupError) {
      setupError.textContent =
        "Could not load the game. Please try again.";
    }

    setup?.classList.remove("hidden");
    game?.classList.add("hidden");
  }
}

// ============================================================
// AUTO PLAY SINGLE CLIP
// ============================================================

function waitForSingleAudioAndPlay() {
  if (!audio || !singleState.gameActive) {
    return;
  }

  let started = false;

  const start = () => {
    if (
      started ||
      !singleState.gameActive
    ) {
      return;
    }

    started = true;

    audio.removeEventListener(
      "canplay",
      start
    );

    audio.removeEventListener(
      "loadeddata",
      start
    );

    playSingleClip();
  };

  audio.addEventListener(
    "canplay",
    start,
    { once: true }
  );

  audio.addEventListener(
    "loadeddata",
    start,
    { once: true }
  );

  if (audio.readyState >= 3) {
    start();
  }
}

// ============================================================
// SINGLE PLAYER AUDIO
// ============================================================

function playSingleClip() {
  if (
    !singleState.gameActive ||
    !audio ||
    !singleState.audioDuration
  ) {
    return;
  }

  clearTimeout(
    singleState.clipTimer
  );

  cancelAnimationFrame(
    singleState.progressAnimation
  );

  const start =
    singleState.startTime;

  const duration =
    Math.min(
      singleState.revealDuration,
      singleState.audioDuration
    );

  const stopAt =
    start + duration;

  try {
    audio.currentTime = start;
  } catch (error) {
    console.warn(
      "Could not seek audio:",
      error
    );
  }

  audio
    .play()
    .then(() => {
      if (!singleState.gameActive) {
        stopSingleAudio();
        return;
      }

      singleState.playing = true;

      if (playBtn) {
        playBtn.textContent = "❚❚";
      }

      startSingleProgressLoop(
        start,
        duration
      );

      singleState.clipTimer =
        setTimeout(
          () => {
            stopSingleAudioAt(
              stopAt
            );
          },
          duration * 1000
        );
    })
    .catch((error) => {
      console.warn(
        "Could not autoplay audio:",
        error
      );

      singleState.playing = false;

      if (playBtn) {
        playBtn.textContent = "▶";
        playBtn.disabled = false;
      }
    });
}

// ============================================================
// SINGLE PLAYER PROGRESS
// ============================================================

function startSingleProgressLoop(
  start,
  duration
) {
  cancelAnimationFrame(
    singleState.progressAnimation
  );

  const update = () => {
    if (!audio) {
      return;
    }

    const elapsed =
      Math.max(
        0,
        Math.min(
          duration,
          audio.currentTime - start
        )
      );

    const percentage =
      duration > 0
        ? (elapsed / duration) * 100
        : 0;

    if (progressEl) {
      progressEl.style.width =
        `${Math.min(
          100,
          percentage
        )}%`;
    }

    if (clipTimeEl) {
      clipTimeEl.textContent =
        `${elapsed.toFixed(1)}s`;
    }

    if (durationLabel) {
      durationLabel.textContent =
        `${duration.toFixed(1)}s`;
    }

    if (
      !audio.paused &&
      audio.currentTime <
        start + duration &&
      singleState.gameActive
    ) {
      singleState.progressAnimation =
        requestAnimationFrame(
          update
        );
    }
  };

  update();
}

function updateSingleProgress() {
  if (
    !audio ||
    !singleState.audioDuration
  ) {
    return;
  }

  const start =
    singleState.startTime;

  const duration =
    Math.min(
      singleState.revealDuration,
      singleState.audioDuration
    );

  const elapsed =
    Math.max(
      0,
      Math.min(
        duration,
        audio.currentTime - start
      )
    );

  const percentage =
    duration > 0
      ? (elapsed / duration) * 100
      : 0;

  if (progressEl) {
    progressEl.style.width =
      `${Math.min(
        100,
        percentage
      )}%`;
  }

  if (clipTimeEl) {
    clipTimeEl.textContent =
      `${elapsed.toFixed(1)}s`;
  }

  if (durationLabel) {
    durationLabel.textContent =
      `${duration.toFixed(1)}s`;
  }
}

function stopSingleAudio() {
  clearTimeout(
    singleState.clipTimer
  );

  cancelAnimationFrame(
    singleState.progressAnimation
  );

  if (audio) {
    audio.pause();
  }

  singleState.playing = false;

  if (playBtn) {
    playBtn.textContent = "▶";
  }
}

function stopSingleAudioAt(stopAt) {
  clearTimeout(
    singleState.clipTimer
  );

  cancelAnimationFrame(
    singleState.progressAnimation
  );

  if (audio) {
    audio.pause();

    try {
      audio.currentTime = stopAt;
    } catch (error) {
      console.warn(error);
    }
  }

  singleState.playing = false;

  if (progressEl) {
    progressEl.style.width = "100%";
  }

  if (clipTimeEl) {
    clipTimeEl.textContent =
      `${singleState.revealDuration.toFixed(
        1
      )}s`;
  }

  if (durationLabel) {
    durationLabel.textContent =
      `${singleState.revealDuration.toFixed(
        1
      )}s`;
  }

  if (playBtn) {
    playBtn.textContent = "▶";
  }
}

// ============================================================
// SINGLE PLAYER SUGGESTIONS
// ============================================================

function handleAnswerInput() {
  const value =
    answerInput.value
      .trim()
      .toLowerCase();

  if (
    !value ||
    singleState.answered
  ) {
    hideSuggestions();
    return;
  }

  renderSuggestions(value);
}

function renderSuggestions(filter = "") {
  if (!suggestions) {
    return;
  }

  suggestions.innerHTML = "";

  const filtered =
    singleState.choices.filter(
      (choice) => {
        const title =
          getChoiceTitle(
            choice
          ).toLowerCase();

        return title.includes(filter);
      }
    );

  if (!filtered.length) {
    hideSuggestions();
    return;
  }

  suggestions.classList.add(
    "has-suggestions"
  );

  suggestions.classList.remove(
    "hidden"
  );

  filtered.forEach(
    (choice) => {
      const title =
        getChoiceTitle(choice);

      const button =
        document.createElement(
          "button"
        );

      button.type = "button";
      button.className =
        "suggestion";

      button.textContent = title;

      button.addEventListener(
        "mousedown",
        (event) => {
          event.preventDefault();

          answerInput.value = title;

          hideSuggestions();

          submitSingleAnswer(title);
        }
      );

      suggestions.appendChild(
        button
      );
    }
  );
}

function hideSuggestions() {
  if (!suggestions) {
    return;
  }

  suggestions.innerHTML = "";

  suggestions.classList.remove(
    "has-suggestions"
  );

  suggestions.classList.add(
    "hidden"
  );
}

// ============================================================
// SINGLE PLAYER ANSWER
// ============================================================

function submitSingleAnswer(answer) {
  if (
    !singleState.gameActive ||
    singleState.answered
  ) {
    return;
  }

  const value =
    String(answer || "").trim();

  if (!value) {
    return;
  }

  singleState.answered = true;

  stopSingleAudio();
  hideSuggestions();

  if (answerInput) {
    answerInput.disabled = true;
  }

  if (dontKnowBtn) {
    dontKnowBtn.disabled = true;
  }

  const correctChoice =
    singleState.choices.find(
      (choice) =>
        String(
          getChoiceId(choice)
        ) ===
        String(
          singleState.answerId
        )
    );

  const correctTitle =
    correctChoice
      ? getChoiceTitle(
          correctChoice
        )
      : "";

  const isCorrect =
    value.toLowerCase() ===
    correctTitle.toLowerCase();

  if (isCorrect) {
    const points =
      calculateSinglePoints();

    singleState.score += points;

    showSingleResult(
      `Correct! +${points} points`,
      true
    );
  } else {
    showSingleResult(
      `Wrong! The answer was: ${
        correctTitle || "Unknown"
      }`,
      false
    );
  }

  updateSingleScore();
}

// ============================================================
// SINGLE PLAYER SCORING
// ============================================================

function calculateSinglePoints() {
  const seconds =
    singleState.revealDuration;

  if (seconds <= 0.5) {
    return 1000;
  }

  if (seconds <= 0.1) {
    return 800;
  }

  if (seconds <= 3) {
    return 600;
  }

  if (seconds <= 5) {
    return 200;
  }

  return 50;
}

// ============================================================
// REVEAL MORE
// ============================================================

function updateRevealButton() {
  if (!dontKnowBtn) {
    return;
  }

  dontKnowBtn.disabled =
    singleState.answered;

  dontKnowBtn.textContent =
    "I don't know";
}

function revealMoreSingle() {
  if (
    !singleState.gameActive ||
    singleState.answered ||
    !singleState.audioDuration
  ) {
    return;
  }

  const currentDuration =
    singleState.revealDuration;

  const actualDuration =
    singleState.audioDuration;

  const nextDuration =
    SINGLE_REVEAL_TIMINGS.find(
      (value) =>
        value > currentDuration
    );

  if (
    !nextDuration ||
    currentDuration >= actualDuration
  ) {
    giveUpSingle();
    return;
  }

  singleState.revealDuration =
    Math.min(
      nextDuration,
      actualDuration
    );

  updateSingleClipDisplay();
  updateRevealButton();

  playCurrentSingleClip();
}

// ============================================================
// GIVE UP
// ============================================================

function giveUpSingle() {
  if (
    !singleState.gameActive ||
    singleState.answered ||
    !singleState.audioDuration
  ) {
    return;
  }

  singleState.answered = true;

  stopSingleAudio();
  hideSuggestions();

  if (answerInput) {
    answerInput.disabled = true;
  }

  if (dontKnowBtn) {
    dontKnowBtn.disabled = true;
    dontKnowBtn.textContent =
      "I don't know";
  }

  singleState.revealDuration =
    singleState.audioDuration;

  updateSingleClipDisplay();

  const correctChoice =
    singleState.choices.find(
      (choice) =>
        String(
          getChoiceId(choice)
        ) ===
        String(
          singleState.answerId
        )
    );

  const correctTitle =
    correctChoice
      ? getChoiceTitle(
          correctChoice
        )
      : "Unknown";

  showSingleResult(
    `The answer was: ${correctTitle} — +0 points`,
    false
  );

  updateSingleScore();

  playFullSingleClip();
}

// ============================================================
// PLAY FULL SINGLE CLIP
// ============================================================

function playFullSingleClip() {
  if (
    !singleState.gameActive ||
    !audio ||
    !singleState.audioDuration
  ) {
    return;
  }

  clearTimeout(
    singleState.clipTimer
  );

  cancelAnimationFrame(
    singleState.progressAnimation
  );

  const start =
    singleState.startTime;

  const duration =
    singleState.audioDuration;

  const stopAt =
    start + duration;

  try {
    audio.pause();
    audio.currentTime = start;
  } catch (error) {
    console.warn(
      "Could not seek audio:",
      error
    );
  }

  if (progressEl) {
    progressEl.style.width = "0%";
  }

  if (clipTimeEl) {
    clipTimeEl.textContent = "0.0s";
  }

  if (durationLabel) {
    durationLabel.textContent =
      `${formatSeconds(duration)}s`;
  }

  audio
    .play()
    .then(() => {
      if (!singleState.gameActive) {
        stopSingleAudio();
        return;
      }

      singleState.playing = true;

      if (playBtn) {
        playBtn.textContent = "❚❚";
      }

      startSingleProgressLoop(
        start,
        duration
      );

      singleState.clipTimer =
        setTimeout(
          () => {
            stopSingleAudioAt(
              stopAt
            );
          },
          duration * 1000
        );
    })
    .catch((error) => {
      console.error(
        "Could not play full clip:",
        error
      );

      singleState.playing = false;

      if (playBtn) {
        playBtn.textContent = "▶";
      }
    });
}

// ============================================================
// SINGLE PLAYER RESULT
// ============================================================

function showSingleResult(
  message,
  success = false
) {
  if (!result) {
    return;
  }

  result.className =
    `result ${
      success
        ? "success"
        : "failure"
    }`;

  result.textContent = message;

  createSingleActionButtons();
}

function createSingleActionButtons() {
  removeSingleActionButtons();

  if (!result) {
    return;
  }

  const actions =
    document.createElement(
      "div"
    );

  actions.id =
    "singleResultActions";

  actions.className =
    "single-result-actions";

  const replayBtn =
    document.createElement(
      "button"
    );

  replayBtn.type = "button";
  replayBtn.className = "secondary";
  replayBtn.textContent = "↻ Replay";

  replayBtn.addEventListener(
    "click",
    () => {
      replayFullSingleClip();
    }
  );

  const nextBtn =
    document.createElement(
      "button"
    );

  nextBtn.type = "button";
  nextBtn.className =
    "primary next";

  nextBtn.textContent =
    "Next round →";

  nextBtn.addEventListener(
    "click",
    () => {
      replayBtn.disabled = true;
      nextBtn.disabled = true;

      loadSingleRound();
    }
  );

  actions.appendChild(replayBtn);
  actions.appendChild(nextBtn);

  result.appendChild(actions);
}

// ============================================================
// REMOVE SINGLE ACTION BUTTONS
// ============================================================

function removeSingleActionButtons() {
  result
    ?.querySelectorAll(
      "#singleResultActions"
    )
    .forEach(
      (element) => {
        element.remove();
      }
    );
}

// ============================================================
// PLAY CURRENT SINGLE CLIP
// ============================================================

function playCurrentSingleClip() {
  if (
    !singleState.gameActive ||
    !audio ||
    !singleState.audioDuration
  ) {
    return;
  }

  clearTimeout(
    singleState.clipTimer
  );

  cancelAnimationFrame(
    singleState.progressAnimation
  );

  const start =
    singleState.startTime;

  const duration =
    Math.min(
      singleState.revealDuration,
      singleState.audioDuration
    );

  const stopAt =
    start + duration;

  try {
    audio.pause();
    audio.currentTime = start;
  } catch (error) {
    console.warn(
      "Could not seek audio:",
      error
    );
  }

  audio
    .play()
    .then(() => {
      if (!singleState.gameActive) {
        stopSingleAudio();
        return;
      }

      singleState.playing = true;

      if (playBtn) {
        playBtn.textContent = "❚❚";
      }

      if (progressEl) {
        progressEl.style.width = "0%";
      }

      startSingleProgressLoop(
        start,
        duration
      );

      singleState.clipTimer =
        setTimeout(
          () => {
            stopSingleAudioAt(
              stopAt
            );
          },
          duration * 1000
        );
    })
    .catch((error) => {
      console.error(
        "Could not replay clip:",
        error
      );

      singleState.playing = false;

      if (playBtn) {
        playBtn.textContent = "▶";
      }
    });
}

// ============================================================
// REPLAY FULL SINGLE CLIP
// ============================================================

function replayFullSingleClip() {
  playFullSingleClip();
}

// ============================================================
// SINGLE PLAYER UI
// ============================================================

function resetSingleUI() {
  setup?.classList.remove("hidden");
  game?.classList.add("hidden");

  if (setupError) {
    setupError.textContent = "";
  }

  if (scoreEl) {
    scoreEl.textContent = "0";
  }

  if (roundEl) {
    roundEl.textContent = "1";
  }

  if (clipTimeEl) {
    clipTimeEl.textContent =
      `${formatSeconds(
        SINGLE_REVEAL_TIMINGS[0]
      )}s`;
  }

  if (durationLabel) {
    durationLabel.textContent =
      `${formatSeconds(
        SINGLE_REVEAL_TIMINGS[0]
      )}s`;
  }

  if (progressEl) {
    progressEl.style.width = "0%";
  }
}

function resetSingleState() {
  clearSingleTimers();
  stopSingleAudio();

  singleState.score = 0;
  singleState.round = 0;

  singleState.roundId = null;
  singleState.answerId = null;
  singleState.choices = [];

  singleState.startTime = 0;
  singleState.audioDuration = 0;

  singleState.revealDuration =
    SINGLE_REVEAL_TIMINGS[0];

  singleState.playing = false;
  singleState.answered = false;
  singleState.gameActive = false;
}

function updateSingleScore() {
  if (scoreEl) {
    scoreEl.textContent =
      String(singleState.score);
  }
}

function updateSingleRound() {
  if (roundEl) {
    roundEl.textContent =
      String(singleState.round);
  }
}

function updateSingleClipDisplay() {
  const seconds =
    Math.min(
      singleState.revealDuration,
      singleState.audioDuration ||
        singleState.revealDuration
    );

  if (clipTimeEl) {
    clipTimeEl.textContent =
      `${formatSeconds(seconds)}s`;
  }

  if (durationLabel) {
    durationLabel.textContent =
      `${formatSeconds(seconds)}s`;
  }
}

// ============================================================
// MULTIPLAYER SETUP
// ============================================================

function setupMultiplayer() {
  createPartyBtn?.addEventListener(
    "click",
    createParty
  );

  joinPartyBtn?.addEventListener(
    "click",
    joinParty
  );

  startPartyBtn?.addEventListener(
    "click",
    startParty
  );

  leavePartyBtn?.addEventListener(
    "click",
    leaveParty
  );

  finalLeaveBtn?.addEventListener(
    "click",
    leaveParty
  );

  finalNewGameBtn?.addEventListener(
    "click",
    startNewMultiplayerGame
  );

  multiPlayBtn?.addEventListener(
    "click",
    replayMultiClip
  );
}

// ============================================================
// CREATE PARTY
// ============================================================

function createParty() {
  const name =
    createName?.value.trim();

  if (!name) {
    showMultiSetupError(
      "Please enter your name."
    );

    return;
  }

  const rounds =
    Number(
      roundCount?.value
    ) || 10;

  clearMultiError();

  if (createPartyBtn) {
    createPartyBtn.disabled = true;
  }

  socket.emit(
    "createParty",
    {
      name,
      rounds,
      totalRounds: rounds
    }
  );
}

// ============================================================
// JOIN PARTY
// ============================================================

function joinParty() {
  const name =
    joinName?.value.trim();

  const code =
    partyCodeInput?.value
      .trim()
      .toUpperCase();

  if (!name) {
    showMultiSetupError(
      "Please enter your name."
    );

    return;
  }

  if (!code) {
    showMultiSetupError(
      "Please enter a party code."
    );

    return;
  }

  clearMultiError();

  if (joinPartyBtn) {
    joinPartyBtn.disabled = true;
  }

  socket.emit(
    "joinParty",
    {
      name,
      code,
      partyCode: code
    }
  );
}

// ============================================================
// START PARTY
// ============================================================

function startParty() {
  if (
    !multiState.inParty ||
    !multiState.isHost
  ) {
    return;
  }

  if (startPartyBtn) {
    startPartyBtn.disabled = true;
  }

  socket.emit(
    "startParty",
    {
      code: multiState.partyCode,
      partyCode: multiState.partyCode
    }
  );
}

function startNewMultiplayerGame() {
  if (
    !multiState.inParty ||
    !multiState.isHost
  ) {
    return;
  }

  if (finalNewGameBtn) {
    finalNewGameBtn.disabled = true;
  }

  socket.emit(
    "newGame",
    {
      code:
        multiState.partyCode,

      partyCode:
        multiState.partyCode
    }
  );
}

// ============================================================
// LEAVE PARTY
// ============================================================

function leaveParty() {
  endMultiplayerGame(true);
}

// ============================================================
// PARTY CREATED
// ============================================================

socket.on(
  "partyCreated",
  (data) => {
    console.log(
      "Party created:",
      data
    );

    const party =
      data?.party || data;

    applyParty(party);

    if (createPartyBtn) {
      createPartyBtn.disabled = false;
    }

    if (joinPartyBtn) {
      joinPartyBtn.disabled = false;
    }

    showMultiLobby();
  }
);

// ============================================================
// PARTY JOINED
// ============================================================

socket.on(
  "partyJoined",
  (data) => {
    console.log(
      "Party joined:",
      data
    );

    const party =
      data?.party || data;

    applyParty(party);

    if (createPartyBtn) {
      createPartyBtn.disabled = false;
    }

    if (joinPartyBtn) {
      joinPartyBtn.disabled = false;
    }

    showMultiLobby();
  }
);

// ============================================================
// PARTY UPDATED
// ============================================================

socket.on(
  "partyUpdated",
  (data) => {
    console.log(
      "Party updated:",
      data
    );

    const party =
      data?.party || data;

    applyParty(party);

    renderMultiScoreboard(
      multiState.players
    );

    if (
      !multiState.started &&
      !multiState.finished
    ) {
      showMultiLobby();
    }
  }
);

// ============================================================
// HOST CHANGED
// ============================================================

socket.on(
  "hostChanged",
  (data) => {
    console.log(
      "Host changed:",
      data
    );

    if (data?.party) {
      applyParty(data.party);
    }

    if (data?.hostId) {
      multiState.isHost =
        String(data.hostId) ===
        String(socket.id);
    }

    if (
      data?.isHost !==
      undefined
    ) {
      multiState.isHost =
        Boolean(data.isHost);
    }

    updateLobbyUI();
  }
);

// ============================================================
// ROUND STARTED
// ============================================================

socket.on(
  "roundStarted",
  (round) => {
    console.log(
      "Round started:",
      round
    );

    multiState.started = true;
    multiState.finished = false;

    startMultiplayerRound(round);
  }
);

// ============================================================
// ANSWER ACCEPTED
// ============================================================

socket.on(
  "answerAccepted",
  (data) => {
    console.log(
      "Answer accepted:",
      data
    );

    if (
      data?.score !== undefined
    ) {
      if (multiScore) {
        multiScore.textContent =
          String(data.score);
      }
    }

    if (
      data?.totalScore !== undefined
    ) {
      if (multiScore) {
        multiScore.textContent =
          String(data.totalScore);
      }
    }

    const players =
      data?.players ||
      data?.scoreboard ||
      data?.results;

    if (Array.isArray(players)) {
      multiState.players = players;

      renderMultiScoreboard(
        multiState.players
      );

      renderPlayerList(
        multiState.players
      );
    }

    if (
      data?.correct !== undefined
    ) {
      showMultiAnswerResult(data);
    }

    if (
      data?.points !== undefined &&
      data?.score === undefined &&
      data?.totalScore === undefined
    ) {
      const points =
        Number(data.points) || 0;

      const current =
        Number(
          multiScore?.textContent
        ) || 0;

      if (multiScore) {
        multiScore.textContent =
          String(
            current + points
          );
      }
    }
  }
);

// ============================================================
// ROUND FINISHED
// ============================================================

socket.on(
  "roundFinished",
  (data) => {
    console.log(
      "Round finished:",
      data
    );

    finishMultiplayerRound(data);
  }
);

// ============================================================
// GAME FINISHED
// ============================================================

socket.on(
  "gameFinished",
  (data) => {
    console.log(
      "Game finished:",
      data
    );

    multiState.finished = true;
    multiState.started = false;

    clearMultiTimers();
    stopMultiAudio();

    const players =
      data?.players ||
      data?.scoreboard ||
      data?.results ||
      [];

    showMultiFinal();

    renderFinalScoreboard(
      players
    );

    const winner =
      players[0];

    const winnerId =
      winner?.id ??
      winner?.socketId ??
      winner?.playerId;

    multiFinalResult
      ?.querySelector(".winner-message")
      ?.remove();

    if (
      winnerId !== undefined &&
      String(winnerId) ===
        String(socket.id)
    ) {
      showWinConfetti();

      const winnerText =
        document.createElement("div");

      winnerText.className =
        "winner-message";

      winnerText.textContent =
        "You win! 🎉";

      multiFinalResult?.prepend(
        winnerText
      );
    }
  }
);

// ============================================================
// NEW GAME STARTED
// ============================================================

socket.on(
  "newGameStarted",
  (data) => {
    console.log(
      "New multiplayer game started:",
      data
    );

    const party =
      data?.party ||
      data;

    if (party) {
      applyParty(party);
    }

    multiState.finished = false;
    multiState.started = true;
    multiState.roundNumber = 0;
    multiState.answered = false;
    multiState.timeUp = false;

    if (finalNewGameBtn) {
      finalNewGameBtn.disabled = false;
    }
  }
);

// ============================================================
// SOCKET ERRORS
// ============================================================

socket.on(
  "partyError",
  (data) => {
    console.error(
      "Party error:",
      data
    );

    if (createPartyBtn) {
      createPartyBtn.disabled = false;
    }

    if (joinPartyBtn) {
      joinPartyBtn.disabled = false;
    }

    if (startPartyBtn) {
      startPartyBtn.disabled = false;
    }

    if (finalNewGameBtn) {
      finalNewGameBtn.disabled = false;
    }

    showMultiSetupError(
      typeof data === "string"
        ? data
        : data?.message ||
          "Party error."
    );
  }
);

socket.on(
  "errorMessage",
  (data) => {
    console.error(
      "Server error:",
      data
    );

    if (createPartyBtn) {
      createPartyBtn.disabled = false;
    }

    if (joinPartyBtn) {
      joinPartyBtn.disabled = false;
    }

    if (startPartyBtn) {
      startPartyBtn.disabled = false;
    }

    if (finalNewGameBtn) {
      finalNewGameBtn.disabled = false;
    }

    showMultiSetupError(
      typeof data === "string"
        ? data
        : data?.message ||
          "Something went wrong."
    );
  }
);

// ============================================================
// PARTY STATE
// ============================================================

function applyParty(party) {
  if (!party) {
    return;
  }

  if (party.hostId) {
    multiState.hostId = party.hostId;

    multiState.isHost =
      String(party.hostId) ===
      String(socket.id);
  }

  multiState.inParty = true;

  multiState.partyCode =
    party.code ||
    party.partyCode ||
    multiState.partyCode;

  multiState.started =
    Boolean(party.started);

  multiState.finished =
    Boolean(party.finished);

  multiState.totalRounds =
    Number(
      party.totalRounds ||
        party.rounds ||
        multiState.totalRounds
    );

  const players =
    party.players ??
    party.playerList ??
    party.scoreboard;

  if (Array.isArray(players)) {
    multiState.players = players;
  }

  if (party.hostId) {
    multiState.isHost =
      String(party.hostId) ===
      String(socket.id);
  }

  if (
    party.isHost !==
    undefined
  ) {
    multiState.isHost =
      Boolean(party.isHost);
  }

  updateLobbyUI();

  renderMultiScoreboard(
    multiState.players
  );
}

// ============================================================
// LOBBY UI
// ============================================================

function updateLobbyUI(party = null) {
  if (partyCode) {
    partyCode.textContent =
      multiState.partyCode ||
      "-----";
  }

  if (lobbyRounds) {
    lobbyRounds.textContent =
      `${multiState.totalRounds} rounds`;
  }

  if (multiRoundTotal) {
    multiRoundTotal.textContent =
      `/ ${multiState.totalRounds}`;
  }

  const players =
    party?.players ??
    party?.playerList ??
    party?.scoreboard ??
    multiState.players;

  if (Array.isArray(players)) {
    multiState.players = players;
  }

  renderPlayerList(
    multiState.players
  );

  if (startPartyBtn) {
    startPartyBtn.classList.toggle(
      "hidden",
      !multiState.isHost
    );

    startPartyBtn.disabled =
      !multiState.isHost ||
      multiState.started ||
      multiState.finished;
  }

  if (lobbyHint) {
    lobbyHint.textContent =
      multiState.isHost
        ? "You are the host. Start the game when everyone is ready."
        : "Waiting for the host to start the game.";
  }
}

function renderPlayerList(players) {
  if (!playerList) {
    return;
  }

  playerList.innerHTML = "";

  if (!Array.isArray(players)) {
    return;
  }

  const sorted = [...players].sort(
    (a, b) =>
      getPlayerScore(b) -
      getPlayerScore(a)
  );

  sorted.forEach(
    (player) => {
      const row =
        document.createElement("div");

      row.className = "player-row";

      const name =
        document.createElement("span");

      const playerId =
        player.id ??
        player.socketId ??
        player.playerId;

      const isHost =
        String(playerId) ===
        String(multiState.hostId);

      name.textContent =
        (isHost ? "👑 " : "") +
        (player.name ||
          player.username ||
          "Player");

      const score =
        document.createElement("strong");

      score.textContent =
        String(
          getPlayerScore(player)
        );

      row.appendChild(name);
      row.appendChild(score);

      playerList.appendChild(row);
    }
  );

  if (multiPlayerCount) {
    multiPlayerCount.textContent =
      String(players.length);
  }
}

function getPlayerScore(player) {
  if (!player) {
    return 0;
  }

  return Number(
    player.score ??
    player.totalScore ??
    player.points ??
    0
  ) || 0;
}

// ============================================================
// MULTIPLAYER SCOREBOARD
// ============================================================

function renderMultiScoreboard(players) {
  if (!multiScoreboard) {
    return;
  }

  if (!Array.isArray(players)) {
    return;
  }

  const currentPlayerIds =
    new Set(
      players.map(
        (player) =>
          String(
            player.id ??
            player.socketId ??
            player.playerId
          )
      )
    );

  // Remove players that are no longer in the party
  multiScoreboard
    .querySelectorAll(".score-row")
    .forEach((row) => {
      const id =
        row.dataset.playerId;

      if (
        id &&
        !currentPlayerIds.has(id)
      ) {
        row.remove();
      }
    });

  const sorted = [...players].sort(
    (a, b) =>
      getPlayerScore(b) -
      getPlayerScore(a)
  );

  const oldPositions = new Map();

  multiScoreboard
    .querySelectorAll(".score-row")
    .forEach((row) => {
      const id =
        row.dataset.playerId;

      if (id) {
        oldPositions.set(
          id,
          row.getBoundingClientRect().top
        );
      }
    });

  sorted.forEach(
    (player, index) => {
      const playerId =
        player.id ??
        player.socketId ??
        player.playerId;

      const id =
        String(playerId);

      let row =
        multiScoreboard.querySelector(
          `.score-row[data-player-id="${CSS.escape(id)}"]`
        );

      if (!row) {
        row =
          document.createElement("div");

        row.className =
          "score-row";

        row.dataset.playerId =
          id;

        const position =
          document.createElement("span");

        const name =
          document.createElement("span");

        const score =
          document.createElement("strong");

        row.appendChild(position);
        row.appendChild(name);
        row.appendChild(score);

        multiScoreboard.appendChild(
          row
        );
      }

      const position =
        row.children[0];

      const name =
        row.children[1];

      const score =
        row.children[2];

      position.textContent =
        index === 0
          ? "👑"
          : String(index + 1);

      name.textContent =
        player.name ||
        player.username ||
        "Player";

      const newScore =
        String(
          getPlayerScore(player)
        );

      const oldScore =
        score.textContent;

      score.textContent =
        newScore;

      if (
        oldScore &&
        oldScore !== newScore
      ) {
        row.classList.remove(
          "score-changed"
        );

        void row.offsetWidth;

        row.classList.add(
          "score-changed"
        );
      }

      row.classList.toggle(
        "leader",
        index === 0
      );
    }
  );

  sorted.forEach(
    (player) => {
      const playerId =
        player.id ??
        player.socketId ??
        player.playerId;

      const row =
        multiScoreboard.querySelector(
          `.score-row[data-player-id="${CSS.escape(String(playerId))}"]`
        );

      if (row) {
        multiScoreboard.appendChild(
          row
        );
      }
    }
  );

  multiScoreboard
    .querySelectorAll(".score-row")
    .forEach((row) => {
      const id =
        row.dataset.playerId;

      const oldTop =
        oldPositions.get(id);

      if (oldTop === undefined) {
        return;
      }

      const newTop =
        row.getBoundingClientRect().top;

      const difference =
        oldTop - newTop;

      if (
        Math.abs(difference) < 1
      ) {
        return;
      }

      row.style.transform =
        `translateY(${difference}px)`;

      row.offsetHeight;

      requestAnimationFrame(() => {
        row.style.transform =
          "translateY(0)";
      });
    });

  const currentPlayer =
    sorted.find(
      (player) =>
        String(
          player.id ??
          player.socketId ??
          player.playerId
        ) ===
        String(socket.id)
    );

  if (
    currentPlayer &&
    multiScore
  ) {
    multiScore.textContent =
      String(
        getPlayerScore(
          currentPlayer
        )
      );
  }

  if (multiPlayerCount) {
    multiPlayerCount.textContent =
      String(
        sorted.length
      );
  }
}
// ============================================================
// MULTIPLAYER ROUND
// ============================================================

function startMultiplayerRound(round) {
  clearMultiTimers();
  stopMultiAudio();

  multiState.started = true;
  multiState.finished = false;
  multiState.answered = false;
  multiState.selectedAnswerId = null;
  multiState.timeUp = false;

  multiState.roundNumber =
    Number(
      round.roundNumber
    ) || 1;

  multiState.totalRounds =
    Number(
      round.totalRounds
    ) ||
    multiState.totalRounds;

  multiState.duration =
    Number(
      round.duration
    ) || 15;

  multiState.audioDuration =
    Number(
      round.audioDuration ??
      round.clipDuration
    ) || 0;

  multiState.startTime =
    Number(
      round.startTime ??
      round.clipStart
    ) || 0;

  multiState.startAt =
    Number(
      round.startAt
    ) || Date.now();

  multiState.choices =
    Array.isArray(round.choices)
      ? round.choices
      : [];

  showMultiGame();

  updateMultiRoundUI();
  renderMultiChoices();

  multiAnswerStatus?.classList.add(
    "hidden"
  );

  multiAnswerStatus?.classList.remove(
    "success",
    "failure"
  );

  if (multiProgress) {
    multiProgress.style.width =
      "0%";
  }

  if (multiPlayBtn) {
    multiPlayBtn.disabled = true;
    multiPlayBtn.textContent = "▶";
  }

  if (multiAudio) {
    multiAudio.pause();
    multiAudio.src =
      round.audioUrl || "";
    multiAudio.load();
  }

  const delay =
    Math.max(
      0,
      multiState.startAt -
        Date.now()
    );

  multiState.countdownTimer =
    setTimeout(
      () => {
        if (!multiState.started) {
          return;
        }

        playMultiClip();
        startMultiAnswerTimer();
      },
      delay
    );
}

// ============================================================
// MULTIPLAYER AUDIO
// ============================================================

function playMultiClip() {
  if (
    !multiState.started ||
    !multiAudio ||
    !multiState.audioDuration
  ) {
    return;
  }

  clearTimeout(
    multiState.clipTimer
  );

  cancelAnimationFrame(
    multiState.progressAnimation
  );

  const start =
    Math.max(
      0,
      multiState.startTime
    );

  const available =
    Number.isFinite(
      multiAudio.duration
    )
      ? Math.max(
          0,
          multiAudio.duration -
            start
        )
      : multiState.audioDuration;

  const duration =
    Math.min(
      multiState.audioDuration,
      available
    );

  if (duration <= 0) {
    return;
  }

  try {
    multiAudio.currentTime =
      start;
  } catch (error) {
    console.warn(error);
  }

  multiAudio
    .play()
    .then(() => {
      if (!multiState.started) {
        stopMultiAudio();
        return;
      }

      if (multiPlayBtn) {
        multiPlayBtn.disabled = false;
        multiPlayBtn.textContent =
          "❚❚";
      }

      updateMultiAudioProgress(
        start,
        duration
      );

      multiState.clipTimer =
        setTimeout(
          () => {
            stopMultiAudio();
          },
          duration * 1000
        );
    })
    .catch((error) => {
      console.warn(
        "Multiplayer autoplay blocked:",
        error
      );

      if (multiPlayBtn) {
        multiPlayBtn.disabled = false;
      }
    });
}

function stopMultiAudio() {
  clearTimeout(
    multiState.clipTimer
  );

  cancelAnimationFrame(
    multiState.progressAnimation
  );

  if (multiAudio) {
    multiAudio.pause();
  }

  if (multiPlayBtn) {
    multiPlayBtn.textContent = "▶";
  }
}

function replayMultiClip() {
  if (
    !multiState.started ||
    multiState.answered
  ) {
    return;
  }

  playMultiClip();
}

function updateMultiAudioProgress(
  start,
  duration
) {
  cancelAnimationFrame(
    multiState.progressAnimation
  );

  const update = () => {
    if (!multiAudio) {
      return;
    }

    const elapsed =
      Math.max(
        0,
        Math.min(
          duration,
          multiAudio.currentTime -
            start
        )
      );

    const percentage =
      duration > 0
        ? (elapsed / duration) * 100
        : 0;

    if (multiProgress) {
      multiProgress.style.width =
        `${percentage}%`;
    }

    if (
      !multiAudio.paused &&
      elapsed < duration &&
      multiState.started
    ) {
      multiState.progressAnimation =
        requestAnimationFrame(
          update
        );
    }
  };

  update();
}

// ============================================================
// MULTIPLAYER TIMER
// ============================================================

function startMultiAnswerTimer() {
  const startedAt = Date.now();

  const total =
    multiState.duration * 1000;

  function update() {
    if (!multiState.started) {
      return;
    }

    const elapsed =
      Date.now() - startedAt;

    const remaining =
      Math.max(
        0,
        total - elapsed
      );

    if (multiRoundProgress) {
      const progress =
        (remaining / total) * 100;

      multiRoundProgress.style.width =
        `${progress}%`;

      const progressRatio =
        progress / 100;

      const start = [
        255,
        255,
        255
      ];

      const end = [
        180,
        90,
        110
      ];

      const r =
        Math.round(
          start[0] +
          (end[0] - start[0]) *
            (1 - progressRatio)
        );

      const g =
        Math.round(
          start[1] +
          (end[1] - start[1]) *
            (1 - progressRatio)
        );

      const b =
        Math.round(
          start[2] +
          (end[2] - start[2]) *
            (1 - progressRatio)
        );

      multiRoundProgress.style.background =
        `rgb(${r}, ${g}, ${b})`;
    }

    // ========================================================
    // TIME IS UP
    // ========================================================

    if (remaining <= 0) {
      multiState.timeUp = true;
      multiState.answered = true;

      // Disable every answer button.
      disableMultiChoices();

      stopMultiAudio();

      socket.emit(
        "submitAnswer",
        {
          code:
            multiState.partyCode,

          partyCode:
            multiState.partyCode,

          answerId: null,

          videoId: null
        }
      );

      return;
    }

    multiState.timer =
      setTimeout(
        update,
        50
      );
  }

  update();
}

// ============================================================
// MULTIPLAYER CHOICES
// ============================================================

function renderMultiChoices() {
  if (!multiChoices) {
    return;
  }

  multiChoices.innerHTML = "";

  multiState.choices.forEach(
    (choice, index) => {
      const button =
        document.createElement("button");

      button.type = "button";
      button.className =
        "choice-button";

      button.dataset.answerId =
        String(
          getChoiceId(choice)
        );

      const number =
        document.createElement("span");

      number.className =
        "choice-number";

      number.textContent =
        String(index + 1);

      const title =
        document.createElement("span");

      title.className =
        "choice-title";

      title.textContent =
        getChoiceTitle(choice);

      button.appendChild(number);
      button.appendChild(title);

      button.addEventListener(
        "click",
        () => {
          if (
            button.disabled ||
            multiState.answered ||
            multiState.timeUp ||
            !multiState.started
          ) {
            return;
          }

          submitMultiAnswer(
            getChoiceId(choice)
          );
        }
      );

      multiChoices.appendChild(
        button
      );
    }
  );

  if (
    multiState.answered ||
    multiState.timeUp
  ) {
    disableMultiChoices();
  }
}

// ============================================================
// SUBMIT MULTIPLAYER ANSWER
// ============================================================

function submitMultiAnswer(answerId) {
  if (
    !multiState.started ||
    multiState.answered ||
    multiState.timeUp
  ) {
    return;
  }

  // Lock immediately.
  multiState.answered = true;
  multiState.selectedAnswerId =
    answerId;

  stopMultiAudio();

  // Disable ALL buttons immediately.
  disableMultiChoices();

  socket.emit(
    "submitAnswer",
    {
      code:
        multiState.partyCode,

      partyCode:
        multiState.partyCode,

      answerId:
        answerId,

      videoId:
        answerId
    }
  );
}

// ============================================================
// DISABLE ALL MULTIPLAYER CHOICES
// ============================================================

function disableMultiChoices() {
  if (!multiChoices) {
    return;
  }

  const buttons =
    multiChoices.querySelectorAll(
      ".choice-button"
    );

  buttons.forEach(
    (button) => {
      button.disabled = true;

      button.setAttribute(
        "disabled",
        ""
      );

      button.classList.add(
        "disabled"
      );

      button.style.pointerEvents =
        "none";
    }
  );
}

// ============================================================
// MULTIPLAYER ANSWER RESULT
// ============================================================

function showMultiAnswerResult(data) {
  const buttons =
    multiChoices?.querySelectorAll(
      ".choice-button"
    );

  if (!buttons) {
    return;
  }

  buttons.forEach(
    (button) => {
      const choiceId =
        String(
          button.dataset.answerId
        );

      const correctId =
        String(
          data.correctAnswerId
        );

      const answerId =
        data.answerId === null ||
        data.answerId === undefined
          ? null
          : String(
              data.answerId
            );

      button.classList.remove(
        "correct",
        "incorrect"
      );

      // Always show correct answer.
      if (
        choiceId === correctId
      ) {
        button.classList.add(
          "correct"
        );
      }

      // Show player's wrong answer.
      if (
        data.correct === false &&
        answerId !== null &&
        choiceId === answerId
      ) {
        button.classList.add(
          "incorrect"
        );
      }

      // Keep disabled.
      button.disabled = true;

      button.classList.add(
        "disabled"
      );
    }
  );
}

// ============================================================
// MULTIPLAYER ANSWER STATUS
// ============================================================

function showMultiAnswerStatus(
  message,
  success
) {
  if (!multiAnswerStatus) {
    return;
  }

  multiAnswerStatus.textContent =
    message;

  multiAnswerStatus.className =
    `answer-status ${
      success
        ? "success"
        : "failure"
    }`;
}

// ============================================================
// MULTIPLAYER ROUND FINISHED
// ============================================================

function finishMultiplayerRound(data) {
  clearMultiTimers();
  stopMultiAudio();

  // The round is over, so lock the current buttons.
  multiState.answered = true;

  disableMultiChoices();

  multiState.started = false;
}
// ============================================================
// MULTIPLAYER ROUND RESULT
// ============================================================

function showMultiRoundResult() {
  multiSetup?.classList.add("hidden");
  multiLobby?.classList.add("hidden");
  multiGame?.classList.add("hidden");

  multiRoundResult?.classList.remove(
    "hidden"
  );

  multiFinalResult?.classList.add(
    "hidden"
  );
}

function renderRoundResults(players) {
  if (!roundResults) {
    return;
  }

  roundResults.innerHTML = "";

  if (!Array.isArray(players)) {
    return;
  }

  const sorted = [...players].sort(
    (a, b) =>
      getPlayerScore(b) -
      getPlayerScore(a)
  );

  sorted.forEach(
    (player) => {
      const row =
        document.createElement(
          "div"
        );

      row.className =
        "round-result-row";

      const name =
        document.createElement(
          "span"
        );

      name.textContent =
        player.name ||
        player.username ||
        "Player";

      const points =
        document.createElement(
          "strong"
        );

      points.textContent =
        formatScoreChange(player);

      row.appendChild(name);
      row.appendChild(points);

      roundResults.appendChild(
        row
      );
    }
  );
}

// ============================================================
// FINAL SCOREBOARD
// ============================================================

function renderFinalScoreboard(players) {
  if (!finalScoreboard) {
    return;
  }

  finalScoreboard.innerHTML = "";

  if (!Array.isArray(players)) {
    return;
  }

  const sorted =
    [...players].sort(
      (a, b) =>
        Number(b.score || 0) -
        Number(a.score || 0)
    );

  sorted.forEach(
    (player, index) => {
      const row =
        document.createElement(
          "div"
        );

      row.className =
        "score-row";

      if (index === 0) {
        row.classList.add(
          "leader"
        );
      }

      const position =
        document.createElement(
          "span"
        );

      position.textContent =
        String(index + 1);

      const name =
        document.createElement(
          "span"
        );

      name.textContent =
        player.name ||
        player.username ||
        "Player";

      const score =
        document.createElement(
          "strong"
        );

      score.textContent =
        String(
          player.score || 0
        );

      row.appendChild(position);
      row.appendChild(name);
      row.appendChild(score);

      finalScoreboard.appendChild(
        row
      );
    }
  );
}

// ============================================================
// MULTIPLAYER SCREENS
// ============================================================

function showMultiSetup() {
  multiSetup?.classList.remove(
    "hidden"
  );

  multiLobby?.classList.add(
    "hidden"
  );

  multiGame?.classList.add(
    "hidden"
  );

  multiRoundResult?.classList.add(
    "hidden"
  );

  multiFinalResult?.classList.add(
    "hidden"
  );
}

function showMultiLobby() {
  multiSetup?.classList.add(
    "hidden"
  );

  multiLobby?.classList.remove(
    "hidden"
  );

  multiGame?.classList.add(
    "hidden"
  );

  multiRoundResult?.classList.add(
    "hidden"
  );

  multiFinalResult?.classList.add(
    "hidden"
  );

  updateLobbyUI();
}

function showMultiGame() {
  multiSetup?.classList.add(
    "hidden"
  );

  multiLobby?.classList.add(
    "hidden"
  );

  multiGame?.classList.remove(
    "hidden"
  );

  multiRoundResult?.classList.add(
    "hidden"
  );

  multiFinalResult?.classList.add(
    "hidden"
  );
}

function showMultiFinal() {
  multiSetup?.classList.add(
    "hidden"
  );

  multiLobby?.classList.add(
    "hidden"
  );

  multiGame?.classList.add(
    "hidden"
  );

  multiRoundResult?.classList.add(
    "hidden"
  );

  multiFinalResult?.classList.remove(
    "hidden"
  );

  if (finalNewGameBtn) {
    finalNewGameBtn.classList.toggle(
      "hidden",
      !multiState.isHost
    );
  }
}

// ============================================================
// MULTIPLAYER ROUND UI
// ============================================================

function updateMultiRoundUI() {
  if (multiRoundCurrent) {
    multiRoundCurrent.textContent =
      String(
        multiState.roundNumber
      );
  }

  if (multiRoundTotal) {
    multiRoundTotal.textContent =
      `/ ${multiState.totalRounds}`;
  }

  if (multiDuration) {
    multiDuration.textContent =
      `${formatSeconds(
        multiState.audioDuration
      )}s`;
  }
}

// ============================================================
// RESET MULTIPLAYER STATE
// ============================================================

function resetMultiState() {
  clearMultiTimers();
  stopMultiAudio();

  multiState.inParty = false;
  multiState.partyCode = null;
  multiState.isHost = false;
  multiState.hostId = null;

  multiState.started = false;
  multiState.finished = false;

  multiState.roundNumber = 0;
  multiState.totalRounds = 10;

  multiState.duration = 15;

  multiState.audioDuration = 0;
  multiState.startTime = 0;
  multiState.startAt = null;

  multiState.choices = [];
  multiState.answered = false;
  multiState.players = [];

  multiState.selectedAnswerId = null;
  multiState.timeUp = false;

  if (multiScoreboard) {
    multiScoreboard.innerHTML = "";
  }

  if (multiProgress) {
    multiProgress.style.width = "0%";
  }

  if (multiRoundProgress) {
    multiRoundProgress.style.width =
      "100%";
  }

  if (multiChoices) {
    multiChoices.innerHTML = "";
  }

  if (multiAnswerStatus) {
    multiAnswerStatus.textContent = "";
    multiAnswerStatus.className =
      "answer-status hidden";
  }
}

// ============================================================
// CLEAR TIMERS
// ============================================================

function clearSingleTimers() {
  clearTimeout(
    singleState.clipTimer
  );

  cancelAnimationFrame(
    singleState.progressAnimation
  );

  singleState.clipTimer = null;
  singleState.progressAnimation = null;
}

function clearMultiTimers() {
  clearTimeout(
    multiState.clipTimer
  );

  clearTimeout(
    multiState.countdownTimer
  );

  clearTimeout(
    multiState.timer
  );

  cancelAnimationFrame(
    multiState.progressAnimation
  );

  multiState.clipTimer = null;
  multiState.countdownTimer = null;
  multiState.timer = null;
  multiState.progressAnimation = null;
}

// ============================================================
// ERRORS
// ============================================================

function showMultiSetupError(message) {
  if (multiSetupError) {
    multiSetupError.textContent =
      message || "";
  }
}

function clearMultiError() {
  if (multiSetupError) {
    multiSetupError.textContent = "";
  }
}

// ============================================================
// HELPERS
// ============================================================

function getChoiceId(choice) {
  if (
    choice === null ||
    choice === undefined
  ) {
    return null;
  }

  if (
    typeof choice === "string" ||
    typeof choice === "number"
  ) {
    return choice;
  }

  return (
    choice.id ??
    choice.videoId ??
    choice.answerId ??
    choice._id ??
    null
  );
}

function getChoiceTitle(choice) {
  if (
    choice === null ||
    choice === undefined
  ) {
    return "";
  }

  if (
    typeof choice === "string" ||
    typeof choice === "number"
  ) {
    return String(choice);
  }

  return (
    choice.title ??
    choice.name ??
    choice.videoTitle ??
    choice.label ??
    choice.text ??
    String(
      choice.id ??
        choice.videoId ??
        ""
    )
  );
}

function formatSeconds(seconds) {
  const value =
    Number(seconds) || 0;

  if (value < 10) {
    return value.toFixed(1);
  }

  return String(
    Math.round(value)
  );
}

function formatScoreChange(player) {
  if (
    player.points !==
    undefined
  ) {
    return `+${player.points}`;
  }

  if (
    player.roundPoints !==
    undefined
  ) {
    return `+${player.roundPoints}`;
  }

  return String(
    player.score || 0
  );
}

// ============================================================
// CONFETTI
// ============================================================

function showWinConfetti() {
  if (typeof confetti !== "function") {
    return;
  }

  confetti({
    particleCount: 180,
    spread: 100,
    origin: {
      y: 0.6
    }
  });

  setTimeout(() => {
    confetti({
      particleCount: 180,
      spread: 100,
      origin: {
        y: 0.6
      }
    });
  }, 700);

  setTimeout(() => {
    confetti({
      particleCount: 180,
      spread: 100,
      origin: {
        y: 0.6
      }
    });
  }, 1400);
}