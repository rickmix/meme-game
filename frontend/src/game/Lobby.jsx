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

function Lobby({
  partyCode,
  totalRounds,
  players,
  hostId,
  isHost,
  setupError,
  onLeave,
  onStart
}) {
  const playerList =
    Array.isArray(players)
      ? players
      : [];

  return (
    <section
      id="multiLobby"
      className="card"
    >
      <div className="lobby-header">
        <div>
  <div className="muted">
    Party code
  </div>

  <div className="party-code-wrapper">
    <div
      id="partyCode"
      className="party-code"
    >
      {partyCode || "------"}
    </div>

    <button
      type="button"
      className="copy-party-code"
      onClick={() => {
        if (!partyCode) {
          return;
        }

        navigator.clipboard.writeText(
          partyCode
        );
      }}
      aria-label="Copy party code"
      title="Copy party code"
    >
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <rect
          x="9"
          y="9"
          width="11"
          height="11"
          rx="2"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        />

        <path
          d="M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    </button>
  </div>
</div>

        <button
          id="leavePartyBtn"
          className="secondary"
          type="button"
          onClick={onLeave}
        >
          Leave
        </button>
      </div>

      <p
        id="lobbyRounds"
        className="muted"
      >
        {totalRounds} rounds
      </p>

      <div
        id="playerList"
        className="player-list"
      >
        {playerList.map((player) => {
          const playerId =
            getPlayerId(player);

          const isPlayerHost =
            hostId !== null &&
            hostId !== undefined &&
            playerId !== null &&
            String(playerId) ===
              String(hostId);

          return (
            <div
              className="player-row"
              key={String(
                playerId ??
                  getPlayerName(player)
              )}
            >
              <span>
                {getPlayerName(player)}
              </span>

              {isPlayerHost && (
                <strong>
                  HOST
                </strong>
              )}
            </div>
          );
        })}
      </div>

      {isHost && (
        <button
          id="startPartyBtn"
          className="primary"
          type="button"
          onClick={onStart}
        >
          Start game
        </button>
      )}

      <p
        id="lobbyHint"
        className="muted lobby-hint"
      >
        {isHost
          ? "You are the host. Start the game when everyone is ready."
          : "Waiting for the host to start the game."}
      </p>

      {setupError && (
        <p className="error">
          {setupError}
        </p>
      )}
    </section>
  );
}

export default Lobby;