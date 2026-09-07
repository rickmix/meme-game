const $ = (s) => document.querySelector(s);

// ============================================================
// SOCKET.IO
// ============================================================

const socket = io();

// ============================================================
// SINGLE PLAYER
// ============================================================

const audio = $("#audio");
const clipAudio = $("#clipAudio");

let state = {
    score: 0,
    round: 0,
    seconds: 0.3,
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

// ============================================================
// SINGLE PLAYER - NEW ROUND
// ============================================================

async function newRound() {
    $("#setupError").textContent = "";

    const response = await fetch("/api/game");
    const data = await response.json();

    if (!response.ok) {
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

    $("#progress").style.width = "0%";

    setupAnswerInput();
}

// ============================================================
// AUTOCOMPLETE
// ============================================================

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
        .filter((choice) =>
            choice.title.toLowerCase().includes(query)
        )
        .slice(0, 6);

    matches.forEach((choice) => {
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

// ============================================================
// SUBMIT ANSWER
// ============================================================

function submitTypedAnswer() {
    if (state.won) {
        return;
    }

    const input = $("#answerInput");

    const typed = input.value.trim().toLowerCase();

    if (!typed) {
        return;
    }

    let match = state.choices.find(
        (choice) =>
            choice.title.trim().toLowerCase() === typed
    );

    if (!match) {
        const matches = state.choices.filter((choice) =>
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

// ============================================================
// GUESS
// ============================================================

function guess(id) {
    if (state.won) {
        return;
    }

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

        clipAudio.play().catch(() => {});

        showResult(
            true,
            `Correct! +${pts} points`
        );
    } else {
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

// ============================================================
// SINGLE PLAYER AUDIO
// ============================================================

function playClip() {
    audio.currentTime = 0;

    audio.play().catch(() => {});

    $("#durationLabel").textContent =
        `${state.seconds}s`;

    $("#progress").style.width = "0%";
}

function revealMore() {
    if (state.won) {
        return;
    }

    const currentIndex =
        REVEAL_TIMES.indexOf(state.seconds);

    const nextIndex = currentIndex + 1;

    if (nextIndex >= REVEAL_TIMES.length) {
        showResult(
            false,
            "No more audio. The answer is revealed."
        );

        return;
    }

    state.seconds = REVEAL_TIMES[nextIndex];

    $("#clipTime").textContent =
        `${state.seconds}s`;

    $("#durationLabel").textContent =
        `${state.seconds}s`;

    playClip();
}

// ============================================================
// SINGLE PLAYER RESULT
// ============================================================

function showResult(correct, text) {
    const result = $("#result");

    result.textContent = text;

    result.className =
        `result ${correct ? "success" : "failure"}`;

    result.classList.remove("hidden");

    setTimeout(() => {
        if (!correct) {
            const answer = state.choices.find(
                (video) => video.id === state.answerId
            );

            result.textContent +=
                ` Answer: ${answer?.title || "unknown"}`;
        }

        const next = document.createElement("button");

        next.className = "primary next";
        next.textContent = "Next round";

        next.onclick = () => {
            next.remove();
            newRound();
        };

        result.appendChild(next);
    }, 50);
}

// ============================================================
// SINGLE PLAYER EVENTS
// ============================================================

$("#startBtn").onclick = async () => {
    try {
        await newRound();

        $("#setup").classList.add("hidden");
        $("#game").classList.remove("hidden");
    } catch (error) {
        $("#setupError").textContent = error.message;
    }
};

$("#playBtn").onclick = playClip;

$("#dontKnow").onclick = revealMore;

$("#submitAnswer").onclick = submitTypedAnswer;

$("#answerInput").addEventListener(
    "input",
    showSuggestions
);

$("#answerInput").addEventListener(
    "keydown",
    (event) => {
        if (event.key === "Enter") {
            event.preventDefault();

            submitTypedAnswer();
        }
    }
);

document.addEventListener("click", (event) => {
    const answerBox =
        document.querySelector(".answer-box");

    if (
        answerBox &&
        !answerBox.contains(event.target)
    ) {
        $("#suggestions").innerHTML = "";
    }
});

audio.addEventListener("timeupdate", () => {
    const pct = Math.min(
        100,
        (audio.currentTime / state.seconds) * 100
    );

    $("#progress").style.width = `${pct}%`;

    if (audio.currentTime >= state.seconds) {
        audio.pause();
    }
});

audio.addEventListener("ended", () => {
    $("#progress").style.width = "100%";
});

// ============================================================
// MODE SWITCHING
// ============================================================

const singleTab = $("#singleTab");
const multiTab = $("#multiTab");

const singlePlayer = $("#singlePlayer");
const multiplayer = $("#multiplayer");

singleTab.onclick = () => {
    singleTab.classList.add("active");
    multiTab.classList.remove("active");

    singlePlayer.classList.remove("hidden");
    multiplayer.classList.add("hidden");
};

multiTab.onclick = () => {
    multiTab.classList.add("active");
    singleTab.classList.remove("active");

    multiplayer.classList.remove("hidden");
    singlePlayer.classList.add("hidden");
};

// ============================================================
// MULTIPLAYER STATE
// ============================================================

let multiState = {
    party: null,
    myPlayerId: socket.id,
    answered: false,
    roundActive: false,
    startAt: null,
    duration: 20
};

socket.on("connect", () => {
    multiState.myPlayerId = socket.id;
});

// ============================================================
// MULTIPLAYER DOM
// ============================================================

const multiSetup = $("#multiSetup");
const multiLobby = $("#multiLobby");
const multiGame = $("#multiGame");
const multiRoundResult = $("#multiRoundResult");
const multiFinalResult = $("#multiFinalResult");

const multiAudio = $("#multiAudio");

// ============================================================
// MULTIPLAYER ERROR
// ============================================================

socket.on("errorMessage", (data) => {
    const message =
        data?.message || "Something went wrong.";

    $("#multiSetupError").textContent = message;
    $("#lobbyHint").textContent = message;
});

// ============================================================
// CREATE PARTY
// ============================================================

$("#createPartyBtn").onclick = () => {
    const name = $("#createName")
        .value
        .trim();

    const rounds = Number(
        $("#roundCount").value
    );

    $("#multiSetupError").textContent = "";

    socket.emit("createParty", {
        name,
        rounds
    });
};

// ============================================================
// JOIN PARTY
// ============================================================

$("#joinPartyBtn").onclick = () => {
    const name = $("#joinName")
        .value
        .trim();

    const code = $("#partyCodeInput")
        .value
        .trim()
        .toUpperCase();

    $("#multiSetupError").textContent = "";

    socket.emit("joinParty", {
        name,
        code
    });
};

// ============================================================
// PARTY CREATED
// ============================================================

socket.on("partyCreated", (party) => {
    multiState.party = party;
    multiState.myPlayerId = socket.id;

    showLobby();
});

// ============================================================
// PARTY JOINED
// ============================================================

socket.on("partyJoined", (party) => {
    multiState.party = party;
    multiState.myPlayerId = socket.id;

    showLobby();
});

// ============================================================
// PARTY UPDATED
// ============================================================

socket.on("partyUpdated", (party) => {
    multiState.party = party;
    multiState.myPlayerId = socket.id;

    if (party.gameFinished) {
        return;
    }

    if (party.started) {
        showMultiplayerGame();
    } else {
        showLobby();
    }

    updatePartyUI();
});

// ============================================================
// SHOW LOBBY
// ============================================================

function showLobby() {
    multiSetup.classList.add("hidden");

    multiLobby.classList.remove("hidden");

    multiGame.classList.add("hidden");

    multiRoundResult.classList.add("hidden");

    multiFinalResult.classList.add("hidden");

    updatePartyUI();
}

// ============================================================
// UPDATE LOBBY
// ============================================================

function updatePartyUI() {
    const party = multiState.party;

    if (!party) {
        return;
    }

    $("#partyCode").textContent = party.code;

    $("#lobbyRounds").textContent =
        `${party.rounds} rounds`;

    $("#multiPlayerCount").textContent =
        party.players.length;

    // Update the round display.
    //
    // IMPORTANT:
    // There is no #multiRound or #multiTotalRounds
    // in the current index.html.
    updateRoundDisplay(
        Math.max(party.roundNumber || 1, 1),
        party.rounds
    );

    // ----------------------------------------------------------
    // PLAYER LIST
    // ----------------------------------------------------------

    const list = $("#playerList");

    list.innerHTML = "";

    party.players.forEach((player) => {
        const row = document.createElement("div");

        row.className = "player-row";

        const left = document.createElement("strong");

        left.textContent = player.name;

        if (player.id === party.hostId) {
            left.textContent += " 👑";
        }

        const right = document.createElement("span");

        right.textContent =
            `${player.score} pts`;

        row.appendChild(left);
        row.appendChild(right);

        list.appendChild(row);
    });

    // ----------------------------------------------------------
    // START BUTTON
    // ----------------------------------------------------------

    const isHost =
        party.hostId === socket.id;

    $("#startPartyBtn").classList.toggle(
        "hidden",
        party.started || !isHost
    );

    if (party.started) {
        $("#lobbyHint").textContent =
            "Game in progress.";
    } else if (isHost) {
        $("#lobbyHint").textContent =
            "Choose your rounds and start when everyone is ready.";
    } else {
        $("#lobbyHint").textContent =
            "Waiting for the host to start the game.";
    }
}

// ============================================================
// ROUND DISPLAY
// ============================================================

function updateRoundDisplay(round, totalRounds) {
    const current =
        $("#multiRoundCurrent");

    const total =
        document.querySelector(
            ".multi-round-total"
        );

    const progress =
        $("#multiRoundProgress");

    if (current) {
        current.textContent = round;
    }

    if (total) {
        total.textContent = `/ ${totalRounds}`;
    }

    if (progress) {
        const percentage =
            totalRounds > 0
                ? Math.min(
                      100,
                      Math.max(
                          0,
                          ((round - 1) / totalRounds) * 100
                      )
                  )
                : 0;

        progress.style.width =
            `${percentage}%`;
    }
}

// ============================================================
// START PARTY
// ============================================================

$("#startPartyBtn").onclick = () => {
    socket.emit("startParty");
};

// ============================================================
// HOST CHANGED
// ============================================================

socket.on("hostChanged", (data) => {
    if (multiState.party) {
        multiState.party.hostId = data.hostId;

        updatePartyUI();
    }
});

// ============================================================
// SHOW MULTIPLAYER GAME
// ============================================================

function showMultiplayerGame() {
    multiSetup.classList.add("hidden");

    multiLobby.classList.add("hidden");

    multiGame.classList.remove("hidden");

    multiRoundResult.classList.add("hidden");

    multiFinalResult.classList.add("hidden");
}

// ============================================================
// NEW MULTIPLAYER ROUND
// ============================================================

socket.on("roundStarted", (round) => {
    showMultiplayerGame();

    multiState.answered = false;
    multiState.roundActive = true;
    multiState.startAt = round.startAt;
    multiState.duration = round.duration;

    // --------------------------------------------------------
    // ROUND DISPLAY
    // --------------------------------------------------------

    updateRoundDisplay(
        round.roundNumber,
        round.totalRounds
    );

    $("#multiDuration").textContent =
        `${round.duration}s`;

    $("#multiAnswerStatus").className =
        "answer-status hidden";

    $("#multiAnswerStatus").textContent = "";

    $("#multiProgress").style.width = "0%";

    // --------------------------------------------------------
    // BUILD SIX ANSWER CHOICES
    // --------------------------------------------------------

    const choices = $("#multiChoices");

    choices.innerHTML = "";

    if (!Array.isArray(round.choices)) {
        console.error(
            "No multiplayer choices received:",
            round
        );

        return;
    }

    round.choices.forEach((choice, index) => {
        const button =
            document.createElement("button");

        button.type = "button";
        button.className = "choice-button";
        button.dataset.id = choice.id;

        const number =
            document.createElement("span");

        number.className = "choice-number";
        number.textContent = index + 1;

        const title =
            document.createElement("span");

        title.className = "choice-title";
        title.textContent = choice.title;

        button.appendChild(number);
        button.appendChild(title);

        button.onclick = () => {
            submitMultiplayerAnswer(
                choice.id
            );
        };

        choices.appendChild(button);
    });

    // --------------------------------------------------------
    // SET AUDIO
    // --------------------------------------------------------

    multiAudio.pause();

    multiAudio.src = round.audioUrl;

    multiAudio.load();

    // --------------------------------------------------------
    // UPDATE SCOREBOARD
    // --------------------------------------------------------

    updateMultiplayerScoreboard();

    // --------------------------------------------------------
    // SYNCHRONIZED PLAYBACK
    // --------------------------------------------------------

    const delay = Math.max(
        0,
        round.startAt - Date.now()
    );

    setTimeout(() => {
        if (!multiState.roundActive) {
            return;
        }

        multiAudio.currentTime = 0;

        multiAudio.play().catch(() => {
            // Browser may block autoplay.
        });
    }, delay);
});

// ============================================================
// MULTIPLAYER PLAY BUTTON
// ============================================================

$("#multiPlayBtn").onclick = () => {
    if (!multiState.roundActive) {
        return;
    }

    multiAudio.play().catch(() => {});
};

// ============================================================
// MULTIPLAYER ANSWER
// ============================================================

function submitMultiplayerAnswer(choiceId) {
    if (
        !multiState.roundActive ||
        multiState.answered
    ) {
        return;
    }

    multiState.answered = true;

    const buttons =
        document.querySelectorAll(
            ".choice-button"
        );

    buttons.forEach((button) => {
        button.disabled = true;
    });

    socket.emit("submitAnswer", {
        choiceId
    });
}

// ============================================================
// ANSWER ACCEPTED
// ============================================================

socket.on("answerAccepted", (data) => {
    const status =
        $("#multiAnswerStatus");

    status.classList.remove("hidden");

    if (data.correct) {
        status.className =
            "answer-status success";

        status.textContent =
            `Correct! +${data.points} points`;
    } else {
        status.className =
            "answer-status failure";

        status.textContent =
            "Wrong answer — 0 points.";
    }
});

// ============================================================
// MULTIPLAYER SCOREBOARD
// ============================================================

function updateMultiplayerScoreboard() {
    const party = multiState.party;

    if (!party) {
        return;
    }

    const scoreboard =
        $("#multiScoreboard");

    scoreboard.innerHTML = "";

    const players = [...party.players].sort(
        (a, b) => b.score - a.score
    );

    players.forEach((player, index) => {
        const row =
            document.createElement("div");

        row.className = "score-row";

        const position =
            document.createElement("span");

        position.textContent =
            `${index + 1}.`;

        const name =
            document.createElement("strong");

        name.textContent = player.name;

        const score =
            document.createElement("span");

        score.textContent =
            `${player.score} pts`;

        row.appendChild(position);
        row.appendChild(name);
        row.appendChild(score);

        scoreboard.appendChild(row);
    });

    const me = party.players.find(
        (player) => player.id === socket.id
    );

    if (me) {
        $("#multiScore").textContent =
            me.score;
    }

    $("#multiPlayerCount").textContent =
        party.players.length;
}

// ============================================================
// ROUND FINISHED
// ============================================================

socket.on("roundFinished", (data) => {
    multiState.roundActive = false;

    multiAudio.pause();

    $("#multiProgress").style.width =
        "100%";

    // --------------------------------------------------------
    // ROUND PROGRESS
    // --------------------------------------------------------

    const totalRounds =
        multiState.party?.rounds || 1;

    const completedRound =
        Number(
            $("#multiRoundCurrent").textContent
        ) || 1;

    const roundProgress =
        Math.min(
            100,
            Math.max(
                0,
                (completedRound / totalRounds) * 100
            )
        );

    if ($("#multiRoundProgress")) {
        $("#multiRoundProgress").style.width =
            `${roundProgress}%`;
    }

    // --------------------------------------------------------
    // ANSWER
    // --------------------------------------------------------

    const answer =
        $("#roundAnswer");

    answer.textContent =
        `The answer was: ${data.correctAnswer.title}`;

    // --------------------------------------------------------
    // ROUND RESULTS
    // --------------------------------------------------------

    const results =
        $("#roundResults");

    results.innerHTML = "";

    data.results.forEach((result, index) => {
        const row =
            document.createElement("div");

        row.className =
            "round-result-row";

        const name =
            document.createElement("span");

        name.textContent =
            `${index + 1}. ${result.name}`;

        const points =
            document.createElement("strong");

        points.textContent =
            `+${result.points}`;

        row.appendChild(name);
        row.appendChild(points);

        results.appendChild(row);
    });

    // --------------------------------------------------------
    // SHOW ROUND RESULT
    // --------------------------------------------------------

    multiRoundResult.classList.remove(
        "hidden"
    );

    // --------------------------------------------------------
    // DISABLE CHOICES
    // --------------------------------------------------------

    document
        .querySelectorAll(".choice-button")
        .forEach((button) => {
            button.disabled = true;
        });

    setTimeout(() => {
        multiRoundResult.classList.add(
            "hidden"
        );
    }, 3200);
});

// ============================================================
// GAME FINISHED
// ============================================================

socket.on("gameFinished", (data) => {
    multiState.roundActive = false;

    multiState.party = {
        ...multiState.party,
        gameFinished: true,
        players: data.players
    };

    multiAudio.pause();

    multiGame.classList.add("hidden");

    multiLobby.classList.add("hidden");

    multiRoundResult.classList.add("hidden");

    multiFinalResult.classList.remove(
        "hidden"
    );

    if ($("#multiRoundProgress")) {
        $("#multiRoundProgress").style.width =
            "100%";
    }

    renderFinalScoreboard(data.players);
});

// ============================================================
// FINAL SCOREBOARD
// ============================================================

function renderFinalScoreboard(players) {
    const scoreboard =
        $("#finalScoreboard");

    scoreboard.innerHTML = "";

    players.forEach((player, index) => {
        const row =
            document.createElement("div");

        row.className = "score-row";

        const position =
            document.createElement("span");

        if (index === 0) {
            position.textContent = "🥇";
        } else if (index === 1) {
            position.textContent = "🥈";
        } else if (index === 2) {
            position.textContent = "🥉";
        } else {
            position.textContent =
                `${index + 1}.`;
        }

        const name =
            document.createElement("strong");

        name.textContent = player.name;

        const score =
            document.createElement("span");

        score.textContent =
            `${player.score} pts`;

        row.appendChild(position);
        row.appendChild(name);
        row.appendChild(score);

        scoreboard.appendChild(row);
    });
}

// ============================================================
// LEAVE PARTY
// ============================================================

function leaveMultiplayerParty() {
    socket.emit("leaveParty");

    multiState.party = null;
    multiState.roundActive = false;
    multiState.answered = false;

    multiAudio.pause();

    multiLobby.classList.add("hidden");
    multiGame.classList.add("hidden");
    multiRoundResult.classList.add("hidden");
    multiFinalResult.classList.add("hidden");

    multiSetup.classList.remove("hidden");

    $("#multiSetupError").textContent = "";

    $("#lobbyHint").textContent =
        "Share the party code with your friends.";

    if ($("#multiRoundProgress")) {
        $("#multiRoundProgress").style.width =
            "0%";
    }

    $("#multiChoices").innerHTML = "";

    $("#multiAnswerStatus").className =
        "answer-status hidden";

    $("#multiScoreboard").innerHTML = "";

    $("#multiScore").textContent = "0";

    $("#multiPlayerCount").textContent = "0";
}

$("#leavePartyBtn").onclick =
    leaveMultiplayerParty;

$("#finalLeaveBtn").onclick =
    leaveMultiplayerParty;

// ============================================================
// MULTIPLAYER AUDIO PROGRESS
// ============================================================

multiAudio.addEventListener(
    "timeupdate",
    () => {
        if (!multiState.roundActive) {
            return;
        }

        const pct = Math.min(
            100,
            (multiAudio.currentTime /
                multiState.duration) *
                100
        );

        $("#multiProgress").style.width =
            `${pct}%`;

        if (
            multiAudio.currentTime >=
            multiState.duration
        ) {
            multiAudio.pause();
        }
    }
);

multiAudio.addEventListener(
    "ended",
    () => {
        $("#multiProgress").style.width =
            "100%";
    }
);