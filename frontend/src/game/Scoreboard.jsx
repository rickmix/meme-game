import { forwardRef } from "react";

const Scoreboard = forwardRef(function Scoreboard(
  {
    players,
    roundScores,
    displayedTotals,
  },
  ref,
) {
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
   * Keep the scoreboard order based on the
   * displayed total, not the live server score.
   *
   * This prevents players from jumping around
   * while people are answering.
   */
  const sortedPlayers = [...players].sort((a, b) => {
    const aId = String(getPlayerId(a));
    const bId = String(getPlayerId(b));

    const aScore =
      displayedTotals?.get(aId) ?? getPlayerScore(a);

    const bScore =
      displayedTotals?.get(bId) ?? getPlayerScore(b);

    return bScore - aScore;
  });

  return (
    <div id="multiScoreboard" ref={ref} className="scoreboard">
      {/* <div className="score-header">
        <span></span>
        <span>Name</span>
        <span>Round</span>
        <span>Total</span>
        <span></span>
      </div> */}

      {sortedPlayers.map((player, index) => {
        const playerId = getPlayerId(player);
        const id = String(playerId);

        const roundScore =
          Number(roundScores?.get(id) ?? 0);

        const totalScore =
          displayedTotals?.get(id) ??
          getPlayerScore(player);

        return (
          <div
            key={id || index}
            data-player-id={id}
            className={`score-row ${
              index === 0 ? "leader" : ""
            }`}
          >
            <span>{index + 1}</span>

            <span>{getPlayerName(player)}</span>

            <span className="round-score">
              {roundScore > 0 ? `+${roundScore}` : "0"}
            </span>

            <strong className="total-score">
              {totalScore}
            </strong>

            <span className="score-result"></span>
          </div>
        );
      })}
    </div>
  );
});

export default Scoreboard;

