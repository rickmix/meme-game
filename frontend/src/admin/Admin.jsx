import {
  useCallback,
  useEffect,
  useState
} from "react";

export default function Admin() {
  const [videos, setVideos] =
    useState([]);

  const [urls, setUrls] =
    useState("");

  const [message, setMessage] =
    useState("");

  const [loading, setLoading] =
    useState(true);

  const [adding, setAdding] =
    useState(false);

  const load =
    useCallback(async () => {
      try {
        setLoading(true);
        setMessage("");

        const response =
          await fetch(
            "/api/videos"
          );

        if (
          response.status === 401
        ) {
          window.location.href =
            "/admin-login";

          return;
        }

        const data =
          await response.json();

        if (!response.ok) {
          throw new Error(
            data.error ||
              "Could not load videos."
          );
        }

        setVideos(
          Array.isArray(data)
            ? data
            : []
        );
      } catch (error) {
        setMessage(
          error.message
        );
      } finally {
        setLoading(false);
      }
    }, []);

  useEffect(() => {
    load();
  }, [load]);

  const removeVideo =
    async (id) => {
      if (
        !window.confirm(
          "Delete this video?"
        )
      ) {
        return;
      }

      try {
        const response =
          await fetch(
            "/api/videos/" +
              encodeURIComponent(id),
            {
              method: "DELETE"
            }
          );

        if (
          response.status === 401
        ) {
          window.location.href =
            "/admin-login";

          return;
        }

        const data =
          await response.json();

        if (!response.ok) {
          throw new Error(
            data.error ||
              "Could not delete video."
          );
        }

        await load();
      } catch (error) {
        window.alert(
          error.message
        );
      }
    };

  const handleSubmit =
    async (event) => {
      event.preventDefault();

      if (adding) {
        return;
      }

      const urlList =
        urls
          .split(",")
          .map((url) =>
            url.trim()
          )
          .filter(Boolean);

      if (!urlList.length) {
        setMessage(
          "Please enter at least one YouTube or TikTok URL."
        );

        return;
      }

      setAdding(true);

      setMessage(
        `Processing ${
          urlList.length
        } video${
          urlList.length === 1
            ? ""
            : "s"
        }… This can take a while.`
      );

      let added = 0;
      let failed = 0;

      const errors = [];

      for (
        const url of urlList
      ) {
        try {
          const response =
            await fetch(
              "/api/videos",
              {
                method: "POST",
                headers: {
                  "Content-Type":
                    "application/json"
                },
                body:
                  JSON.stringify({
                    url
                  })
              }
            );

          if (
            response.status === 401
          ) {
            window.location.href =
              "/admin-login";

            return;
          }

          const data =
            await response.json();

          if (!response.ok) {
            failed++;

            errors.push(
              data.error ||
                "Unknown error"
            );

            continue;
          }

          added++;

          setMessage(
            `Processed ${
              added + failed
            } of ${
              urlList.length
            }…`
          );

          await load();
        } catch (error) {
          failed++;

          errors.push(
            error.message
          );
        }
      }

      setUrls("");

      if (failed === 0) {
        setMessage(
          `${added} video${
            added === 1
              ? ""
              : "s"
          } added and analyzed.`
        );
      } else {
        setMessage(
          `${added} added, ${failed} failed.` +
            (
              errors.length
                ? ` ${errors.join(
                    " "
                  )}`
                : ""
            )
        );
      }

      setAdding(false);

      await load();
    };

  const handleLogout =
    async () => {
      try {
        await fetch(
          "/admin-logout",
          {
            method: "POST"
          }
        );
      } finally {
        window.location.href =
          "/admin-login";
      }
    };

  return (
    <main className="app admin">
      <header>
        <div>
          <div className="eyebrow">
            Admin
          </div>

          <h1>
            Video Library
          </h1>
        </div>

        <button
          type="button"
          className="secondary"
          onClick={
            handleLogout
          }
        >
          Logout
        </button>
      </header>

      <section className="card">
        <div className="library-head">
          <h2>
            Add videos
          </h2>
        </div>

        <form
          onSubmit={
            handleSubmit
          }
        >
          <textarea
            id="url"
            value={urls}
            onChange={(event) =>
              setUrls(
                event.target.value
              )
            }
            placeholder="Enter YouTube or TikTok URLs, separated by commas"
            rows={5}
            disabled={adding}
          />

          <button
            type="submit"
            className="primary"
            disabled={adding}
          >
            {adding
              ? "Adding videos…"
              : "Add videos"}
          </button>
        </form>

        {message && (
          <p
            className={
              message
                .toLowerCase()
                .includes("failed")
                ? "error"
                : "muted"
            }
          >
            {message}
          </p>
        )}
      </section>

      <section
        className="card"
        style={{
          marginTop: "20px"
        }}
      >
        <div className="library-head">
          <h2>
            Videos
          </h2>

          <button
            type="button"
            className="secondary"
            onClick={load}
            disabled={loading}
          >
            {loading
              ? "Loading…"
              : "Refresh"}
          </button>
        </div>

        {loading ? (
          <p className="muted">
            Loading…
          </p>
        ) : videos.length ===
          0 ? (
          <p className="muted">
            No videos found.
          </p>
        ) : (
          <div>
            {videos.map(
              (video) => (
                <div
                  className="video-row"
                  key={video.id}
                >
                  <div>
                    <strong>
                      {video.title ||
                        "Untitled"}
                    </strong>

                    <small>
                      {video.channel ||
                        "Unknown channel"}
                    </small>

                    <small>
                      {video.ready
                        ? "Ready"
                        : "Processing"}
                    </small>
                  </div>

                  <button
                    type="button"
                    className="danger"
                    onClick={() =>
                      removeVideo(
                        video.id
                      )
                    }
                  >
                    Delete
                  </button>
                </div>
              )
            )}
          </div>
        )}
      </section>
    </main>
  );
}