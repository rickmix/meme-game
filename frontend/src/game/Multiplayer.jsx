import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState
} from "react";

import { io } from "socket.io-client";
import confetti from "canvas-confetti";

import Scoreboard from "./Scoreboard.jsx";
import Lobby from "./Lobby.jsx";

const socket = io();

const INITIAL_STATE = {
  inParty: false,
  partyCode: null,
  isHost: false,
  hostId: null,
  players: [],
  started: false,
  finished: false,
  roundNumber: 0,
  totalRounds: 10,
  duration: 15,
  audioDuration: 0,
  startTime: 0,
  startAt: null,
  choices: [],
  answered: false,
  selectedAnswerId: null,
  correctAnswerId: null,
  timeUp: false,
  playing: false,
  answerCorrect: null
};

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

function getPlayerId(player) {
  return (
    player?.id ??
    player?.socketId ??
    player?.playerId ??
    player?.userId ??
    null
  );
}

function getPlayerName(player) {
  return (
    player?.name ??
    player?.username ??
    "Player"
  );
}

function getPlayerScore(player) {
  return Number(
    player?.score ??
    player?.points ??
    player?.totalScore ??
    player?.roundScore ??
    player?.roundPoints ??
    0
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
    player?.points !== undefined
  ) {
    return `+${player.points}`;
  }

  if (
    player?.roundPoints !== undefined
  ) {
    return `+${player.roundPoints}`;
  }

  if (
    player?.score !== undefined
  ) {
    return String(player.score);
  }

  if (
    player?.totalScore !== undefined
  ) {
    return String(
      player.totalScore
    );
  }

  return "0";
}

