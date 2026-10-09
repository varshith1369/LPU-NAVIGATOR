import { useEffect, useState, useRef } from "react";
import { api, post, type User } from "../services/api";
export default function Conversations({ user }: { user: User | null }) {
  const messageList = useRef<HTMLDivElement>(null);
  const followLatest = useRef(true);
  const [rooms, setRooms] = useState<any[]>([]),
    [room, setRoom] = useState(""),
    [messages, setMessages] = useState<any[]>([]),
    [text, setText] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [updated, setUpdated] = useState("");
  useEffect(() => {
    if (!user) return;
    let active = true;
    const load = async () => {
      try {
        const rows = await api("/conversations");
        if (active) {
          setRooms(rows);
          setRoom(
            (old) =>
              old ||
              String(
                rows.find((r: any) => r.kind === "SUPPORT")?.id || rows[0]?.id,
              ),
          );
        }
      } catch (e) {
        if (active) setError((e as Error).message);
      }
    };
    load();
    const timer = setInterval(load, 10000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [user]);
  useEffect(() => {
    if (!room) return;
    let active = true;
    setMessages([]);
    setText("");
    followLatest.current = true;
    const load = async () => {
      if (document.hidden) return;
      try {
        const rows = await api(`/conversations/${room}/messages`);
        if (active) {
          setMessages(rows);
          setError("");
          setUpdated(new Date().toLocaleTimeString());
        }
      } catch (e) {
        if (active) setError((e as Error).message);
      }
    };
    load();
    const timer = setInterval(load, 3000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [room]);
  useEffect(() => {
    const element = messageList.current;
    if (element && followLatest.current)
      element.scrollTop = element.scrollHeight;
  }, [messages]);
  const current = rooms.find((r) => String(r.id) === room);
  if (!user)
    return (
      <section className="content-panel">
        <h2>Campus conversations</h2>
        <p>
          Sign in from Account to join the campus chat or privately contact an
          administrator.
        </p>
      </section>
    );
  return (
    <section className="content-panel">
      <div className="eyebrow">CONNECT WITH CAMPUS</div>
      <h2>Conversations</h2>
      <p>
        Private support and a shared campus chat. Messages refresh every three
        seconds while this page is open.
      </p>
      <div className="chat-layout">
        <aside className="chat-rooms">
          {rooms.map((r) => (
            <button
              className={
                String(r.id) === room ? "primary-button" : "outline-button"
              }
              key={r.id}
              disabled={busy}
              onClick={() => setRoom(String(r.id))}
            >
              {r.kind === "CAMPUS"
                ? "Campus group"
                : user.role === "ADMIN"
                  ? r.title
                  : "Private support"}
              {r.closed ? " · Closed" : ""}
            </button>
          ))}
        </aside>
        <div>
          <h3>
            {current?.kind === "CAMPUS" ? "Campus group" : "Private support"}
          </h3>
          <p>
            {current?.kind === "CAMPUS"
              ? "Visible to signed-in campus members. Avoid sharing personal information."
              : "Only this account and administrators can read this conversation."}
          </p>
          {user.role === "ADMIN" && current && (
            <button
              className="outline-button"
              onClick={async () => {
                try {
                  await post(
                    `/conversations/${room}`,
                    { closed: !current.closed },
                    "PATCH",
                  );
                  setRooms((rows) =>
                    rows.map((r) =>
                      String(r.id) === room ? { ...r, closed: !r.closed } : r,
                    ),
                  );
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              {current.closed ? "Reopen conversation" : "Close conversation"}
            </button>
          )}
          <div
            className="chat-messages"
            ref={messageList}
            onScroll={() => {
              const el = messageList.current;
              if (el)
                followLatest.current =
                  el.scrollHeight - el.scrollTop - el.clientHeight < 80;
            }}
            role="log"
            aria-label="Conversation messages"
          >
            {messages.length === 100 && (
              <small>Showing the latest 100 messages.</small>
            )}
            {!messages.length && (
              <p>No messages yet. Start a conversation below.</p>
            )}
            {messages.map((m) => (
              <article
                className={`chat-message ${String(m.sender_id) === String(user.id) ? "mine" : ""}`}
                key={m.id}
              >
                <small>
                  {String(m.sender_id) === String(user.id) ? "You" : m.sender} ·{" "}
                  {new Date(m.created_at).toLocaleString()}
                </small>
                <p>{m.body}</p>
                {user.role === "ADMIN" && !m.removed && (
                  <button
                    onClick={async () => {
                      try {
                        await post(
                          `/conversations/${room}/messages/${m.id}`,
                          {},
                          "DELETE",
                        );
                        setMessages((rows) =>
                          rows.map((row) =>
                            row.id === m.id
                              ? {
                                  ...row,
                                  removed: true,
                                  body: "[Message removed by moderator]",
                                }
                              : row,
                          ),
                        );
                      } catch (e) {
                        setError((e as Error).message);
                      }
                    }}
                  >
                    Remove message
                  </button>
                )}
              </article>
            ))}
          </div>
          <small>{updated && `Last synced ${updated}`}</small>
          {error && <p role="alert">{error}</p>}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (busy || !room) return;
              setBusy(true);
              try {
                await post(`/conversations/${room}/messages`, { body: text });
                setText("");
                setMessages(await api(`/conversations/${room}/messages`));
                setError("");
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Message
              <textarea
                required
                maxLength={2000}
                value={text}
                onChange={(e) => setText(e.target.value)}
                disabled={busy || current?.closed}
              />
            </label>
            <button
              className="primary-button"
              disabled={busy || !room || current?.closed}
            >
              {busy ? "Sending…" : "Send message"}
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}
