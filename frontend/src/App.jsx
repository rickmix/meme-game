import {
  useRef,
  useState
} from "react";

import SinglePlayer from "./game/SinglePlayer.jsx";
import Multiplayer from "./game/Multiplayer.jsx";

function App() {
  const [mode, setMode] =
    useState("single");

  const [singleGameActive, setSingleGameActive] =
    useState(false);

  const [multiGameActive, setMultiGameActive] =
    useState(false);

  const singlePlayerRef =
    useRef(null);

  const multiplayerRef =
    useRef(null);

  function switchToSingle() {
    if (
      mode === "multi"
    ) {
      if (
        multiGameActive
      ) {
        const confirmed =
          window.confirm(
            "Are you sure? Your current multiplayer game will be ended."
          );

        if (!confirmed) {
          return;
        }

        multiplayerRef.current?.endGame?.();
      }

      setMode("single");
      return;
    }

    setMode("single");
  }

  function switchToMulti() {
    if (
      mode === "single"
    ) {
      if (
        singleGameActive
      ) {
        const confirmed =
          window.confirm(
            "Are you sure? Your current game will be ended."
          );

        if (!confirmed) {
          return;
        }

        singlePlayerRef.current?.endGame?.();
      }

      setMode("multi");
      return;
    }

    setMode("multi");
  }

  return (
    <main className="app">
      <header>
        <div>
          <div className="eyebrow">
            Quiz
          </div>

          <h1>
            Meme master 3000
          </h1>
        </div>

       
      </header>

      <div className="tabs">
        <button
          id="singleTab"
          type="button"
          className={`tab ${
            mode === "single"
              ? "active"
              : ""
          }`}
          onClick={
            switchToSingle
          }
        >
          Single Player
        </button>

        <button
          id="multiTab"
          type="button"
          className={`tab ${
            mode === "multi"
              ? "active"
              : ""
          }`}
          onClick={
            switchToMulti
          }
        >
          Multiplayer
        </button>
      </div>

      {mode === "single" ? (
        <SinglePlayer
          ref={singlePlayerRef}
          onGameActiveChange={
            setSingleGameActive
          }
        />
      ) : (
        <Multiplayer
          ref={multiplayerRef}
          onGameActiveChange={
            setMultiGameActive
          }
        />
      )}
    </main>
  );
}

export default App;