const Multiplayer = forwardRef(
  function Multiplayer(
    {
      onGameActiveChange
    },
    ref
  ) {
    const [state, setState] =
      useState(INITIAL_STATE);

    const [createName, setCreateName] =
      useState("");

    const [joinName, setJoinName] =
      useState("");

    const [partyCodeInput, setPartyCodeInput] =
      useState("");

    const [roundCount, setRoundCount] =
      useState("10");

    const [setupError, setSetupError] =
      useState("");

    const [roundResults, setRoundResults] =
      useState([]);

    const [finalPlayers, setFinalPlayers] =
      useState([]);

    const [winner, setWinner] =
      useState(null);

    const [winnerMessage, setWinnerMessage] =
      useState("");

    const audioRef =
      useRef(null);

    const multiProgressRef =
      useRef(null);

    const roundProgressRef =
      useRef(null);

    const clipTimerRef =
      useRef(null);

    const countdownTimerRef =
      useRef(null);

    const timerRef =
      useRef(null);

    const progressAnimationRef =
      useRef(null);

    const stateRef =
      useRef(state);

    const scoreboardRowsRef =
      useRef(null);

    const previousScoresRef =
      useRef(new Map());

    const roundScoresRef =
      useRef(new Map());

    useEffect(() => {
      stateRef.current = state;
    }, [state]);

    const clearTimers =
      useCallback(() => {
        clearTimeout(
          clipTimerRef.current
        );

        clearTimeout(
          countdownTimerRef.current
        );

        clearTimeout(
          timerRef.current
        );

        cancelAnimationFrame(
          progressAnimationRef.current
        );

        clipTimerRef.current = null;
        countdownTimerRef.current = null;
        timerRef.current = null;
        progressAnimationRef.current =
          null;
      }, []);

    const stopMultiAudio =
      useCallback(() => {
        clearTimeout(
          clipTimerRef.current
        );

        cancelAnimationFrame(
          progressAnimationRef.current
        );

        clipTimerRef.current = null;
        progressAnimationRef.current =
          null;

        const audio =
          audioRef.current;

        if (audio) {
          audio.pause();
        }

        if (
          multiProgressRef.current
        ) {
          multiProgressRef.current.style.width =
            "0%";
        }

        setState((current) => ({
          ...current,
          playing: false
        }));
      }, []);

    const cleanupMultiplayer =
      useCallback(() => {
        clearTimers();
        stopMultiAudio();

        if (
          stateRef.current.inParty
        ) {
          const code =
            stateRef.current.partyCode;

          if (code) {
            socket.emit(
              "leaveParty",
              {
                code,
                partyCode: code
              }
            );
          }
        }

        socket.disconnect();
      }, [
        clearTimers,
        stopMultiAudio
      ]);

    const resetState =
      useCallback(() => {
        clearTimers();

        const audio =
          audioRef.current;

        if (audio) {
          audio.pause();

          try {
            audio.currentTime = 0;
          } catch (error) {
            console.warn(error);
          }

          audio.removeAttribute(
            "src"
          );

          audio.load();
        }

        if (
          multiProgressRef.current
        ) {
          multiProgressRef.current.style.width =
            "0%";
        }

        if (
          roundProgressRef.current
        ) {
          roundProgressRef.current.style.width =
            "100%";

          roundProgressRef.current.classList.remove(
            "timer-green",
            "timer-orange",
            "timer-red"
          );
        }

        previousScoresRef.current =
          new Map();

        setState({
          ...INITIAL_STATE
        });

        setRoundResults([]);
        setFinalPlayers([]);
        setWinner(null);
        setWinnerMessage("");

        onGameActiveChange?.(
          false
        );
      }, [
        clearTimers,
        onGameActiveChange
      ]);

    const showSetup =
      useCallback(() => {
        setState((current) => ({
          ...current,
          started: false
        }));
      }, []);

    const showLobby =
      useCallback(() => {
        setRoundResults([]);
        setFinalPlayers([]);
        setWinner(null);
        setWinnerMessage("");
      }, []);

    const applyParty =
      useCallback(
        (party) => {
          if (!party) {
            return;
          }

          const players =
            party.players ||
            party.playerList ||
            [];

          const partyCode =
            party.code ||
            party.partyCode ||
            stateRef.current.partyCode;

          let isHost =
            stateRef.current.isHost;

          if (party.hostId) {
            isHost =
              String(
                party.hostId
              ) ===
              String(
                socket.id
              );
          }

          if (
            party.isHost !==
            undefined
          ) {
            isHost =
              Boolean(
                party.isHost
              );
          }

          const started =
            Boolean(
              party.started
            );

          const finished =
            Boolean(
              party.gameFinished ||
                party.finished
            );

          const totalRounds =
            Number(
              party.totalRounds ||
                party.rounds ||
                stateRef.current.totalRounds
            );

          setState((current) => ({
            ...current,
            inParty: true,
            partyCode,
            isHost,
            hostId:
              party.hostId ??
              current.hostId,
            players,
            started,
            finished,
            totalRounds
          }));

          if (started) {
            onGameActiveChange?.(
              true
            );
          }

          if (
            !started &&
            !finished
          ) {
            showLobby();
          }
        },
        [
          onGameActiveChange,
          showLobby
        ]
      );

    const createParty =
  useCallback(() => {
    const name =
      createName.trim();

    const rounds =
      Number(roundCount);

    if (!name) {
      setSetupError(
        "Please enter your name."
      );

      return;
    }

    setSetupError("");

    if (!socket.connected) {
      socket.connect();
    }

    socket.emit(
      "createParty",
      {
        name,
        rounds,
        totalRounds:
          rounds
      }
    );
  }, [
    createName,
    roundCount
  ]);

    const joinParty =
  useCallback(() => {
    const name =
      joinName.trim();

    const code =
      partyCodeInput
        .trim()
        .toUpperCase();

    if (!name) {
      setSetupError(
        "Please enter your name."
      );

      return;
    }

    if (!code) {
      setSetupError(
        "Please enter a party code."
      );

      return;
    }

    setSetupError("");

    if (!socket.connected) {
      socket.connect();
    }

    socket.emit(
      "joinParty",
      {
        name,
        code,
        partyCode: code
      }
    );
  }, [
    joinName,
    partyCodeInput
  ]);

    const startParty =
      useCallback(() => {
        if (
          !stateRef.current.partyCode
        ) {
          return;
        }

        socket.emit(
          "startParty",
          {
            code:
              stateRef.current
                .partyCode,
            partyCode:
              stateRef.current
                .partyCode
          }
        );
      }, []);

    const leaveParty =
      useCallback(() => {
        const code =
          stateRef.current.partyCode;

        if (code) {
          socket.emit(
            "leaveParty",
            {
              code,
              partyCode: code
            }
          );
        }

        resetState();
      }, [resetState]);

    const newGame =
      useCallback(() => {
        const code =
          stateRef.current.partyCode;

        if (!code) {
          return;
        }

        socket.emit(
          "newGame",
          {
            code,
            partyCode: code
          }
        );
      }, []);

    const updateAudioProgress =
      useCallback(
        (
          start,
          duration
        ) => {
          cancelAnimationFrame(
            progressAnimationRef.current
          );

          const update = () => {
            const audio =
              audioRef.current;

            const progress =
              multiProgressRef.current;

            if (
              !audio ||
              !progress
            ) {
              return;
            }

            const elapsed =
              Math.max(
                0,
                Math.min(
                  duration,
                  audio.currentTime -
                    start
                )
              );

            const percentage =
              duration > 0
                ? (elapsed /
                    duration) *
                  100
                : 0;

            progress.style.width =
              `${percentage}%`;

            if (
              !audio.paused &&
              elapsed < duration
            ) {
              progressAnimationRef.current =
                requestAnimationFrame(
                  update
                );
            }
          };

          update();
        },
        []
      );

    const submitMultiAnswer =
      useCallback(
        (answerId) => {
          const current =
            stateRef.current;

          if (
            current.answered
          ) {
            return;
          }

          setState((value) => ({
            ...value,
            answered: true,
            selectedAnswerId:
              answerId,
            timeUp:
              answerId === null,
            answerCorrect:
              null
          }));

          stopMultiAudio();

          if (
            roundProgressRef.current
          ) {
            roundProgressRef.current.style.width =
              "0%";
          }

          socket.emit(
            "submitAnswer",
            {
              code:
                current.partyCode,
              partyCode:
                current.partyCode,
              answerId,
              videoId: answerId
            }
          );
        },
        [stopMultiAudio]
      );

    const startAnswerTimer =
  useCallback(() => {
    clearTimeout(
      timerRef.current
    );

    const current =
      stateRef.current;

    const duration =
      Number(
        current.duration
      ) || 15;

    const startAt =
      current.startAt
        ? new Date(
            current.startAt
          ).getTime()
        : Date.now();

    const roundEnd =
      startAt +
      duration * 1000;

    const update = () => {
      const currentState =
        stateRef.current;

      if (
        !currentState.started ||
        currentState.finished
      ) {
        return;
      }

      const now =
        Date.now();

      const remaining =
        Math.max(
          0,
          roundEnd - now
        );

      const percentage =
        duration > 0
          ? (remaining /
              (duration * 1000)) *
            100
          : 0;

      if (
        roundProgressRef.current
      ) {
        const progress =
          roundProgressRef.current;

        progress.style.width =
          `${percentage}%`;

        progress.classList.remove(
          "timer-green",
          "timer-orange",
          "timer-red"
        );

        if (
          percentage <= 30
        ) {
          progress.classList.add(
            "timer-red"
          );
        } else if (
          percentage <= 60
        ) {
          progress.classList.add(
            "timer-orange"
          );
        } else {
          progress.classList.add(
            "timer-green"
          );
        }
      }

      if (remaining <= 0) {
  if (!currentState.answered) {
    submitMultiAnswer(null);
  }

  requestAnimationFrame(() => {
    const container =
      scoreboardRowsRef.current;

    if (!container) {
      return;
    }

    const rows =
      container.querySelectorAll(
        ".score-row"
      );

    rows.forEach((row) => {
      const playerId =
        row.dataset.playerId;

      if (!playerId) {
        return;
      }

      const scoreChange =
        roundScoresRef.current.get(
          String(playerId)
        );

      if (scoreChange === undefined) {
        row.classList.remove(
          "score-waiting",
          "finished"
        );

        row.classList.add(
          "incorrect"
        );
      }
    });
  });

  return;
}

      timerRef.current =
        setTimeout(
          update,
          50
        );
    };

    update();
  }, [
    submitMultiAnswer
  ]);

    const playMultiClip =
      useCallback(
        async () => {
          const audio =
            audioRef.current;

          if (!audio) {
            return;
          }

          try {
            const current =
              stateRef.current;

            const start =
              Number(
                current.startTime
              ) || 0;

            const duration =
              Number(
                current.audioDuration
              ) || 0;

            audio.currentTime =
              start;

            await audio.play();

            setState((current) => ({
              ...current,
              playing: true
            }));

            updateAudioProgress(
              start,
              duration
            );
          } catch (error) {
            console.error(
              "Multiplayer audio playback failed:",
              error
            );
          }
        },
        [
          updateAudioProgress
        ]
      );

    const startRound =
  useCallback(
    (round) => {
      clearTimers();

      stopMultiAudio();

      roundScoresRef.current =
        new Map();

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const container =
            scoreboardRowsRef.current;

          if (!container) {
            return;
          }

          const rows =
            container.querySelectorAll(
              ".score-row"
            );

          rows.forEach((row) => {
            row.classList.remove(
              "score-changed",
              "finished",
              "incorrect"
            );

            row.classList.add(
              "score-waiting"
            );

            const oldPoints =
              row.querySelector(
                ".round-score-animation"
              );

            if (oldPoints) {
              oldPoints.remove();
            }

            const nameElement =
              row.children[1];

            if (!nameElement) {
              return;
            }
          
          });
        });
      });

      const choices =
        Array.isArray(
          round?.choices
        )
          ? round.choices
          : [];

          const duration =
            Number(
              round?.duration
            ) ||
            Number(
              round?.roundDuration
            ) ||
            15;

          const audioDuration =
            Number(
              round?.audioDuration
            ) ||
            Number(
              round?.duration
            ) ||
            0;

          const startTime =
            Number(
              round?.startTime
            ) || 0;

          const startAt =
            round?.startAt ??
            null;

          setState((current) => ({
            ...current,
            inParty: true,
            started: true,
            finished: false,
            roundNumber:
              Number(
                round?.roundNumber
              ) ||
              current.roundNumber + 1,
            totalRounds:
              Number(
                round?.totalRounds
              ) ||
              current.totalRounds,
            duration,
            audioDuration,
            startTime,
            startAt,
            choices,
            answered: false,
            selectedAnswerId:
              null,
            correctAnswerId:
              null,
            timeUp: false,
            playing: false,
            answerCorrect:
              null
          }));

          setRoundResults([]);

          if (
            roundProgressRef.current
          ) {
            roundProgressRef.current.style.width =
              "100%";

            roundProgressRef.current.classList.remove(
              "timer-green",
              "timer-orange",
              "timer-red"
            );
          }

          if (
            multiProgressRef.current
          ) {
            multiProgressRef.current.style.width =
              "0%";
          }

          onGameActiveChange?.(
            true
          );

          startAnswerTimer();

          const audio =
            audioRef.current;

          if (
            !audio ||
            !round?.audioUrl
          ) {
            return;
          }

          audio.pause();

          try {
            audio.currentTime = 0;
          } catch (error) {
            console.warn(error);
          }

          audio.src =
            round.audioUrl;

          audio.load();

          let hasStarted = false;

          const playWhenReady =
            async () => {
              if (hasStarted) {
                return;
              }

              hasStarted = true;

              try {
                const target =
                  round?.startAt
                    ? new Date(
                        round.startAt
                      ).getTime()
                    : Date.now();

                const remaining =
                  target -
                  Date.now();

                if (
                  remaining > 0
                ) {
                  hasStarted = false;

                  countdownTimerRef.current =
                    setTimeout(
                      playWhenReady,
                      remaining
                    );

                  return;
                }

                audio.currentTime =
                  startTime;

                await audio.play();

                setState(
                  (current) => ({
                    ...current,
                    playing: true
                  })
                );

                updateAudioProgress(
                  startTime,
                  audioDuration
                );

                if (
                  audioDuration >
                  0
                ) {
                  clipTimerRef.current =
                    setTimeout(
                      () => {
                        stopMultiAudio();
                      },
                      audioDuration *
                        1000
                    );
                }
              } catch (error) {
                hasStarted = false;

                console.error(
                  "Multiplayer audio playback failed:",
                  error
                );
              }
            };

          const handleReady =
            () => {
              audio.removeEventListener(
                "canplay",
                handleReady
              );

              playWhenReady();
            };

          if (
            audio.readyState >= 3
          ) {
            playWhenReady();
          } else {
            audio.addEventListener(
              "canplay",
              handleReady
            );
          }
        },
        [
          clearTimers,
          onGameActiveChange,
          startAnswerTimer,
          stopMultiAudio,
          updateAudioProgress
        ]
      );

    const finishRound =
  useCallback(
    (data) => {
      clearTimers();
      stopMultiAudio();

      const correctAnswerId =
        data?.answerId ?? null;

      const results =
        Array.isArray(
          data?.results
        )
          ? data.results
          : [];

      const players =
        Array.isArray(
          data?.players
        )
          ? data.players
          : [];

      setRoundResults(
        results
      );

      setState((current) => ({
        ...current,
        started: true,
        answered: true,
        playing: false,
        correctAnswerId,
        players
      }));

      /*
       * The round is finished.
       * Any player who did not answer gets a ✕
       * instead of remaining in the waiting/dots state.
       */
      requestAnimationFrame(() => {
        const container =
          scoreboardRowsRef.current;

        if (!container) {
          return;
        }

        const rows =
          container.querySelectorAll(
            ".score-row"
          );

        rows.forEach((row) => {
          const playerId =
            row.dataset.playerId;

          if (!playerId) {
            return;
          }

          const scoreChange =
            roundScoresRef.current.get(
              String(playerId)
            );

          /*
           * No answer received for this player.
           * Show ✕ instead of waiting dots.
           */
          if (
            scoreChange === undefined
          ) {
            row.classList.remove(
              "score-waiting",
              "finished"
            );

            row.classList.add(
              "incorrect"
            );
          }
        });
      });
    },
    [
      clearTimers,
      stopMultiAudio
    ]
  );

    const renderFinal =
      useCallback(
        (players) => {
          const sorted =
            Array.isArray(
              players
            )
              ? [...players].sort(
                  (a, b) =>
                    getPlayerScore(
                      b
                    ) -
                    getPlayerScore(
                      a
                    )
                )
              : [];

          setFinalPlayers(
            sorted
          );

          const winningPlayer =
            sorted[0] ||
            null;

          setWinner(
            winningPlayer
          );

          const winnerId =
            getPlayerId(
              winningPlayer
            );

          if (
            winnerId !== null &&
            String(
              winnerId
            ) ===
              String(
                socket.id
              )
          ) {
            setWinnerMessage(
              "You win! 🎉"
            );

            confetti();

            setTimeout(
              () => {
                confetti();
              },
              700
            );

            setTimeout(
              () => {
                confetti();
              },
              1400
            );
          } else {
            setWinnerMessage(
              ""
            );
          }

          setState((current) => ({
            ...current,
            finished: true,
            started: false
          }));

          onGameActiveChange?.(
            false
          );
        },
        [onGameActiveChange]
      );


