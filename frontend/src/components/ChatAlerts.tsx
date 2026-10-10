import { useEffect, useState } from "react";
import { post } from "../services/api";

export default function ChatAlerts({ userId }: { userId: number }) {
  const [support, setSupport] = useState(false),
    [campus, setCampus] = useState(false);
  const [busy, setBusy] = useState(true),
    [status, setStatus] = useState("");
  async function subscription() {
    if (!("serviceWorker" in navigator))
      throw new Error(
        "Use Install & alerts to enable notifications on a supported device first.",
      );
    const sub = await (
      await navigator.serviceWorker.getRegistration()
    )?.pushManager.getSubscription();
    if (
      !sub ||
      !("Notification" in window) ||
      Notification.permission !== "granted"
    )
      throw new Error(
        "Enable notifications in Install & alerts first, then return here and save your choices.",
      );
    return sub.toJSON();
  }
  useEffect(() => {
    let active = true;
    setBusy(true);
    setSupport(false);
    setCampus(false);
    subscription()
      .then((s) => post("/push/chat/status", s))
      .then((p) => {
        if (active) {
          setSupport(p.support_alerts);
          setCampus(p.campus_alerts);
          setStatus("");
        }
      })
      .catch((e) => {
        if (active) setStatus(e.message);
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [userId]);
  return (
    <fieldset className="chat-alerts" disabled={busy}>
      <legend>Chat notifications on this device</legend>
      <label>
        <input
          type="checkbox"
          checked={support}
          onChange={(e) => setSupport(e.target.checked)}
        />{" "}
        Private support alerts
      </label>
      <label>
        <input
          type="checkbox"
          checked={campus}
          onChange={(e) => setCampus(e.target.checked)}
        />{" "}
        Campus group alerts
      </label>
      <p>
        Uncheck either option to mute it. Alerts contain no message preview and
        stop when you sign out or your session expires. After signing in again,
        save your choices to reconnect this device.
      </p>
      <button
        type="button"
        className="outline-button"
        onClick={async () => {
          setBusy(true);
          try {
            await post(
              "/push/chat",
              {
                ...(await subscription()),
                support_alerts: support,
                campus_alerts: campus,
              },
              "PUT",
            );
            setStatus(
              "Saved. " +
                (support || campus
                  ? "Your selected chat alerts are on."
                  : "All chat alerts are muted."),
            );
          } catch (e) {
            setStatus((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Updating…" : "Save chat notification settings"}
      </button>
      {status && <p role="status">{status}</p>}
    </fieldset>
  );
}
