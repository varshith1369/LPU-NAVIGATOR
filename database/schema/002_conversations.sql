CREATE TABLE IF NOT EXISTS conversations (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 owner_id bigint REFERENCES users(id),
 kind text NOT NULL CHECK(kind IN ('SUPPORT','CAMPUS')),
 closed boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS one_support_per_user ON conversations(owner_id) WHERE kind='SUPPORT';
CREATE UNIQUE INDEX IF NOT EXISTS one_campus_room ON conversations(kind) WHERE kind='CAMPUS';
INSERT INTO conversations(kind) VALUES('CAMPUS') ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS conversation_messages (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 conversation_id bigint NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
 sender_id bigint NOT NULL REFERENCES users(id),
 body text NOT NULL CHECK(length(body) BETWEEN 1 AND 2000),
 removed boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS conversation_message_order ON conversation_messages(conversation_id,id);
CREATE TABLE IF NOT EXISTS removed_imports(source_id text PRIMARY KEY REFERENCES sources(id),removed_at timestamptz NOT NULL DEFAULT now());
