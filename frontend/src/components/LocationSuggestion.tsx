import { useEffect, useRef, useState } from "react";
import { post, type Place, type User } from "../services/api";
import {
  freshFix,
  locationError,
  readFix,
  type LocationFix,
} from "../services/location";

export default function LocationSuggestion({
  place,
  user,
  initialFix,
  preview,
  close,
  signIn,
  notify,
}: {
  place: Place;
  user: User | null;
  initialFix: LocationFix | null;
  preview: (fix: LocationFix) => void;
  close: () => void;
  signIn: () => void;
  notify: (message: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const active = useRef(true);
  const [fix, setFix] = useState(initialFix);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [consent, setConsent] = useState(false);
  const [description, setDescription] = useState("");
  useEffect(() => {
    active.current = true;
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    return () => {
      active.current = false;
      previous?.focus();
    };
  }, []);
  const capture = () => {
    if (!navigator.geolocation) {
      setError("Location is unavailable in this browser.");
      return;
    }
    setBusy(true);
    setError("");
    setConsent(false);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        if (!active.current) return;
        setBusy(false);
        try {
          const value = readFix(p);
          if (!freshFix(value) || value.accuracy > 100)
            throw new Error(
              "A more accurate location is needed (within 100 m). Move outdoors and capture again.",
            );
          if (
            value.latitude < 31.24 ||
            value.latitude > 31.27 ||
            value.longitude < 75.69 ||
            value.longitude > 75.72
          )
            throw new Error(
              "This position is outside the campus area. Capture it while you are at this place on campus.",
            );
          setFix(value);
          preview(value);
        } catch (e) {
          setError((e as Error).message);
        }
      },
      (e) => {
        if (active.current) {
          setBusy(false);
          setError(locationError(e));
        }
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
    );
  };
  return (
    <dialog
      ref={dialog}
      className="gps-dialog"
      onCancel={close}
      aria-labelledby="gps-title"
    >
      <button
        className="close"
        aria-label="Close location suggestion"
        onClick={close}
      >
        ×
      </button>
      <span className="eyebrow">HELP MAP THE CAMPUS</span>
      <h2 id="gps-title">I’m at {place.name}</h2>
      <p>
        Stand at the public entrance, then capture your device location. The
        preview stays in this session until you choose to share it.
      </p>
      <button className="primary-button" disabled={busy} onClick={capture}>
        {busy
          ? "Getting location…"
          : fix
            ? "Capture again"
            : "Capture my position"}
      </button>
      {fix && (
        <div className="gps-preview">
          <strong>Position captured · ±{Math.round(fix.accuracy)} m</strong>
          <p>
            {fix.latitude.toFixed(6)}, {fix.longitude.toFixed(6)}
            <br />
            Captured {new Date(fix.timestamp).toLocaleTimeString()} · Unverified
          </p>
          <button className="subtle-link" onClick={close}>
            View numbered preview on map
          </button>
        </div>
      )}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!user) {
            signIn();
            return;
          }
          if (!fix || Date.now() - fix.timestamp > 300000) {
            setError(
              "Capture a fresh position before sharing (within five minutes).",
            );
            return;
          }
          if (!consent) return;
          setBusy(true);
          setError("");
          try {
            await post("/submissions", {
              historical_id: place.id,
              description,
              suggested_latitude: fix.latitude,
              suggested_longitude: fix.longitude,
              accuracy_m: fix.accuracy,
              captured_at: new Date(fix.timestamp).toISOString(),
              location_consent: true,
            });
            notify(
              "Location suggestion sent for review. The public map changes only after verification.",
            );
            close();
          } catch (e) {
            if (active.current) setError((e as Error).message);
          } finally {
            if (active.current) setBusy(false);
          }
        }}
      >
        <label htmlFor="gps-evidence">What identifies this entrance?</label>
        <textarea
          id="gps-evidence"
          placeholder="Describe the entrance, building sign or nearby landmark…"
          required
          minLength={10}
          maxLength={5000}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <label className="gps-consent">
          <input
            type="checkbox"
            checked={consent}
            required
            onChange={(e) => setConsent(e.target.checked)}
          />
          Share this exact position, accuracy, capture time and description with
          campus reviewers, linked to my account.
        </label>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <button className="primary-button" disabled={!fix || !consent || busy}>
          {user ? "Submit for review" : "Sign in to submit"}
        </button>
      </form>
    </dialog>
  );
}
