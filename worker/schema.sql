-- The tables behind /tg/*. Safe to run again:
--   npx wrangler d1 execute novosad-tg --remote --file worker/schema.sql
-- A visitor's own messages are not stored; they go to Telegram and stay there.

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash TEXT NOT NULL UNIQUE,
  nick TEXT NOT NULL,
  created INTEGER NOT NULL,
  last INTEGER NOT NULL,
  sent INTEGER NOT NULL DEFAULT 0,
  banned INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS sessions_created ON sessions (created);

-- The bot's message in the owner's chat, so that a reply to it finds the session.
CREATE TABLE IF NOT EXISTS outbound (
  tg_message_id INTEGER PRIMARY KEY,
  session_id INTEGER NOT NULL,
  at INTEGER NOT NULL
);

-- The owner's answers, waiting for the next poll. tg_message_id makes a resent update harmless.
CREATE TABLE IF NOT EXISTS replies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  tg_message_id INTEGER NOT NULL UNIQUE,
  text TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS replies_session ON replies (session_id, id);
