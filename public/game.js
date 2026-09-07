const $ = s => document.querySelector(s);
const audio = $("#audio");
const clipAudio = $("#clipAudio");

let state = {
  score: 0,
  round: 0,
  seconds: 1,
  maxSeconds: 20,
  answerId: null,
  choices: [],
  won: false
};

const REVEAL_TIMES = [
  0.3,
  0.5,
  0.7,
  1,
  1.5,
  2,
  3,
  4,
  5,
  6,
  7,
  8,
  9,
  10,
  11,
  12,
  13,
  14,
  15,
  16,
  17,
  18,
  19,
  20
];

const POINTS = {
  0.3: 1000,
  0.5: 950,
  0.7: 900,
  1: 850,
  1.5: 750,
  2: 650,
  3: 550,
  4: 450,
  5: 400,
  6: 350,
  7: 300,
  8: 275,
  9: 250,
  10: 225,
  11: 200,
  12: 175,
  13: 150,
  14: 125,
  15: 100,
  16: 80,
  17: 60,
  18: 50,
  19: 40,
  20: 25
};

function pointsFor(sec) {
  return POINTS[sec] || 25;
}


// ─────────────────────────────────────────────
// NEW ROUND
// ─────────────────────────────────────────────

async function newRound() {
  $("#setupError").textContent = "";

  const r = await fetch("/api/game");
  const data = await r.json();

  if (!r.ok) {
    throw new Error(data.error);
  }

  state.round++;
  state.seconds = REVEAL_TIMES[0];
  state.answerId = data.answerId;
  state.choices = data.choices;
  state.won = false;

  audio.src = data.audioUrl;
  audio.load();

  $("#round").textContent = state.round;
  $("#clipTime").textContent = `${state.seconds}s`;
  $("#durationLabel").textContent = `${state.seconds}s`;

  $("#result").classList.add("hidden");
  $("#dontKnow").disabled = false;

  setupAnswerInput();
}


// ─────────────────────────────────────────────
// AUTOCOMPLETE
// ─────────────────────────────────────────────

function setupAnswerInput() {
  const input = $("#answerInput");
  const suggestions = $("#suggestions");
  const submit = $("#submitAnswer");

  input.value = "";
  suggestions.innerHTML = "";

  input.disabled = false;
  submit.disabled = false;

  input.focus();
}


function showSuggestions() {
  const input = $("#answerInput");
  const box = $("#suggestions");

  const query = input.value.trim().toLowerCase();

  box.innerHTML = "";

  if (!query || state.won) {
    return;
  }

  const matches = state.choices
    .filter(choice =>
      choice.title.toLowerCase().includes(query)
    )
    .slice(0, 6);

  matches.forEach(choice => {
    const button = document.createElement("button");

    button.type = "button";
    button.className = "suggestion";
    button.textContent = choice.title;

    button.addEventListener("click", () => {
      input.value = choice.title;
      box.innerHTML = "";

      guess(choice.id);
    });

    box.appendChild(button);
  });
}


// ─────────────────────────────────────────────
// SUBMIT ANSWER
// ─────────────────────────────────────────────

function submitTypedAnswer() {
  if (state.won) return;

  const input = $("#answerInput");
  const typed = input.value.trim().toLowerCase();

  if (!typed) return;

  /*
   * First try an exact title match.
   */
  let match = state.choices.find(
    choice => choice.title.trim().toLowerCase() === typed
  );

  /*
   * If there isn't an exact match, allow a unique
   * partial match.
   *
   * Example:
   * "Rook" -> "Rook"
   */
  if (!match) {
    const matches = state.choices.filter(choice =>
      choice.title.toLowerCase().includes(typed)
    );

    if (matches.length === 1) {
      match = matches[0];
    }
  }

  if (!match) {
    $("#result").className = "result failure";
    $("#result").textContent =
      "Choose one of the suggested videos.";
    $("#result").classList.remove("hidden");

    return;
  }

  guess(match.id);
}


// ─────────────────────────────────────────────
// GUESS
// ─────────────────────────────────────────────

