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

  // TRUE only while an actual single-player game is running.
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
  // ----------------------------------------------------------
  // SINGLE PLAYER TAB
  // ----------------------------------------------------------

  singleTab?.addEventListener(
    "click",
    () => {
      /*
       * If a multiplayer game is currently running,
       * ask before leaving it.
       */
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

  // ----------------------------------------------------------
  // MULTIPLAYER TAB
  // ----------------------------------------------------------

  multiTab?.addEventListener(
    "click",
    () => {
      /*
       * If a single-player game is currently running,
       * ask before leaving it.
       */
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
  /*
   * Tell the server we are leaving the party/game.
   */
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
  /*
   * The game becomes active immediately.
   * This makes the Multiplayer tab ask for
   * confirmation if clicked while playing.
   */
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
  /*
   * If the user switched mode while the
   * request was loading, don't continue.
   */
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

  /*
   * Find the next timing from the master list.
   *
   * Example:
   *
   * 0.3 -> 0.5
   * 0.5 -> 1
   * 1   -> 5
   * 5   -> 10
   */
  const nextDuration =
    SINGLE_REVEAL_TIMINGS.find(
      (value) =>
        value > currentDuration
    );

  /*
   * There is no next timing,
   * or the whole clip is already revealed.
   */
  if (
    !nextDuration ||
    currentDuration >= actualDuration
  ) {
    giveUpSingle();
    return;
  }

  /*
   * Never reveal more than the actual
   * duration of the audio clip.
   */
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

    // Always update the scoreboard.
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

    /*
     * This is the actual point at which
     * multiplayer becomes an active game.
     */
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

    // Update the current player's score
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

    // If the server sends the full player list,
    // update the live scoreboard and lobby player list.
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

    // Show whether the answer was correct
    if (
      data?.correct !== undefined
    ) {
      showMultiAnswerStatus(
        data.correct
          ? "Correct!"
          : "Wrong!",
        Boolean(data.correct)
      );
    }

    // Fallback if the server only sends points
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

    showMultiFinal();

    renderFinalScoreboard(
      data?.players ||
        data?.scoreboard ||
        data?.results ||
        []
    );
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
    Boolean(party.gameFinished);

  multiState.totalRounds =
    Number(
      party.totalRounds ||
        party.rounds ||
        multiState.totalRounds
    );

  // Only replace the player list when the server
  // actually included one.
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

  players.forEach(
    (player) => {
      const row =
        document.createElement("div");

      row.className =
        "player-row";

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

function renderMultiScoreboard(players) {
  if (!multiScoreboard) {
    return;
  }

  multiScoreboard.innerHTML = "";

  if (!Array.isArray(players)) {
    return;
  }

  const sorted =
    [...players].sort(
      (a, b) =>
        getPlayerScore(b) -
        getPlayerScore(a)
    );

  sorted.forEach(
    (player, index) => {
      const row =
        document.createElement("div");

      row.className = "score-row";

      const position =
        document.createElement("span");

      position.className =
        "score-position";

      position.textContent =
        String(index + 1);

      const name =
        document.createElement("span");

      name.className =
        "score-name";

      name.textContent =
        player.name ||
        player.username ||
        "Player";

      const score =
        document.createElement("strong");

      score.className =
        "score-value";

      score.textContent =
        String(
          getPlayerScore(player)
        );

      row.appendChild(position);
      row.appendChild(name);
      row.appendChild(score);

      multiScoreboard.appendChild(row);
    }
  );

  // Find the current player using any of the
  // common socket/player ID property names.
  const me =
    players.find(
      (player) => {
        const id =
          player.id ??
          player.socketId ??
          player.playerId;

        return (
          id !== undefined &&
          String(id) ===
            String(socket.id)
        );
      }
    );

  if (me && multiScore) {
    multiScore.textContent =
      String(
        getPlayerScore(me)
      );
  }

  if (multiPlayerCount) {
    multiPlayerCount.textContent =
      String(players.length);
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
    ) || 20;

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
    multiProgress.style.width = "0%";
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
      multiRoundProgress.style.width =
        `${
          (remaining / total) *
          100
        }%`;
    }

    if (remaining <= 0) {
      if (!multiState.answered) {
        submitMultiAnswer(null);
      }

      return;
    }

    multiState.timer =
      setTimeout(update, 50);
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
        document.createElement(
          "button"
        );

      button.type = "button";
      button.className =
        "choice-button";

      const number =
        document.createElement(
          "span"
        );

      number.className =
        "choice-number";

      number.textContent =
        String(index + 1);

      const title =
        document.createElement(
          "span"
        );

      title.className =
        "choice-title";

      title.textContent =
        getChoiceTitle(choice);

      button.appendChild(number);
      button.appendChild(title);

      button.addEventListener(
        "click",
        () => {
          submitMultiAnswer(
            getChoiceId(choice)
          );
        }
      );

      multiChoices.appendChild(button);
    }
  );
}

function submitMultiAnswer(answerId) {
  if (
    !multiState.started ||
    multiState.answered
  ) {
    return;
  }

  multiState.answered = true;

  stopMultiAudio();
  disableMultiChoices();

  socket.emit("submitAnswer", {
    code: multiState.partyCode,
    partyCode: multiState.partyCode,
    answerId: answerId,
    videoId: answerId
  });

  if (answerId === null) {
    showMultiAnswerStatus(
      "Time's up!",
      false
    );
  } else {
    showMultiAnswerStatus(
      "Answer submitted!",
      true
    );
  }
}

function disableMultiChoices() {
  multiChoices
    ?.querySelectorAll("button")
    .forEach(
      (button) => {
        button.disabled = true;
      }
    );
}

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

  multiState.started = false;

  showMultiRoundResult();

  const answer =
    data?.answer ||
    data?.correctAnswer ||
    data?.answerTitle ||
    "Round complete";

  if (roundAnswer) {
    roundAnswer.textContent =
      typeof answer === "string"
        ? answer
        : getChoiceTitle(answer);
  }

  renderRoundResults(
    data?.players ||
      data?.results ||
      data?.scoreboard ||
      []
  );
}

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

  players.forEach(
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

      roundResults.appendChild(row);
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

      row.className = "score-row";

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
        String(player.score || 0);

      row.appendChild(position);
      row.appendChild(name);
      row.appendChild(score);

      finalScoreboard.appendChild(row);
    }
  );
}

