import { useState } from "react";
import { post } from "../services/api";
export default function AdminTools({
  data,
  reload,
}: {
  data: any;
  reload: () => void;
}) {
  const [kind, setKind] = useState("sources"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <section>
      <h3>Evidence and facilities</h3>
      <label>
        Manage
        <select
          value={kind}
          onChange={(e) => {
            setKind(e.target.value);
            setError("");
          }}
        >
          <option value="sources">Register evidence source</option>
          <option value="facilities">Attach facility to building</option>
          <option value="verification">Review building evidence</option>
        </select>
      </label>
      <form
        key={kind}
        onSubmit={async (e) => {
          e.preventDefault();
          const element = e.currentTarget;
          const fields = Object.fromEntries(new FormData(element));
          const body: any = { ...fields };
          if (body.location_id) body.location_id = Number(body.location_id);
          if (!body.url) delete body.url;
          setBusy(true);
          setError("");
          try {
            await post(`/admin/${kind}`, body);
            element.reset();
            reload();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {kind === "sources" ? (
          <>
            <label>
              Source ID
              <input
                name="id"
                required
                placeholder="e.g. campus-survey-2026"
                maxLength={200}
              />
            </label>
            <label>
              Title
              <input name="title" required maxLength={300} />
            </label>
            <label>
              Type
              <select name="type">
                <option value="ADMIN_VERIFIED">Admin survey</option>
                <option value="OFFICIAL_LPU">Official LPU publication</option>
                <option value="PUBLIC_MAP">Public map</option>
                <option value="USER_SUBMISSION">User submission</option>
              </select>
            </label>
            <label>
              Evidence URL
              <input type="url" name="url" />
            </label>
            <label>
              Notes
              <textarea name="notes" maxLength={5000} />
            </label>
          </>
        ) : (
          <>
            <label>
              Building
              <select name="location_id" required>
                <option value="">Choose building</option>
                {data.locations.map((p: any) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Evidence source
              <select required name="source_id">
                <option value="">Choose evidence</option>
                {data.sources
                  .filter((s: any) => s.type !== "OLD_LPU_MAP")
                  .map((s: any) => (
                    <option key={s.id} value={s.id}>
                      {s.title}
                    </option>
                  ))}
              </select>
            </label>
            {kind === "facilities" ? (
              <label>
                Facility name
                <input
                  required
                  name="name"
                  maxLength={100}
                  placeholder="e.g. Drinking water"
                />
              </label>
            ) : (
              <>
                <label>
                  Review field
                  <select name="field">
                    <option value="identity">Name / building identity</option>
                    <option value="position">GPS position</option>
                  </select>
                </label>
                <label>
                  Verification
                  <select name="verification_status">
                    {[
                      "UNVERIFIED",
                      "APPROXIMATE",
                      "VERIFIED_PUBLIC",
                      "VERIFIED_OFFICIAL",
                      "PENDING_REVIEW",
                    ].map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Evidence and review notes
                  <textarea
                    required
                    minLength={10}
                    maxLength={5000}
                    name="claim"
                  />
                </label>
              </>
            )}
          </>
        )}
        {error && <p role="alert">{error}</p>}
        <button className="outline-button" disabled={busy}>
          {busy ? "Saving…" : "Save changes"}
        </button>
      </form>
      <h3>Building facilities</h3>
      {data.facilities.map((f: any) => (
        <div className="admin-record" key={`${f.location_id}-${f.facility_id}`}>
          <span>
            {f.location_name} - {f.name}
          </span>
          <button
            onClick={async () => {
              if (!confirm(`Remove ${f.name} from this building?`)) return;
              try {
                await post(
                  `/admin/locations/${f.location_id}/facilities/${f.facility_id}`,
                  {},
                  "DELETE",
                );
                reload();
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Remove
          </button>
        </div>
      ))}
      <h3>Rename categories</h3>
      {data.categories.map((c: any) => (
        <form
          key={c.id}
          onSubmit={async (e) => {
            e.preventDefault();
            const name = new FormData(e.currentTarget).get("name");
            try {
              await post(`/admin/categories/${c.id}`, { name }, "PUT");
              reload();
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          <label>
            {c.name}
            <input required maxLength={100} name="name" defaultValue={c.name} />
          </label>
          <button>Save category</button>
        </form>
      ))}
    </section>
  );
}
