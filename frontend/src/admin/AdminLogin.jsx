import {
  useState
} from "react";

export default function AdminLogin() {
  const [
    password,
    setPassword
  ] = useState("");

  const [
    error,
    setError
  ] = useState("");

  const handleSubmit =
    async (event) => {
      event.preventDefault();

      setError("");

      try {
        const response =
          await fetch(
            "/admin-login",
            {
              method: "POST",

              headers: {
                "Content-Type":
                  "application/json"
              },

              body:
                JSON.stringify({
                  password
                })
            }
          );

        const data =
          await response.json();

        if (!response.ok) {
          setError(
            data.error ||
            "Login failed."
          );

          return;
        }

        window.location.href =
          "/admin";

      } catch {
        setError(
          "Could not connect to the server."
        );
      }
    };

  return (
    <main className="app">

      <section
        className="card"
        style={{
          maxWidth: "420px",
          margin: "80px auto"
        }}
      >

        <div className="eyebrow">
          ADMIN
        </div>

        <h1>
          Admin login
        </h1>

        <p className="muted">
          Enter the admin password to continue.
        </p>

        <form
          onSubmit={handleSubmit}
        >

          <input
            type="password"
            placeholder="Password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) =>
              setPassword(
                event.target.value
              )
            }
            style={{
              width: "100%",
              boxSizing: "border-box",
              marginBottom: "12px"
            }}
          />

          <button
            className="primary"
            type="submit"
            style={{
              width: "100%"
            }}
          >
            Login
          </button>

        </form>

        {error && (
          <p
            style={{
              color: "#ff6b6b"
            }}
          >
            {error}
          </p>
        )}

        <a
          href="/"
          className="admin-link"
        >
          ← Back to game
        </a>

      </section>

    </main>
  );
}