// ============================================================
// MULTIPLAYER SCREENS
// ============================================================

function showMultiSetup() {
  multiSetup?.classList.remove("hidden");
  multiLobby?.classList.add("hidden");
  multiGame?.classList.add("hidden");
  multiRoundResult?.classList.add("hidden");
  multiFinalResult?.classList.add("hidden");
}

function showMultiLobby() {
  multiSetup?.classList.add("hidden");
  multiLobby?.classList.remove("hidden");
  multiGame?.classList.add("hidden");
  multiRoundResult?.classList.add("hidden");
  multiFinalResult?.classList.add("hidden");

  updateLobbyUI();
}

function showMultiGame() {
  multiSetup?.classList.add("hidden");
  multiLobby?.classList.add("hidden");
  multiGame?.classList.remove("hidden");
  multiRoundResult?.classList.add("hidden");
  multiFinalResult?.classList.add("hidden");
}

function showMultiFinal() {
  multiSetup?.classList.add("hidden");
  multiLobby?.classList.add("hidden");
  multiGame?.classList.add("hidden");
  multiRoundResult?.classList.add("hidden");
  multiFinalResult?.classList.remove("hidden");
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

  multiState.started = false;
  multiState.finished = false;

  multiState.roundNumber = 0;
  multiState.totalRounds = 10;

  multiState.duration = 20;

  multiState.audioDuration = 0;
  multiState.startTime = 0;
  multiState.startAt = null;

  multiState.choices = [];
  multiState.answered = false;
  multiState.players = [];

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
// RESET SINGLE STATE
// ============================================================

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