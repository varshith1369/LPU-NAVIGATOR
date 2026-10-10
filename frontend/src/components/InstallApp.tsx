import { useEffect, useRef, useState } from "react";
import { Download, Bell, X } from "lucide-react";
import { api, post } from "../services/api";

type InstallEvent = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};
const standalone = () =>
  Boolean(window.matchMedia?.("(display-mode: standalone)").matches) ||
  Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
const appleMobile = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
export default function InstallApp() {
  const [open, setOpen] = useState(false),
    [installed, setInstalled] = useState(standalone);
  const [enabled, setEnabled] = useState(false),
    [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const install = useRef<InstallEvent | null>(null);
  const dialog = useRef<HTMLDialogElement | null>(null);
  useEffect(() => {
    if (open) dialog.current?.showModal?.();
  }, [open]);
  const supported =
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window;
  useEffect(() => {
    const prompt = (event: Event) => {
      event.preventDefault();
      install.current = event as InstallEvent;
    };
    const done = () => {
      setInstalled(true);
      install.current = null;
    };
    window.addEventListener("beforeinstallprompt", prompt);
    window.addEventListener("appinstalled", done);
    if (supported)
      navigator.serviceWorker
        .getRegistration()
        .then(async (r) => {
          const sub = await r?.pushManager.getSubscription();
          if (sub && Notification.permission === "granted") {
            // Reconcile browser state with the server after a retry or data restore.
            await post("/push/subscriptions", sub.toJSON());
            setEnabled(true);
          }
        })
        .catch(() => {});
    return () => {
      window.removeEventListener("beforeinstallprompt", prompt);
      window.removeEventListener("appinstalled", done);
    };
  }, [supported]);
  async function toggleNotifications() {
    setBusy(true);
    setMessage("");
    try {
      if (!supported)
        throw new Error(
          "This browser does not support push notifications. Try an up-to-date browser, or install the app on iPhone/iPad first.",
        );
      // Request permission directly from this user gesture (required on iOS).
      if (!enabled && (await Notification.requestPermission()) !== "granted")
        throw new Error(
          "Notifications are blocked. Allow notifications in your browser or device settings, then try again.",
        );
      const registration = await navigator.serviceWorker.register("/sw.js", {
        scope: "/",
      });
      await Promise.race([
        navigator.serviceWorker.ready,
        new Promise((_, reject) =>
          setTimeout(
            () =>
              reject(
                new Error(
                  "App setup is taking longer than expected. Please retry.",
                ),
              ),
            12000,
          ),
        ),
      ]);
      let sub = await registration.pushManager.getSubscription();
      if (enabled && sub) {
        await post("/push/subscriptions", sub.toJSON(), "DELETE");
        await sub.unsubscribe();
        setEnabled(false);
        setMessage("Notifications turned off on this device.");
      } else {
        const { publicKey } = await api<{ publicKey: string | null }>(
          "/push/config",
        );
        if (!publicKey)
          throw new Error(
            "Notifications are not available yet. Please retry later.",
          );
        const bytes = Uint8Array.from(
          atob(
            publicKey.replace(/-/g, "+").replace(/_/g, "/") +
              "=".repeat((4 - (publicKey.length % 4)) % 4),
          ),
          (c) => c.charCodeAt(0),
        );
        sub ??= await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: bytes,
        });
        await post("/push/subscriptions", sub.toJSON());
        setEnabled(true);
        setMessage(
          "Notifications enabled. New announcements published now can reach this device even when the app is closed.",
        );
      }
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="install-app">
      <button
        className="text-button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
      >
        <Download size={17} /> <span>Install & alerts</span>
      </button>
      {open && (
        <dialog
          ref={dialog}
          className="install-dialog"
          aria-labelledby="install-heading"
          onCancel={() => setOpen(false)}
          onClose={() => setOpen(false)}
        >
          <button
            className="install-close"
            aria-label="Close installation options"
            onClick={() => setOpen(false)}
          >
            <X size={20} />
          </button>
          <h2 id="install-heading">Campus, a tap away.</h2>
          <p>Add Campus Navigator to your home screen or desktop.</p>
          <button
            className="primary-button"
            disabled={installed}
            onClick={async () => {
              setMessage("");
              try {
                if (install.current) {
                  await install.current.prompt();
                  await install.current.userChoice;
                  install.current = null;
                } else
                  setMessage(
                    appleMobile()
                      ? "In Safari, tap Share → Add to Home Screen, then open the installed app."
                      : "Open your browser menu and choose Install app or Apps → Install this site as an app. If unavailable, this browser does not support installation.",
                  );
              } catch {
                setMessage(
                  "Installation was not completed. You can try again from the browser menu.",
                );
              }
            }}
          >
            <Download size={17} />
            {installed ? "App installed" : "Install app"}
          </button>
          {appleMobile() && !installed && (
            <p>
              On iPhone/iPad: open in Safari → Share → Add to Home Screen. Open
              that app to enable notifications (iOS/iPadOS 16.4 or later).
            </p>
          )}
          <h3>
            <Bell size={18} /> Live announcement alerts
          </h3>
          <p>
            Choose whether this device receives new campus announcements. You
            can turn them off here anytime.
          </p>
          <button
            className="primary-button"
            disabled={busy || (appleMobile() && !installed)}
            onClick={toggleNotifications}
          >
            {busy
              ? "Updating…"
              : enabled
                ? "Turn off notifications"
                : "Enable notifications"}
          </button>
          <p className="install-note">
            An internet connection is required. Delivery depends on device
            settings. Scheduled announcements appear in Updates; push alerts
            currently apply to new announcements published immediately.
          </p>
          {message && (
            <p role="status" className="install-status">
              {message}
            </p>
          )}
        </dialog>
      )}
    </div>
  );
}
