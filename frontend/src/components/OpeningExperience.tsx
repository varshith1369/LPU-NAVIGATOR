import { useEffect, useRef, useState, type ReactNode } from "react";
import { Volume2, VolumeX, ArrowRight, Navigation } from "lucide-react";
import "../opening.css";

export default function OpeningExperience({
  children,
}: {
  children: ReactNode;
}) {
  const [intro, setIntro] = useState(() => !location.search && !location.hash);
  const [sound, setSound] = useState(false);
  const [audioError, setAudioError] = useState("");
  const audio = useRef<AudioContext | null>(null);
  const finish = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enter = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!intro) return;
    enter.current?.focus();
    const timer = setTimeout(() => setIntro(false), 3800);
    return () => clearTimeout(timer);
  }, [intro]);
  useEffect(
    () => () => {
      if (finish.current) clearTimeout(finish.current);
      void audio.current?.close();
    },
    [],
  );
  async function play() {
    if (audio.current) {
      await audio.current.close();
      audio.current = null;
      setSound(false);
      return;
    }
    try {
      const ctx = new AudioContext();
      audio.current = ctx;
      await ctx.resume();
      // A short original pentatonic welcome theme, generated locally.
      const gain = ctx.createGain();
      gain.gain.value = 0.06;
      gain.connect(ctx.destination);
      [261.63, 329.63, 392, 523.25, 440, 392, 329.63, 523.25].forEach(
        (frequency, index) => {
          const tone = ctx.createOscillator(),
            envelope = ctx.createGain();
          const start = ctx.currentTime + index * 0.42;
          tone.type = "sine";
          tone.frequency.value = frequency;
          envelope.gain.setValueAtTime(0, start);
          envelope.gain.linearRampToValueAtTime(0.7, start + 0.035);
          envelope.gain.exponentialRampToValueAtTime(0.001, start + 1.2);
          tone.connect(envelope);
          envelope.connect(gain);
          tone.start(start);
          tone.stop(start + 1.3);
        },
      );
      setSound(true);
      setAudioError("");
      if (finish.current) clearTimeout(finish.current);
      finish.current = setTimeout(() => {
        if (audio.current === ctx) {
          void ctx.close();
          audio.current = null;
          setSound(false);
        }
      }, 4400);
    } catch {
      void audio.current?.close();
      audio.current = null;
      setSound(false);
      setAudioError("Sound is unavailable in this browser.");
    }
  }
  return (
    <>
      <div inert={intro}>{children}</div>
      {intro && (
        <section
          className="campus-opening"
          role="dialog"
          aria-modal="true"
          aria-labelledby="opening-title"
          onKeyDown={(event) => {
            if (event.key === "Escape") setIntro(false);
            if (event.key === "Tab") {
              const buttons = event.currentTarget.querySelectorAll("button");
              const first = buttons[0], last = buttons[buttons.length - 1];
              if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
              else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
            }
          }}
        >
          <div className="opening-grid" aria-hidden="true" />
          <div className="opening-orbit" aria-hidden="true">
            <span />
            <span />
            <Navigation size={42} />
          </div>
          <div className="opening-copy">
            <p className="opening-kicker">YOUR CAMPUS. YOUR DIRECTION.</p>
            <h1 id="opening-title">
              Every path.
              <br />
              <em>A new possibility.</em>
            </h1>
            <p className="opening-product">LPU Campus Navigator</p>
            <div className="opening-credit">
              <span>DESIGNED & DEVELOPED BY</span>
              <strong>Y VARSHITH REDDY</strong>
            </div>
            <div className="opening-actions">
              <button ref={enter} onClick={() => setIntro(false)}>
                Enter campus <ArrowRight size={17} />
              </button>
              <button
                onClick={() => {
                  void play();
                  setIntro(false);
                }}
              >
                <Volume2 size={17} /> Enter with music
              </button>
            </div>
            <small>
              Opening automatically · Sound plays only when you choose it
            </small>
          </div>
          <div className="opening-progress" aria-hidden="true" />
        </section>
      )}
      {!intro && (
        <button
          className="welcome-sound"
          onClick={() => void play()}
          aria-label={sound ? "Stop welcome music" : "Play welcome music"}
          title={
            audioError || (sound ? "Stop welcome music" : "Play welcome music")
          }
        >
          {sound ? <Volume2 size={17} /> : <VolumeX size={17} />}
          <span>{sound ? "Sound on" : "Welcome music"}</span>
        </button>
      )}
      {audioError && (
        <span className="sound-error" role="status">
          {audioError}
        </span>
      )}
    </>
  );
}
