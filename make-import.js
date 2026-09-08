const fs = require("fs");

const videos = require("./data/videos.json");

function escapeSql(value) {
  if (value === null || value === undefined) return "NULL";
  return "'" + String(value).replace(/'/g, "''") + "'";
}

function jsonSql(value) {
  return "'" + JSON.stringify(value).replace(/'/g, "''") + "'::jsonb";
}

const sql = videos.map(v => `
INSERT INTO videos
(id, title, channel, duration, good_sections, ready, created_at, audio_url)
VALUES (
  ${escapeSql(v.id)},
  ${escapeSql(v.title)},
  ${escapeSql(v.channel)},
  ${v.duration},
  ${jsonSql(v.goodSections)},
  ${v.ready},
  ${escapeSql(v.createdAt)},
  ${escapeSql(v.audioUrl)}
);`).join("\n");

fs.writeFileSync("import.sql", sql);

console.log(`Created import.sql with ${videos.length} videos.`);
