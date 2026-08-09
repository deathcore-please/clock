CREATE TABLE IF NOT EXISTS ambient_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  available INTEGER NOT NULL CHECK (available IN (0, 1)),
  is_on INTEGER NOT NULL CHECK (is_on IN (0, 1)),
  mode TEXT NOT NULL CHECK (mode IN ('neutral', 'white', 'colour')),
  red INTEGER NOT NULL CHECK (red BETWEEN 0 AND 255),
  green INTEGER NOT NULL CHECK (green BETWEEN 0 AND 255),
  blue INTEGER NOT NULL CHECK (blue BETWEEN 0 AND 255),
  brightness INTEGER NOT NULL CHECK (brightness BETWEEN 0 AND 255),
  updated_at INTEGER NOT NULL
);
