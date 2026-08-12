CREATE TABLE IF NOT EXISTS task_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  entity_id TEXT NOT NULL CHECK (entity_id = 'todo.shopping_list'),
  items_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