function guess(id) {
  if (state.won) return;

  if (id === state.answerId) {

    state.won = true;

    const pts = pointsFor(state.seconds);

    state.score += pts;

    $("#score").textContent = state.score;

    $("#answerInput").disabled = true;
    $("#submitAnswer").disabled = true;
    $("#dontKnow").disabled = true;

    $("#suggestions").innerHTML = "";

    clipAudio.src = audio.src;
    clipAudio.classList.remove("hidden");
    clipAudio.currentTime = 0;
    clipAudio.play();

    showResult(
      true,
      `Correct! +${pts} points`
    );

  } else {

    /*
     * Wrong answer.
     *
     * We don't end the round because the player
     * can continue listening and try again.
     */

    $("#answerInput").value = "";

    $("#suggestions").innerHTML = "";

    const result = $("#result");

    result.textContent = "Not quite — try again.";
    result.className = "result failure";
    result.classList.remove("hidden");

    setTimeout(() => {
      if (!state.won) {
        result.classList.add("hidden");
      }
    }, 1200);
  }
}


// ─────────────────────────────────────────────
// PLAY AUDIO
// ─────────────────────────────────────────────

function playClip() {
  audio.currentTime = 0;
  audio.play();

  $("#durationLabel").textContent =
    `${state.seconds}.0s`;
}


// ─────────────────────────────────────────────
// REVEAL MORE AUDIO
// ─────────────────────────────────────────────

function revealMore() {
  if (state.won) return;

  const currentIndex =
    REVEAL_TIMES.indexOf(state.seconds);

  const nextIndex = currentIndex + 1;

  if (
    nextIndex >= REVEAL_TIMES.length
  ) {
    showResult(
      false,
      "No more audio. The answer is revealed."
    );

    return;
  }

  state.seconds =
    REVEAL_TIMES[nextIndex];

  $("#clipTime").textContent =
    `${state.seconds}s`;

  $("#durationLabel").textContent =
    `${state.seconds}s`;

  playClip();
}


// ─────────────────────────────────────────────
// RESULT
// ─────────────────────────────────────────────

function showResult(correct, text) {
  const r = $("#result");

  r.textContent = text;

  r.className =
    `result ${correct ? "success" : "failure"}`;

  r.classList.remove("hidden");

  setTimeout(() => {

    if (!correct) {
      const answer = state.choices.find(
        v => v.id === state.answerId
      );

      r.textContent +=
        ` Answer: ${answer?.title || "unknown"}`;
    }

    const next = document.createElement("button");

    next.className = "primary next";
    next.textContent = "Next round";

    next.onclick = () => {
      next.remove();
      newRound();
    };

    r.appendChild(next);

  }, 50);
}


// ─────────────────────────────────────────────
// EVENT LISTENERS
// ─────────────────────────────────────────────

$("#startBtn").onclick = async () => {
  try {
    await newRound();

    $("#setup").classList.add("hidden");
    $("#game").classList.remove("hidden");

  } catch (e) {
    $("#setupError").textContent = e.message;
  }
};


$("#playBtn").onclick = playClip;

$("#dontKnow").onclick = revealMore;


// Typing
$("#answerInput").addEventListener(
  "input",
  showSuggestions
);


// Enter key
$("#answerInput").addEventListener(
  "keydown",
  event => {

    if (event.key === "Enter") {
      event.preventDefault();

      submitTypedAnswer();
    }

  }
);


// Close suggestions when clicking elsewhere
document.addEventListener("click", event => {

  const answerBox = document.querySelector(".answer-box");

  if (
    answerBox &&
    !answerBox.contains(event.target)
  ) {
    $("#suggestions").innerHTML = "";
  }

});


// ─────────────────────────────────────────────
// AUDIO PROGRESS
// ─────────────────────────────────────────────

audio.addEventListener("timeupdate", () => {

  const pct =
    Math.min(
      100,
      audio.currentTime / state.seconds * 100
    );

  $("#progress").style.width = `${pct}%`;

  if (audio.currentTime >= state.seconds) {
    audio.pause();
  }

});


audio.addEventListener("ended", () => {
  $("#progress").style.width = "100%";
});