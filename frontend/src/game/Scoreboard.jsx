import { forwardRef, useLayoutEffect, useRef } from "react";

const Scoreboard = forwardRef(function Scoreboard(
  { players, roundScores, displayedTotals, animatePositions, freezeRanking },
  ref,
) {
  const previousPositionsRef = useRef(new Map());
  const animationFrameRef = useRef(null);

  /*
   * The order visible before the ranking changes.
   */
  const lastRenderedOrderRef = useRef([]);

  if (!Array.isArray(players)) {
    return null;
  }

  const getPlayerId = (player) =>
    player?.id ??
    player?.socketId ??
    player?.playerId ??
    player?.userId ??
    null;

  const getPlayerName = (player) =>
    player?.name ?? player?.username ?? "Player";

  const getPlayerScore = (player) =>
    Number(
      player?.score ??
        player?.points ??
        player?.totalScore ??
        0,
    );

  /*
   * Calculate the real ranking.
   */
  const rankedPlayers = [...players].sort((a, b) => {
    const aId = String(getPlayerId(a));
    const bId = String(getPlayerId(b));

    const aScore =
      displayedTotals?.get(aId) ??
      getPlayerScore(a);

    const bScore =
      displayedTotals?.get(bId) ??
      getPlayerScore(b);

    return bScore - aScore;
  });

  /*
   * Keep the old order while the totals
   * are being revealed.
   */
  let visiblePlayers = rankedPlayers;

  if (
    freezeRanking &&
    lastRenderedOrderRef.current.length > 0
  ) {
    const playerMap = new Map();

    players.forEach((player) => {
      playerMap.set(
        String(getPlayerId(player)),
        player,
      );
    });

    visiblePlayers =
      lastRenderedOrderRef.current
        .map((id) => playerMap.get(id))
        .filter(Boolean);
  }

  /*
   * Remember where each PLAYER CONTENT is.
   *
   * The actual score-row never moves.
   */
  useLayoutEffect(() => {
    const container =
      document.getElementById(
        "multiScoreboard",
      );

    if (!container) {
      return;
    }

    const contents =
      container.querySelectorAll(
        ".score-player-content",
      );

    if (freezeRanking) {
      const positions = new Map();

      contents.forEach((content) => {
        const id =
          content.dataset.playerId;

        if (!id) {
          return;
        }

        const rect =
          content.getBoundingClientRect();

        positions.set(id, {
          top: rect.top,
          left: rect.left,
        });
      });

      previousPositionsRef.current =
        positions;

      return;
    }

    /*
     * Don't overwrite the old positions
     * when the ranking animation starts.
     */
    if (animatePositions > 0) {
      return;
    }

    const positions = new Map();
    const order = [];

    contents.forEach((content) => {
      const id =
        content.dataset.playerId;

      if (!id) {
        return;
      }

      const rect =
        content.getBoundingClientRect();

      positions.set(id, {
        top: rect.top,
        left: rect.left,
      });

      order.push(id);
    });

    previousPositionsRef.current =
      positions;

    lastRenderedOrderRef.current =
      order;
  }, [
    players,
    displayedTotals,
    freezeRanking,
    animatePositions,
  ]);

  /*
   * Animate PLAYER CONTENT between the
   * fixed scoreboard slots.
   */
  useLayoutEffect(() => {
    if (!animatePositions) {
      return;
    }

    const container =
      document.getElementById(
        "multiScoreboard",
      );

    if (!container) {
      return;
    }

    const contents =
      container.querySelectorAll(
        ".score-player-content",
      );

    const oldPositions =
      previousPositionsRef.current;

    const newPositions = new Map();

    contents.forEach((content) => {
      const id =
        content.dataset.playerId;

      if (!id) {
        return;
      }

      const rect =
        content.getBoundingClientRect();

      newPositions.set(id, {
        top: rect.top,
        left: rect.left,
      });
    });

    cancelAnimationFrame(
      animationFrameRef.current,
    );

    /*
     * Put each player's CONTENT back where
     * that player was before the ranking changed.
     *
     * The row itself never moves.
     */
    contents.forEach((content) => {
      const id =
        content.dataset.playerId;

      if (!id) {
        return;
      }

      const oldPosition =
        oldPositions.get(id);

      const newPosition =
        newPositions.get(id);

      if (
        !oldPosition ||
        !newPosition
      ) {
        return;
      }

      const deltaY =
        oldPosition.top -
        newPosition.top;

      if (Math.abs(deltaY) < 1) {
        return;
      }

      content.style.setProperty(
        "--score-move-y",
        `${deltaY}px`,
      );

      content.classList.add(
        "score-moving",
      );
    });

    /*
     * Remove the inversion on the next frame.
     * CSS then smoothly moves the CONTENT
     * into its new slot.
     */
    animationFrameRef.current =
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          contents.forEach(
            (content) => {
              content.classList.remove(
                "score-moving",
              );
            },
          );

          setTimeout(() => {
            contents.forEach(
              (content) => {
                content.style.removeProperty(
                  "--score-move-y",
                );
              },
            );
          }, 950);
        });
      });

    return () => {
      cancelAnimationFrame(
        animationFrameRef.current,
      );
    };
  }, [animatePositions]);

  return (
    <div
      id="multiScoreboard"
      ref={ref}
      className="scoreboard"
    >
      {visiblePlayers.map(
        (player, index) => {
          const playerId =
            getPlayerId(player);

          const id = String(playerId);

          const roundScore =
            Number(
              roundScores?.get(id) ?? 0,
            );

          const totalScore =
            displayedTotals?.get(id) ??
            getPlayerScore(player);

          return (
            <div
              key={id || index}
              className={`score-row ${
                index === 0
                  ? "leader"
                  : ""
              }`}
            >
              {/* Fixed position number */}
              <span>
                {index + 1}
              </span>

              {/* Only this part moves */}
              <div
                className="score-player-content"
                data-player-id={id}
              >
                <span>
                  {getPlayerName(player)}
                </span>

                <span className="round-score">
                  {roundScore > 0
                    ? `+${roundScore}`
                    : ""}
                </span>

                <strong className="total-score">
                  {totalScore}
                </strong>

                <span className="score-result"></span>
              </div>
            </div>
          );
        },
      )}
    </div>
  );
});

export default Scoreboard;