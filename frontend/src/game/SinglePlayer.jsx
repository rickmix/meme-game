import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState
} from "react";

const INITIAL_STATE = {
  score: 0,
  round: 0,
  roundId: null,
  answerId: null,
  choices: [],
  startTime: 0,
  audioDuration: 0,
  revealDuration: 0.3,
  playing: false,
  answered: false,
  gameActive: false
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

function calculatePoints(seconds) {
  if (seconds <= 0.3) {
    return 1000;
  }

  if (seconds <= 0.5) {
    return 800;
  }

  if (seconds <= 1) {
    return 600;
  }

  if (seconds <= 5) {
    return 200;
  }

  return 50;
}

const SinglePlayer = forwardRef(
  function SinglePlayer(
    {
      onGameActiveChange
    },
    ref
  ) {
  const [state, setState] =
    useState(INITIAL_STATE);

  const [setupError, setSetupError] =
    useState("");

  const [answer, setAnswer] =
    useState("");

  const [showSuggestions, setShowSuggestions] =
    useState(false);

  const [result, setResult] =
    useState(null);

  const audioRef =
    useRef(null);

const progressRef =
    useRef(null);

  const clipTimerRef =
    useRef(null);

  const progressAnimationRef =
    useRef(null);

  const blurTimerRef =
    useRef(null);

  const stateRef =
    useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const clearTimers = useCallback(() => {
    clearTimeout(
      clipTimerRef.current
    );

    cancelAnimationFrame(
      progressAnimationRef.current
    );

    clipTimerRef.current = null;
    progressAnimationRef.current = null;
  }, []);

  const stopAudio = useCallback(() => {
    clearTimeout(
      clipTimerRef.current
    );

    cancelAnimationFrame(
      progressAnimationRef.current
    );

    clipTimerRef.current = null;
    progressAnimationRef.current = null;

    const audio =
      audioRef.current;

    if (audio) {
      audio.pause();
    }

    if (progressRef.current) {
        progressRef.current.style.width =
            "0%";
    }

    setState((current) => ({
      ...current,
      playing: false
    }));
  }, []);

  const updateProgress = useCallback(
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
        progressRef.current;

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
          ? (elapsed / duration) *
            100
          : 0;

      progress.style.width =
        `${percentage}%`;

      if (
        !audio.paused &&
        audio.currentTime <
          start + duration
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

  const stopAudioAt = useCallback(
    (stopAt) => {
      clearTimeout(
        clipTimerRef.current
      );

      cancelAnimationFrame(
        progressAnimationRef.current
      );

      clipTimerRef.current = null;
      progressAnimationRef.current = null;

      const audio =
        audioRef.current;

      if (audio) {
        audio.pause();

        try {
          audio.currentTime =
            stopAt;
        } catch (error) {
          console.warn(error);
        }
      }

      if (progressRef.current) {
        progressRef.current.style.width =
            "0%";
      }

      setState((current) => ({
        ...current,
        playing: false
      }));
    },
    []
  );

  const playClip = useCallback(
    async (
      durationOverride = null
    ) => {
      const current =
        stateRef.current;

      const audio =
        audioRef.current;

      if (
        !audio ||
        !current.audioDuration
      ) {
        return;
      }

      clearTimeout(
        clipTimerRef.current
      );

      cancelAnimationFrame(
        progressAnimationRef.current
      );

      const start =
        current.startTime;

      const duration =
        Math.min(
          durationOverride ??
            current.revealDuration,
          current.audioDuration
        );

      const stopAt =
        start + duration;

      try {
        audio.currentTime =
          start;
      } catch (error) {
        console.warn(
          "Could not seek audio:",
          error
        );
      }

      try {
        await audio.play();

        setState((value) => ({
          ...value,
          playing: true
        }));

        updateProgress(
          start,
          duration
        );

        clipTimerRef.current =
          setTimeout(() => {
            stopAudioAt(
              stopAt
            );
          }, duration * 1000);
      } catch (error) {
        console.warn(
          "Could not autoplay audio:",
          error
        );

        setState((value) => ({
          ...value,
          playing: false
        }));
      }
    },
    [
      clearTimers,
      stopAudioAt,
      updateProgress
    ]
  );

  const playFullClip =
    useCallback(async () => {
      const current =
        stateRef.current;

      const audio =
        audioRef.current;

      if (
        !audio ||
        !current.audioDuration
      ) {
        return;
      }

      clearTimeout(
        clipTimerRef.current
      );

      cancelAnimationFrame(
        progressAnimationRef.current
      );

      const start =
        current.startTime;

      const duration =
        current.audioDuration;

      const stopAt =
        start + duration;

      try {
        audio.pause();
        audio.currentTime =
          start;
      } catch (error) {
        console.warn(
          "Could not seek audio:",
          error
        );
      }

      try {
        await audio.play();

        setState((value) => ({
          ...value,
          playing: true
        }));

        updateProgress(
          start,
          duration
        );

        clipTimerRef.current =
          setTimeout(() => {
            stopAudioAt(
              stopAt
            );
          }, duration * 1000);
      } catch (error) {
        console.error(
          "Could not play full clip:",
          error
        );

        setState((value) => ({
          ...value,
          playing: false
        }));
      }
    }, [
      stopAudioAt,
      updateProgress
    ]);

  const loadRound =
    useCallback(async () => {      

      clearTimers();

      const audio =
        audioRef.current;

      if (audio) {
        audio.pause();
      }

      setState((value) => ({
        ...value,
        round:
          value.round + 1,
        answered: false,
        revealDuration: 0.3,
        roundId: null,
        answerId: null,
        choices: [],
        startTime: 0,
        audioDuration: 0,
        playing: false
      }));

      setAnswer("");
      setShowSuggestions(false);
      setResult(null);
      setSetupError("");

      try {
        const response =
          await fetch(
            "/api/game"
          );

        if (!response.ok) {
          throw new Error(
            `HTTP ${response.status}`
          );
        }

        const data =
          await response.json();

        if (
          !stateRef.current
            .gameActive
        ) {
          return;
        }

        console.log(
          "Single-player round:",
          data
        );

        const audioDuration =
          Number(
            data.duration
          ) || 0;

        if (
          audioDuration < 2
        ) {
          throw new Error(
            "Selected clip is shorter than the 2-second minimum."
          );
        }

        setState((value) => ({
          ...value,
          roundId:
            data.roundId,
          answerId:
            data.answerId,
          choices:
            Array.isArray(
              data.choices
            )
              ? data.choices
              : [],
          startTime:
            Number(
              data.startTime
            ) || 0,
          audioDuration
        }));

        const element =
          audioRef.current;

        if (!element) {
          return;
        }

        element.pause();
        element.currentTime = 0;
        element.src =
          data.audioUrl;
        element.load();

        const startAudio = () => {
          playClip(0.3);
        };

        if (element.readyState >= 3) {
          startAudio();
        } else {
          element.addEventListener(
            "canplay",
            startAudio,
            { once: true }
          );
        }

        if (
          element.readyState >= 3
        ) {
          startAudio();
        }
      } catch (error) {
        console.error(
          "Could not load single-player round:",
          error
        );

        if (
          !stateRef.current
            .gameActive
        ) {
          return;
        }

        setState((value) => ({
          ...value,
          gameActive: false
        }));

        onGameActiveChange?.(
          false
        );

        setSetupError(
          "Could not load the game. Please try again."
        );
      }
    }, [
      clearTimers,
      onGameActiveChange,
      playClip
    ]);

  const startGame =
    useCallback(async () => {
      clearTimers();
      stopAudio();

      setSetupError("");
      setAnswer("");
      setResult(null);
      setShowSuggestions(false);

      setState({
        ...INITIAL_STATE,
        score: 0,
        round: 0,
        gameActive: true
      });

      onGameActiveChange?.(
        true
      );

      await loadRound();
    }, [
      clearTimers,
      loadRound,
      onGameActiveChange,
      stopAudio
    ]);

    const endGame =
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

      setState({
        ...INITIAL_STATE
      });

      setAnswer("");
      setShowSuggestions(false);
      setResult(null);
      setSetupError("");

      onGameActiveChange?.(
        false
      );
    }, [
      clearTimers,
      onGameActiveChange
    ]);

    useImperativeHandle(
        ref,
        () => ({
        endGame
        }),
        [endGame]
    );

  const submitAnswer =
    useCallback(
      (value) => {
        const current =
          stateRef.current;

        if (current.answered) {
          return;
        }

        const cleanValue =
          String(
            value || ""
          ).trim();

        if (!cleanValue) {
          return;
        }

        const correctChoice =
          current.choices.find(
            (choice) =>
              String(
                getChoiceId(
                  choice
                )
              ) ===
              String(
                current.answerId
              )
          );

        const correctTitle =
          correctChoice
            ? getChoiceTitle(
                correctChoice
              )
            : "";

        const isCorrect =
          cleanValue.toLowerCase() ===
          correctTitle.toLowerCase();

        stopAudio();
        setShowSuggestions(false);

        setState((value) => ({
          ...value,
          answered: true,
          score: isCorrect
            ? value.score +
              calculatePoints(
                value.revealDuration
              )
            : value.score
        }));

        if (isCorrect) {
          const points =
            calculatePoints(
              current.revealDuration
            );

          setResult({
            message:
              `Correct! +${points} points`,
            success: true
          });
        } else {
          setResult({
            message:
              `Wrong! The answer was: ${
                correctTitle ||
                "Unknown"
              }`,
            success: false
          });
        }
      },
      [stopAudio]
    );

  const giveUp =
    useCallback(() => {
      const current =
        stateRef.current;

      if (
        current.answered ||
        !current.audioDuration
      ) {
        return;
      }

      stopAudio();
      setShowSuggestions(false);

      const correctChoice =
        current.choices.find(
          (choice) =>
            String(
              getChoiceId(
                choice
              )
            ) ===
            String(
              current.answerId
            )
        );

      const correctTitle =
        correctChoice
          ? getChoiceTitle(
              correctChoice
            )
          : "Unknown";

      setState((value) => ({
        ...value,
        answered: true,
        revealDuration:
          value.audioDuration
      }));

      setResult({
        message:
          `The answer was: ${correctTitle} — +0 points`,
        success: false
      });

      setTimeout(() => {
        playFullClip();
      }, 0);
    }, [playFullClip, stopAudio]);

  const revealMore =
    useCallback(() => {
      const current =
        stateRef.current;

      if (
        current.answered ||
        !current.audioDuration
      ) {
        return;
      }

      const currentDuration =
        current.revealDuration;

      const actualDuration =
        current.audioDuration;

      if (
        currentDuration >= 10 ||
        currentDuration >=
          actualDuration
      ) {
        giveUp();
        return;
      }

      let nextDuration;

      if (
        currentDuration < 0.5
      ) {
        nextDuration =
          Math.min(
            0.5,
            actualDuration
          );
      } else if (
        currentDuration < 1
      ) {
        nextDuration =
          Math.min(
            1,
            actualDuration
          );
      } else if (
        currentDuration < 5
      ) {
        nextDuration =
          Math.min(
            5,
            actualDuration
          );
      } else {
        nextDuration =
          Math.min(
            10,
            actualDuration
          );
      }

      setState((value) => ({
        ...value,
        revealDuration:
          nextDuration
      }));

      setTimeout(() => {
        playClip(
          nextDuration
        );
      }, 0);
    }, [
      giveUp,
      playClip
    ]);

  const replayFull =
    useCallback(() => {
      playFullClip();
    }, [playFullClip]);

  const nextRound =
    useCallback(() => {
      loadRound();
    }, [loadRound]);

  const handleAnswerInput =
    useCallback(
      (event) => {
        const value =
          event.target.value;

        setAnswer(value);

        if (
          !value.trim() ||
          stateRef.current
            .answered
        ) {
          setShowSuggestions(
            false
          );

          return;
        }

        setShowSuggestions(
          true
        );
      },
      []
    );

  const handleKeyDown =
    useCallback(
      (event) => {
        if (
          event.key !==
          "Enter"
        ) {
          return;
        }

        event.preventDefault();

        const value =
          answer.trim();

        if (value) {
          submitAnswer(
            value
          );
        }
      },
      [
        answer,
        submitAnswer
      ]
    );

  const handleBlur =
    useCallback(() => {
      clearTimeout(
        blurTimerRef.current
      );

      blurTimerRef.current =
        setTimeout(() => {
          setShowSuggestions(
            false
          );
        }, 150);
    }, []);

  const handleSuggestionMouseDown =
    useCallback(
      (
        event,
        title
      ) => {
        event.preventDefault();

        setAnswer(title);
        setShowSuggestions(
          false
        );

        submitAnswer(title);
      },
      [submitAnswer]
    );

  useEffect(() => {
    const audio =
      audioRef.current;

    if (!audio) {
      return;
    }

    const handleTimeUpdate =
      () => {
        const current =
          stateRef.current;

        if (
          !current.audioDuration
        ) {
          return;
        }

        const start =
          current.startTime;

        const duration =
          Math.min(
            current.revealDuration,
            current.audioDuration
          );

        const elapsed =
          Math.max(
            0,
            Math.min(
              duration,
              audio.currentTime -
                start
            )
          );

        if (
          !audio.paused &&
          audio.currentTime <
            start + duration
        ) {
          progressAnimationRef.current =
            requestAnimationFrame(
              handleTimeUpdate
            );
        }
      };

    const handleEnded =
      () => {
        setState((value) => ({
          ...value,
          playing: false
        }));

        cancelAnimationFrame(
          progressAnimationRef.current
        );
      };

    audio.addEventListener(
      "timeupdate",
      handleTimeUpdate
    );

    audio.addEventListener(
      "ended",
      handleEnded
    );

    return () => {
      audio.removeEventListener(
        "timeupdate",
        handleTimeUpdate
      );

      audio.removeEventListener(
        "ended",
        handleEnded
      );
    };
  }, []);

  useEffect(() => {
    return () => {
      clearTimeout(
        blurTimerRef.current
      );

      clearTimers();

      const audio =
        audioRef.current;

      if (audio) {
        audio.pause();
      }
    };
  }, [clearTimers]);

  const filteredChoices =
    state.choices.filter(
      (choice) =>
        getChoiceTitle(
          choice
        )
          .toLowerCase()
          .includes(
            answer
              .trim()
              .toLowerCase()
          )
    );

  const clipSeconds =
    Math.min(
      state.revealDuration,
      state.audioDuration ||
        state.revealDuration
    );

  return (
    <section
      id="singlePlayer"
    >
      {!state.gameActive && (
        <section
          id="setup"
          className="card"
        >
          <h2>Ready?</h2>

          <p className="muted">
            Guess the video from a
            short audio clip.
          </p>

          <button
            id="startBtn"
            className="primary"
            type="button"
            onClick={startGame}
          >
            Start game
          </button>

          <p
            id="setupError"
            className="error"
          >
            {setupError}
          </p>
        </section>
      )}

      {state.gameActive && (
        <section id="game">
          <div className="stats single-stats">
            <div>
              <span>Score</span>
              <strong id="score">
                {state.score}
              </strong>
            </div>

            <div>
              <span>Clip</span>
              <strong id="clipTime">
                {formatSeconds(
                  clipSeconds
                )}
                s
              </strong>
            </div>

            <div>
              <span>Round</span>
              <strong id="round">
                {state.round}
              </strong>
            </div>
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
              guess the video.
            </p>

            <audio
              ref={audioRef}
              id="audio"
            />

            <div className="player">
              <button
                id="playBtn"
                className="play"
                type="button"
                disabled={
                  !state.audioDuration
                }
                onClick={() => {
                  if (
                    state.playing
                  ) {
                    stopAudio();
                  } else {
                    playClip();
                  }
                }}
              >
                {state.playing
                  ? "❚❚"
                  : "▶"}
              </button>

              <div className="bar">
                <div
                    ref={progressRef}
                    id="progress"
                />
              </div>

              <span id="durationLabel">
                {formatSeconds(
                  clipSeconds
                )}
                s
              </span>
            </div>

            <div className="answer-box">
              <input
                id="answerInput"
                type="text"
                placeholder="Type your answer..."
                autoComplete="off"
                value={answer}
                disabled={
                  state.answered
                }
                onChange={
                  handleAnswerInput
                }
                onKeyDown={
                  handleKeyDown
                }
                onBlur={
                  handleBlur
                }
                onFocus={() => {
                  if (
                    answer.trim() &&
                    !state.answered
                  ) {
                    setShowSuggestions(
                      true
                    );
                  }
                }}
              />

              {showSuggestions &&
                !state.answered &&
                filteredChoices.length >
                  0 && (
                  <div
                    id="suggestions"
                    className="suggestions has-suggestions"
                  >
                    {filteredChoices.map(
                      (choice) => {
                        const title =
                          getChoiceTitle(
                            choice
                          );

                        return (
                          <button
                            key={String(
                              getChoiceId(
                                choice
                              )
                            )}
                            type="button"
                            className="suggestion"
                            onMouseDown={(
                              event
                            ) =>
                              handleSuggestionMouseDown(
                                event,
                                title
                              )
                            }
                          >
                            {title}
                          </button>
                        );
                      }
                    )}
                  </div>
                )}
            </div>

            <button
              id="dontKnow"
              className="secondary"
              type="button"
              disabled={
                state.answered ||
                !state.audioDuration
              }
              onClick={
                revealMore
              }
            >
              I don't know
            </button>

            {result && (
              <div
                id="result"
                className={
                  `result ${
                    result.success
                      ? "success"
                      : "failure"
                  }`
                }
              >
                {result.message}

                <div
                  id="singleResultActions"
                  className="single-result-actions"
                >
                  <button
                    type="button"
                    className="secondary"
                    onClick={
                      replayFull
                    }
                  >
                    ↻ Replay
                  </button>

                  <button
                    type="button"
                    className="primary next"
                    onClick={
                      nextRound
                    }
                  >
                    Next round →
                  </button>
                </div>
              </div>
            )}

            <audio
              id="clipAudio"
              className="controls clip-audio hidden"
              controls
            />
          </div>
        </section>
      )}
    </section>
  );
});

export default SinglePlayer;