const renderScoreboard =
  useCallback(
    (players) => {
      if (!Array.isArray(players)) {
        return;
      }

      const sorted =
        [...players].sort(
          (a, b) =>
            getPlayerScore(b) -
            getPlayerScore(a)
        );

      setState((current) => ({
        ...current,
        players: sorted
      }));

      requestAnimationFrame(() => {
        const container =
          scoreboardRowsRef.current;

        if (!container) {
          return;
        }

        const rows =
          container.querySelectorAll(
            ".score-row"
          );

        rows.forEach((row) => {
          const playerId =
            row.dataset.playerId;

          if (!playerId) {
            return;
          }

          const scoreChange =
              roundScoresRef.current.get(
                String(playerId)
              );

            /*
            * Player has not answered yet.
            */
            if (scoreChange === undefined) {
              row.classList.add(
                "score-waiting"
              );

              row.classList.remove(
                "finished",
                "incorrect"
              );

              return;
            }

            /*
            * Player has answered.
            */
            row.classList.remove(
              "score-waiting"
            );

            /*
            * Correct answer.
            */
            if (scoreChange > 0) {
              row.classList.add(
                "finished"
              );

              row.classList.remove(
                "incorrect"
              );
            }

            /*
            * Incorrect or too late.
            */
            else {
              row.classList.add(
                "incorrect"
              );

              row.classList.remove(
                "finished"
              );
            }

          /*
           * Play the score animation
           * only when points were awarded.
           */
          if (scoreChange > 0) {
            row.classList.remove(
              "score-changed"
            );

            void row.offsetWidth;

            row.classList.add(
              "score-changed"
            );

            /*
             * Remove any existing
             * score popup.
             */
            const oldPoints =
              row.querySelector(
                ".round-score-animation"
              );

            if (oldPoints) {
              oldPoints.remove();
            }

            /*
             * Create the +points popup.
             */
            const points =
              document.createElement(
                "span"
              );

            points.className =
              "round-score-animation";

            points.textContent =
              `+${scoreChange}`;

            row.appendChild(
              points
            );

            setTimeout(() => {
              points.remove();
            }, 1200);
          }
        });
      });
    },
    []
  );



    useImperativeHandle(
      ref,
      () => ({
        endGame:
          leaveParty
      }),
      [leaveParty]
    );

    useEffect(() => {
      socket.connect();

      return () => {
        cleanupMultiplayer();
      };
    }, [
      cleanupMultiplayer
    ]);

    useEffect(() => {
      const handlePartyCreated =
        (data) => {
          applyParty(
            data?.party ||
              data
          );
        };

      const handlePartyJoined =
        (data) => {
          applyParty(
            data?.party ||
              data
          );
        };

      const handlePartyUpdated =
        (data) => {
          applyParty(
            data?.party ||
              data
          );

          const players =
            data?.players ||
            data?.party?.players ||
            data?.playerList ||
            data?.party?.playerList;

          if (
            Array.isArray(
              players
            )
          ) {
            renderScoreboard(
              players
            );
          }
        };

      const handleHostChanged =
        (data) => {
          const hostId =
            data?.hostId ??
            data?.id ??
            null;

          setState((current) => ({
            ...current,
            hostId,
            isHost:
              String(
                hostId
              ) ===
              String(
                socket.id
              )
          }));
        };

      const handleRoundStarted =
        (round) => {
          startRound(
            round
          );
        };

      const handleAnswerAccepted =
  (data) => {

    console.log(
      "ANSWER ACCEPTED RECEIVED",
      data
    );
    if (
      data?.playerId !==
      undefined
    ) {
      const playerId =
        String(
          data.playerId
        );

      const points =
        Number(
          data.points
        ) || 0;

      roundScoresRef.current.set(
        playerId,
        points
      );

      setState(
        (current) => ({
          ...current
        })
      );

      /*
       * Update the scoreboard immediately.
       *
       * 0 points = incorrect /
       * too late → ✕
       *
       * > 0 points = correct → ✓
       */
      renderScoreboard(
        stateRef.current.players
      );
    }

    if (
      data?.correct !==
      undefined
    ) {
      setState(
        (current) => ({
          ...current,
          answerCorrect:
            String(
              data.playerId
            ) ===
            String(
              socket.id
            )
              ? Boolean(
                  data.correct
                )
              : current.answerCorrect
        })
      );
    }
  };

      const handleRoundFinished =
        (data) => {
          finishRound(
            data
          );
        };

      const handleGameFinished =
        (data) => {
          clearTimers();

          stopMultiAudio();

          const players =
            data?.players ||
            data?.scoreboard ||
            data?.results ||
            [];

          renderFinal(
            players
          );
        };

      const handleNewGameStarted =
        (data) => {
          setRoundResults([]);
          setFinalPlayers([]);
          setWinner(null);
          setWinnerMessage("");

          setState((current) => ({
            ...current,
            finished: false,
            started: false,
            answered: false,
            selectedAnswerId:
              null,
            correctAnswerId:
              null,
            timeUp: false,
            playing: false,
            answerCorrect:
              null
          }));

          applyParty(
            data?.party ||
              data
          );
        };

      const handlePartyError =
        (data) => {
          setSetupError(
            typeof data ===
              "string"
              ? data
              : data?.message ||
                  "Party error."
          );
        };

      const handleErrorMessage =
        (data) => {
          setSetupError(
            typeof data ===
              "string"
              ? data
              : data?.message ||
                  "Something went wrong."
          );
        };

      socket.on(
        "partyCreated",
        handlePartyCreated
      );

      socket.on(
        "partyJoined",
        handlePartyJoined
      );

      socket.on(
        "partyUpdated",
        handlePartyUpdated
      );

      socket.on(
        "hostChanged",
        handleHostChanged
      );

      socket.on(
        "roundStarted",
        handleRoundStarted
      );

      socket.on(
        "answerAccepted",
        handleAnswerAccepted
      );

      socket.on(
        "roundFinished",
        handleRoundFinished
      );

      socket.on(
        "gameFinished",
        handleGameFinished
      );

      socket.on(
        "newGameStarted",
        handleNewGameStarted
      );

      socket.on(
        "partyError",
        handlePartyError
      );

      socket.on(
        "errorMessage",
        handleErrorMessage
      );

      return () => {
        socket.off(
          "partyCreated",
          handlePartyCreated
        );

        socket.off(
          "partyJoined",
          handlePartyJoined
        );

        socket.off(
          "partyUpdated",
          handlePartyUpdated
        );

        socket.off(
          "hostChanged",
          handleHostChanged
        );

        socket.off(
          "roundStarted",
          handleRoundStarted
        );

        socket.off(
          "answerAccepted",
          handleAnswerAccepted
        );

        socket.off(
          "roundFinished",
          handleRoundFinished
        );

        socket.off(
          "gameFinished",
          handleGameFinished
        );

        socket.off(
          "newGameStarted",
          handleNewGameStarted
        );

        socket.off(
          "partyError",
          handlePartyError
        );

        socket.off(
          "errorMessage",
          handleErrorMessage
        );
      };
    }, [
      applyParty,
      clearTimers,
      finishRound,
      renderFinal,
      renderScoreboard,
      startRound,
      stopMultiAudio
    ]);

    const isFinal =
      state.finished;

    return (
      <section id="multiplayer">

        {!state.inParty && (
          <section
            id="multiSetup"
            className="card"
          >
            <h2>
              Multiplayer
            </h2>

            <div className="multi-actions">

              <div className="multi-box">
                <h3>
                  Create a party
                </h3>

                <input
                  id="createName"
                  type="text"
                  placeholder="Your name"
                  value={
                    createName
                  }
                  onChange={(event) =>
                    setCreateName(
                      event.target.value
                    )
                  }
                  maxLength={20}
                />

                <select
                  id="roundCount"
                  className="multi-select"
                  value={
                    roundCount
                  }
                  onChange={(event) =>
                    setRoundCount(
                      event.target.value
                    )
                  }
                >
                  <option value="5">
                    5 rounds
                  </option>

                  <option value="10">
                    10 rounds
                  </option>

                  <option value="15">
                    15 rounds
                  </option>

                  <option value="20">
                    20 rounds
                  </option>
                </select>

                <button
                  id="createPartyBtn"
                  className="primary"
                  type="button"
                  onClick={
                    createParty
                  }
                >
                  Create party
                </button>
              </div>

              <div className="multi-divider">
                or
              </div>

              <div className="multi-box">
                <h3>
                  Join a party
                </h3>

                <input
                  id="joinName"
                  type="text"
                  placeholder="Your name"
                  value={
                    joinName
                  }
                  onChange={(event) =>
                    setJoinName(
                      event.target.value
                    )
                  }
                  maxLength={20}
                />

                <input
                  id="partyCodeInput"
                  type="text"
                  placeholder="Party code"
                  value={
                    partyCodeInput
                  }
                  onChange={(event) =>
                    setPartyCodeInput(
                      event.target.value
                        .toUpperCase()
                    )
                  }
                  maxLength={6}
                />

                <button
                  id="joinPartyBtn"
                  className="primary"
                  type="button"
                  onClick={
                    joinParty
                  }
                >
                  Join party
                </button>
              </div>

            </div>

            <p
              id="multiSetupError"
              className="error"
            >
              {setupError}
            </p>
          </section>
        )}

        {state.inParty &&
          !state.started &&
          !isFinal &&
          state.roundNumber === 0 && (
            <Lobby
              partyCode={
                state.partyCode
              }
              totalRounds={
                state.totalRounds
              }
              players={
                state.players
              }
              hostId={
                state.hostId
              }
              isHost={
                state.isHost
              }
              setupError={
                setupError
              }
              onLeave={
                leaveParty
              }
              onStart={
                startParty
              }
            />
          )}

        {state.started && (
          <section id="multiGame">

            <div className="multi-round-header">
              <span>
                Round {state.roundNumber} /{" "}
                {state.totalRounds}
              </span>
            </div>

            <div className="multi-round-progress">
              <div
                ref={
                  roundProgressRef
                }
                id="multiRoundProgress"
              />
            </div>

            <div className="card game-card">

              <div className="sound-icon">
                🔊
              </div>

              <h2>
                Which video is this?
              </h2>

              <p className="muted">
                Listen to the clip and
                choose the video.
              </p>

              <audio
                ref={audioRef}
                id="multiAudio"
              />

              <div className="player">

                <button
                  id="multiPlayBtn"
                  className="play"
                  type="button"
                  onClick={() => {
                    if (
                      state.playing
                    ) {
                      stopMultiAudio();
                    } else {
                      playMultiClip();
                    }
                  }}
                >
                  {state.playing
                    ? "❚❚"
                    : "▶"}
                </button>

                <div className="bar">
                  <div
                    ref={
                      multiProgressRef
                    }
                    id="multiProgress"
                  />
                </div>

                <span id="multiDuration">
                  {formatSeconds(
                    state.audioDuration
                  )}
                  s
                </span>

              </div>

              <div
                id="multiChoices"
                className="multi-choices"
              >
                {state.choices.map(
                  (
                    choice,
                    index
                  ) => {
                    const choiceId =
                      getChoiceId(
                        choice
                      );

                    const isSelected =
                      state.selectedAnswerId !==
                        null &&
                      String(
                        state.selectedAnswerId
                      ) ===
                        String(
                          choiceId
                        );

                    const isCorrectChoice =
                      state.correctAnswerId !==
                        null &&
                      String(
                        state.correctAnswerId
                      ) ===
                        String(
                          choiceId
                        );

                    const isImmediatelyCorrect =
                      state.answerCorrect ===
                        true &&
                      isSelected;

                    const isWrongSelectedChoice =
                      state.answerCorrect ===
                        false &&
                      isSelected &&
                      !isCorrectChoice;

                    let choiceClass =
                      "choice-button";

                    if (
                      isCorrectChoice ||
                      isImmediatelyCorrect
                    ) {
                      choiceClass +=
                        " correct";
                    } else if (
                      isWrongSelectedChoice
                    ) {
                      choiceClass +=
                        " incorrect";
                    }

                    const isDisabled =
                      state.answered;

                    return (
                      <button
                        key={String(
                          choiceId ??
                            index
                        )}
                        type="button"
                        className={
                          choiceClass
                        }
                        disabled={
                          isDisabled
                        }
                        onClick={() =>
                          submitMultiAnswer(
                            choiceId
                          )
                        }
                      >
                        <span className="choice-number">
                          {index + 1}
                        </span>

                        <span className="choice-title">
                          {getChoiceTitle(
                            choice
                          )}
                        </span>

                        {isSelected &&
                          state.answerCorrect !==
                            null && (
                            <span>
                              {state.answerCorrect
                                ? "✓"
                                : "✕"}
                            </span>
                          )}
                      </button>
                    );
                  }
                )}
              </div>

            </div>

            <Scoreboard
              ref={scoreboardRowsRef}
              players={state.players}
              roundScores={roundScoresRef.current}
            />

          </section>
        )}

        {isFinal && (
          <section
            id="multiFinalResult"
            className="card game-card"
          >
            <h2>
              Game finished!
            </h2>

            {winnerMessage && (
              <div className="winner-message">
                {winnerMessage}
              </div>
            )}

            <div
  id="finalScoreboard"
  className="scoreboard"
>
  {finalPlayers.map(
    (
      player,
      index
    ) => (
      <div
        className={`score-row ${
          index === 0
            ? "leader"
            : ""
        }`}
        key={String(
          getPlayerId(
            player
          ) ?? index
        )}
      >
        <span>
          {index + 1}
        </span>

        <span>
          {getPlayerName(
            player
          )}
        </span>

        <strong>
          {getPlayerScore(
            player
          )}
        </strong>
      </div>
    )
  )}
</div>

            <div className="final-actions">

  {state.isHost && (
    <button
      id="finalNewGameBtn"
      className="primary"
      type="button"
      onClick={newGame}
    >
      New game
    </button>
  )}

  <button
    id="finalLeaveBtn"
    className="secondary"
    type="button"
    onClick={leaveParty}
  >
    Leave
  </button>

</div>
          </section>
        )}

      </section>
    );
  }
);

export default Multiplayer;