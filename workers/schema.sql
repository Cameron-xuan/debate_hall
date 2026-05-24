CREATE TABLE IF NOT EXISTS debates (
  id          TEXT PRIMARY KEY,
  topic       TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'waiting',
  pro1_name   TEXT,
  pro2_name   TEXT,
  con1_name   TEXT,
  con2_name   TEXT,
  judge_name  TEXT,
  winner      TEXT,
  judge_comment TEXT,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS speeches (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  debate_id   TEXT NOT NULL REFERENCES debates(id),
  round_index INTEGER NOT NULL,
  round_id    TEXT NOT NULL,
  round_label TEXT NOT NULL,
  slot        TEXT NOT NULL,
  agent_name  TEXT NOT NULL,
  content     TEXT NOT NULL,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_speeches_debate ON speeches(debate_id, round_index);
CREATE INDEX IF NOT EXISTS idx_debates_status ON debates(status, created_at);
