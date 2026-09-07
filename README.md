# Guess the YouTube Video

A small local web game:

- Add YouTube videos in `/admin.html`
- The server downloads the audio for each video
- FFmpeg detects silent sections
- A random audible section is selected and stored
- The game reveals 1 second, then 2, then 3, etc.
- Guessing earlier gives more points

## Requirements

- Node.js 18+
- FFmpeg + ffprobe
- yt-dlp

On Ubuntu:

```bash
sudo apt update
sudo apt install ffmpeg
```

Install yt-dlp with pip:

```bash
python3 -m pip install -U yt-dlp
```

If Ubuntu blocks system pip, use:

```bash
python3 -m venv ~/.venvs/yt-dlp
~/.venvs/yt-dlp/bin/pip install -U yt-dlp
sudo ln -s ~/.venvs/yt-dlp/bin/yt-dlp /usr/local/bin/yt-dlp
```

Check:

```bash
node --version
ffmpeg -version
ffprobe -version
yt-dlp --version
```

## Run

From this folder:

```bash
npm install
npm start
```

Open:

```text
http://localhost:3000
```

Then open:

```text
http://localhost:3000/admin.html
```

Add a few YouTube videos. Processing can take a while because the server needs to obtain and analyze the audio.

## Important

This prototype downloads audio from YouTube. Only use it with videos/content you have permission to download and use, and make sure your use complies with YouTube's terms and applicable copyright law.

## How the audio point is selected

During import, FFmpeg uses `silencedetect` with a -35 dB threshold and a 0.35 second silence duration. The server builds audible ranges and prefers a range with at least 12 seconds of sound, avoiding the first and last 5 seconds when possible. It then randomly selects a start point and creates a 20-second local clip.

The game always plays the beginning of that selected clip. Therefore:

1 sec = first second of the chosen moment
2 sec = first two seconds
3 sec = first three seconds

and so on.

## Next improvements

Good candidates for version 2:

- Player names / teams and a leaderboard
- Categories
- Multiple rounds / configurable game length
- Better audio scoring (speech/music/volume)
- Admin preview of the selected timestamp
- Manually adjust the timestamp
- Authentication for the admin page
- Persistent users and scores
- Docker setup
