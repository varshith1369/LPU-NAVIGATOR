import { useEffect, useState } from "react";
import { freshFix, watchLocation, type LocationFix } from "./location";

export function useLiveLocation() {
  const [enabled, setEnabled] = useState(false);
  const [fix, setFix] = useState<LocationFix | null>(null);
  const [error, setError] = useState("");
  const [visible, setVisible] = useState(!document.hidden);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const changed = () => {
      setVisible(!document.hidden);
      setNow(Date.now());
    };
    document.addEventListener("visibilitychange", changed);
    return () => document.removeEventListener("visibilitychange", changed);
  }, []);
  useEffect(() => {
    if (!enabled || !visible) return;
    if (!navigator.geolocation) {
      setError("This browser does not support device location.");
      setEnabled(false);
      return;
    }
    const stop = watchLocation(
      navigator.geolocation,
      (value) => {
        setFix(value);
        setError("");
        setNow(Date.now());
      },
      (message, denied) => {
        setError(message);
        if (denied) {
          setEnabled(false);
          setFix(null);
        }
      },
    );
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => {
      stop();
      clearInterval(timer);
    };
  }, [enabled, visible]);
  return {
    enabled,
    fix,
    error,
    fresh: enabled && visible && freshFix(fix, now),
    start: () => {
      setError("");
      setEnabled(true);
    },
    stop: () => {
      setEnabled(false);
      setFix(null);
      setError("");
    },
  };
}
