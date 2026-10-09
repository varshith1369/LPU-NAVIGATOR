import { useState } from "react";
import { post } from "../services/api";
const localDate = (value: string) => {
  const d = new Date(value);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
};
const blank = () => ({
  title: "",
  description: "",
  location_id: "",
  start_date: localDate(new Date().toISOString()),
  end_date: "",
  priority: 0,
});
export default function AnnouncementEditor({
  items,
  locations,
  reload,
}: {
  items: any[];
  locations: any[];
  reload: () => void;
}) {
  const [form, setForm] = useState(blank),
    [editing, setEditing] = useState<string | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const update = (key: string, value: any) =>
    setForm((f) => ({ ...f, [key]: value }));
  return (
    <section className="admin-announcements">
      <h3>Publish campus announcements</h3>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const start = new Date(form.start_date).toISOString(),
              end = form.end_date
                ? new Date(form.end_date).toISOString()
                : null;
            if (end && end <= start)
              throw new Error("End time must be after the start time.");
            await post(
              `/admin/announcements${editing ? `/${editing}` : ""}`,
              {
                ...form,
                start_date: start,
                end_date: end,
                location_id: form.location_id ? Number(form.location_id) : null,
              },
              editing ? "PUT" : "POST",
            );
            setForm(blank());
            setEditing(null);
            reload();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Title
          <input
            required
            maxLength={200}
            value={form.title}
            onChange={(e) => update("title", e.target.value)}
          />
        </label>
        <label>
          Announcement
          <textarea
            required
            maxLength={5000}
            value={form.description}
            onChange={(e) => update("description", e.target.value)}
          />
        </label>
        <label>
          Location
          <select
            value={form.location_id}
            onChange={(e) => update("location_id", e.target.value)}
          >
            <option value="">Whole campus</option>
            {locations.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <div className="field-pair">
          <label>
            Starts (your local time)
            <input
              required
              type="datetime-local"
              value={form.start_date}
              onChange={(e) => update("start_date", e.target.value)}
            />
          </label>
          <label>
            Ends (optional)
            <input
              type="datetime-local"
              value={form.end_date}
              onChange={(e) => update("end_date", e.target.value)}
            />
          </label>
        </div>
        <label>
          Priority
          <select
            value={form.priority}
            onChange={(e) => update("priority", Number(e.target.value))}
          >
            {["Normal", "Important", "High", "Urgent"].map((p, i) => (
              <option value={i} key={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        {error && <p role="alert">{error}</p>}
        <button className="primary-button" disabled={busy}>
          {busy
            ? "Saving…"
            : editing
              ? "Save announcement"
              : "Publish / schedule"}
        </button>
        {editing && (
          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setForm(blank());
            }}
          >
            Cancel edit
          </button>
        )}
      </form>
      <h3>All announcements</h3>
      {!items.length && <p>No announcements yet.</p>}
      {items.map((a) => (
        <article className="admin-record" key={a.id}>
          <strong>{a.title}</strong>
          <small>
            {new Date(a.start_date) > new Date()
              ? "Scheduled"
              : a.end_date && new Date(a.end_date) <= new Date()
                ? "Expired"
                : "Published"}{" "}
            · {new Date(a.start_date).toLocaleString()}
          </small>
          <p>{a.description}</p>
          <button
            onClick={() => {
              setEditing(String(a.id));
              setForm({
                ...a,
                location_id: a.location_id == null ? "" : String(a.location_id),
                start_date: localDate(a.start_date),
                end_date: a.end_date ? localDate(a.end_date) : "",
              });
            }}
          >
            Edit
          </button>
          <button
            onClick={async () => {
              if (!confirm(`Delete announcement “${a.title}”?`)) return;
              try {
                await post(`/admin/announcements/${a.id}`, {}, "DELETE");
                reload();
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Delete
          </button>
        </article>
      ))}
    </section>
  );
}
