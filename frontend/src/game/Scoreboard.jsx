import {
  forwardRef
} from "react";

const Scoreboard = forwardRef(
  function Scoreboard(
    {
      players,
      roundScores
    },
    ref
  ) {
    if (!Array.isArray(players)) {
      return null;
    }

    const sortedPlayers =
      [...players].sort(
        (a, b) =>
          Number(
            b?.score ??
            b?.points ??
            b?.totalScore ??
            0
          ) -
          Number(
            a?.score ??
            a?.points ??
            a?.totalScore ??
            0
          )
      );

    const getPlayerId = (player) =>
      player?.id ??
      player?.socketId ??
      player?.playerId ??
      player?.userId ??
      null;

    const getPlayerName = (player) =>
      player?.name ??
      player?.username ??
      "Player";

    return (
      <div
        id="multiScoreboard"
        ref={ref}
        className="scoreboard"
      >
        {sortedPlayers.map(
          (player, index) => {
            const playerId =
              getPlayerId(player);

            const roundScore =
              roundScores?.get(
                String(playerId)
              ) ?? 0;

            return (
              <div
                key={String(
                  playerId ?? index
                )}
                data-player-id={String(
                  playerId
                )}
                className={`score-row ${
                  index === 0
                    ? "leader"
                    : ""
                }`}
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
                  {player?.score ?? 0}
                </strong>
              </div>
            );
          }
        )}
      </div>
    );
  }
);

export default Scoreboard;