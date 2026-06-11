import { useEffect, useRef, useState } from "react";
import * as Tone from "tone";

/* ── fret → Tone.js note name ── */
const OPEN_NOTES = { 1: 64, 2: 59, 3: 55, 4: 50, 5: 45, 6: 40 };

function midiToNoteName(midi) {
  const names = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
  const octave = Math.floor(midi / 12) - 1;
  return names[midi % 12] + octave;
}

function fretToNote(string, fret) {
  const open = OPEN_NOTES[string] ?? 40;
  return midiToNoteName(open + fret);
}

/* ── difficulty color palettes ── */
const DIFF_COLORS = {
  1: { accent: [126, 184, 247], accentDim: [42,  80,  128] },
  2: { accent: [126, 184, 247], accentDim: [42,  80,  128] },
  3: { accent: [167, 130, 255], accentDim: [ 72,  40, 140] },
  4: { accent: [255, 110,  80], accentDim: [130,  35,  10] },
  5: { accent: [220,  70, 100], accentDim: [110,  20,  40] },
};

function getDiffColor(difficulty) {
  return DIFF_COLORS[difficulty] ?? DIFF_COLORS[2];
}

function rgbStr(rgb) {
  return `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
}

/* ── global styles ── */
const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Mono:ital,wght@0,300;0,400;1,300&family=DM+Sans:wght@300;400&display=swap');

  :root {
    --bg: #09090c;
    --surface: #0f0f14;
    --accent: #7eb8f7;
    --accent-dim: #2a5080;
    --text: #dce4f0;
    --muted: #4a5260;
    --border: #1a1e28;
  }

  *, *::before, *::after {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
    scrollbar-width: none;
    -ms-overflow-style: none;
  }
  *::-webkit-scrollbar { display: none; }

  html, body, #root {
    width: 100%;
    height: 100%;
    background: var(--bg);
    color: var(--text);
    font-family: 'DM Sans', sans-serif;
    font-weight: 300;
    overflow: hidden;
  }

  @keyframes spin { to { transform: rotate(360deg); } }
`;

function injectGlobalCSS() {
  if (document.getElementById("riffly-global")) return;
  const style = document.createElement("style");
  style.id = "riffly-global";
  style.textContent = GLOBAL_CSS;
  document.head.appendChild(style);
}

/* ═══════════════════════════════════════
   SPLASH SCREEN
═══════════════════════════════════════ */
function SplashScreen({ onStart }) {
  const [loading, setLoading] = useState(false);

  function handleClick() {
    if (loading) return;
    setLoading(true);
    Tone.start().then(onStart);
  }

  return (
    <div
      onClick={handleClick}
      style={{
        width: "100vw",
        height: "100vh",
        background: "var(--bg)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        position: "relative",
        overflow: "hidden",
        userSelect: "none",
      }}
    >
      {/* ambient glow */}
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%,-50%)",
          width: "40vw",
          height: "40vw",
          background:
            "radial-gradient(ellipse, rgba(126,184,247,0.07) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />

      {/* title */}
      <h1
        style={{
          fontFamily: "'Bebas Neue', cursive",
          fontSize: "clamp(4rem, 12vw, 8rem)",
          letterSpacing: "0.06em",
          lineHeight: 1,
          color: "var(--text)",
          marginBottom: 8,
        }}
      >
        riffly
      </h1>

      {/* tagline */}
      <p
        style={{
          fontFamily: "'DM Mono', monospace",
          fontStyle: "italic",
          fontWeight: 300,
          fontSize: "0.65rem",
          letterSpacing: "0.2em",
          textTransform: "uppercase",
          color: "var(--muted)",
          marginBottom: 56,
        }}
      >
        learn guitar, one riff at a time
      </p>

      {/* play button with rings */}
      <div style={{ position: "relative" }}>
        {/* outer rings */}
        {[0, 10].map((offset, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              inset: -(16 + offset * 1.4),
              borderRadius: "50%",
              border: `1px solid rgba(26,30,40,${0.8 - i * 0.3})`,
              pointerEvents: "none",
            }}
          />
        ))}

        <button
          style={{
            width: 140,
            height: 140,
            borderRadius: "50%",
            background: "var(--surface)",
            border: `1px solid ${loading ? "var(--accent-dim)" : "var(--border)"}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            outline: "none",
            transition: "border-color 0.2s, transform 0.15s",
          }}
        >
          {loading ? (
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                border: "2px solid var(--border)",
                borderTopColor: "var(--accent)",
                animation: "spin 0.8s linear infinite",
              }}
            />
          ) : (
            <svg
              width="38"
              height="38"
              viewBox="0 0 24 24"
              fill="#7eb8f7"
              stroke="none"
              style={{ marginLeft: 6 }}
            >
              <polygon points="5,3 19,12 5,21" />
            </svg>
          )}
        </button>
      </div>

      {/* hint */}
      <p
        style={{
          fontFamily: "'DM Mono', monospace",
          fontWeight: 300,
          fontSize: "0.6rem",
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: loading ? "var(--accent)" : "#2a3040",
          marginTop: 36,
          transition: "color 0.3s",
        }}
      >
        {loading ? "loading riffs..." : "tap to begin"}
      </p>
    </div>
  );
}

/* ═══════════════════════════════════════
   APP
═══════════════════════════════════════ */
export default function App() {
  injectGlobalCSS();

  const [started, setStarted] = useState(false);
  const [riffs, setRiffs] = useState([]);
  const [loading, setLoading] = useState(false);

  const sessionId = useRef(crypto.randomUUID());
  const seen = useRef(new Set());
  const feedRef = useRef(null);
  const lockRef = useRef(false);

  useEffect(() => { if (started) initFeed(); }, [started]);

  async function initFeed() {
    const r1 = await fetchRiff();
    addRiff(r1);
    const r2 = await fetchRiff();
    addRiff(r2);
  }

  async function fetchRiff() {
    const res = await fetch(
      "http://127.0.0.1:8000/next-riff?session_id=" + sessionId.current
    );
    const data = await res.json();

    if (data && typeof data.events === "string") {
      try { data.events = JSON.parse(data.events); } catch { data.events = []; }
    }
    if (data && !Array.isArray(data.events)) data.events = [];

    return data;
  }

  function markViewed(id) {
    if (!id) return;
    fetch("http://127.0.0.1:8000/interact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        riff_id: id,
        interaction_type: "view",
        session_id: sessionId.current,
      }),
    }).catch(() => {});
  }

  function addRiff(riff) {
    if (!riff?.id) return;
    if (seen.current.has(riff.id)) return;
    seen.current.add(riff.id);
    setRiffs((prev) => [...prev, riff]);
    markViewed(riff.id);
  }

  useEffect(() => {
  const feed = feedRef.current;
  if (!feed || !started) return;

  const onScroll = () => {
    if (lockRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = feed;
    const nearBottom = scrollHeight - scrollTop - clientHeight < clientHeight * 0.5;

    if (nearBottom) {
      lockRef.current = true;
      fetchRiff()
        .then((riff) => { addRiff(riff); })
        .catch(console.error)
        .finally(() => { lockRef.current = false; });
    }
  };

  feed.addEventListener("scroll", onScroll);
  return () => feed.removeEventListener("scroll", onScroll);
}, [started]);

  if (!started) {
    return <SplashScreen onStart={() => setStarted(true)} />;
  }

  return (
    <div
      ref={feedRef}
      style={{
        width: "100vw",
        height: "100vh",
        overflowY: "scroll",
        scrollSnapType: "y mandatory",
        background: "var(--bg)",
      }}
    >
      {riffs.map((riff) => (
        <RiffCard key={riff.id} riff={riff} sessionId={sessionId} />
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════
   RIFF CARD
═══════════════════════════════════════ */
function RiffCard({ riff, sessionId }) {
  const [time, setTime] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const [paused, setPaused] = useState(false);

  const startRef = useRef(null);
  const intervalRef = useRef(null);
  const elRef = useRef(null);
  const pausedTimeRef = useRef(0);
  const samplerRef = useRef(null);
  const firedRef = useRef(new Set());

  const PX_PER_BEAT = 90;
  const BPS = (riff.bpm ?? 120) / 60;
  const SPEED = PX_PER_BEAT * BPS;
  const LEAD_IN = 3 / BPS;
  const PLAYHEAD_X = 180;

  const strings = ["e", "B", "G", "D", "A", "E"];
  const stringIndexMap = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5 };
  const height = 320;
  const rowHeight = height / 6;

  const diffColor = getDiffColor(riff.difficulty ?? 2);
  const accent    = rgbStr(diffColor.accent);
  const accentDim = rgbStr(diffColor.accentDim);

  useEffect(() => {
    if (paused) pausedTimeRef.current = time;
  }, [paused, time]);

  useEffect(() => {
    if (!isVisible) { pausedTimeRef.current = 0; setTime(0); }
  }, [isVisible]);

  useEffect(() => {
    if (isVisible) setPaused(false);
  }, [isVisible]);

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => setIsVisible(entry.isIntersecting),
      { threshold: 0.1 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!isVisible || paused) { clearInterval(intervalRef.current); return; }

    const events = riff.events ?? [];
    const lastBeat = events.length
      ? Math.max(...events.map((e) => e.start + e.duration))
      : 4;
    const duration = (lastBeat + 1) / BPS + LEAD_IN;

    startRef.current = performance.now() - pausedTimeRef.current * 1000;
    firedRef.current.clear();

    const resumeTime = pausedTimeRef.current;
    (riff.events ?? []).forEach((n, i) => {
      const startSec = n.start / BPS + LEAD_IN;
      if (startSec < resumeTime) {
        firedRef.current.add(i);
      }
    });

    intervalRef.current = setInterval(() => {
      const raw = (performance.now() - startRef.current) / 1000;
      const t   = raw % duration;

      if (raw > 0 && Math.floor(raw / duration) > Math.floor((raw - 0.016) / duration)) {
        firedRef.current.clear();
      }

      const synth = samplerRef.current;
      if (synth) {
        (riff.events ?? []).forEach((n, i) => {
          const startSec = n.start / BPS + LEAD_IN;
          const durSec = Math.max(n.duration / BPS, 0.05);
          if (t >= startSec && !firedRef.current.has(i)) {
            firedRef.current.add(i);
            Tone.start().then(() => {
              synth.triggerAttackRelease(fretToNote(n.string, n.fret), durSec);
            });
          }
        });
      }

      setTime(t);
    }, 16);

    return () => clearInterval(intervalRef.current);
  }, [isVisible, paused, riff]);

  useEffect(() => {
    const synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "triangle" },
      envelope: {
        attack: 0.005,
        decay: 0.1,
        sustain: 0.3,
        release: 0.8,
      },
    }).toDestination();
    samplerRef.current = synth;
    return () => { synth.dispose(); samplerRef.current = null; };
  }, []);

  const metaItems = [
    riff.key && `Key of ${riff.key}`,
    riff.bpm && `${riff.bpm} BPM`,
    riff.difficulty,
  ].filter(Boolean);

  return (
    <div
      ref={elRef}
      className="riff-card"
      onClick={() => { Tone.start(); setPaused((p) => !p); }}
      style={{
        width: "100vw",
        height: "100vh",
        scrollSnapAlign: "start",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "0 10vw",
        borderBottom: "1px solid var(--border)",
        position: "relative",
        overflow: "hidden",
        userSelect: "none",
        cursor: "pointer",
      }}
    >
      {/* ambient glow */}
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "8vw",
          transform: "translateY(-50%)",
          width: "40vw",
          height: "50vh",
          background:
            "radial-gradient(ellipse, rgba(126,184,247,0.04) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />

      {/* title */}
      <h2
        style={{
          fontFamily: "'Bebas Neue', cursive",
          fontSize: "clamp(2.8rem, 6vw, 5rem)",
          letterSpacing: "0.04em",
          lineHeight: 0.95,
          color: "var(--text)",
          marginBottom: "0.75rem",
        }}
      >
        {riff.title}
      </h2>

      {/* meta */}
      {metaItems.length > 0 && (
        <div
          style={{
            fontSize: "0.7rem",
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: accent,
            marginBottom: "1.5rem",
            display: "flex",
            gap: "1.5rem",
            fontFamily: "'DM Sans', sans-serif",
          }}
        >
          {metaItems.map((item, i) => (
            <span key={i} style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
              {i > 0 && (
                <span
                  style={{
                    width: 4,
                    height: 4,
                    borderRadius: "50%",
                    background: accentDim,
                    display: "inline-block",
                  }}
                />
              )}
              {item}
            </span>
          ))}
        </div>
      )}

      {/* fretboard */}
      <div
        style={{
          position: "relative",
          height,
          background: "var(--surface)",
          borderRadius: 8,
          overflow: "hidden",
          border: "1px solid var(--border)",
          borderLeft: `2px solid ${accentDim}`,
          boxShadow: "0 20px 70px rgba(0,0,0,0.65)",
        }}
      >
        {/* string labels */}
        {strings.map((s, i) => (
          <div
            key={s}
            style={{
              position: "absolute",
              left: 10,
              top: i * rowHeight + rowHeight / 2 - 10,
              fontSize: 12,
              fontFamily: "'DM Mono', monospace",
              fontStyle: "italic",
              color: "var(--muted)",
              fontWeight: 300,
              zIndex: 5,
            }}
          >
            {s}
          </div>
        ))}

        {/* strings */}
        {strings.map((_, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              left: 40,
              right: 0,
              top: i * rowHeight + rowHeight / 2,
              height: [1, 1, 1.5, 2, 2.5, 3][i] * 0.9,
              background:
                "linear-gradient(90deg, rgba(255,255,255,0.04), rgba(255,255,255,0.13), rgba(255,255,255,0.04))",
            }}
          />
        ))}

        {/* playhead */}
        <div
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: PLAYHEAD_X,
            width: 2,
            background: `linear-gradient(to bottom, transparent, ${accent}, transparent)`,
            boxShadow: "0 0 14px rgba(126,184,247,0.6)",
            zIndex: 20,
          }}
        />

        {/* vignette */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            background:
              "radial-gradient(circle at center, transparent 35%, rgba(0,0,0,0.5) 100%)",
            zIndex: 5,
          }}
        />

        {/* pause overlay */}
        {paused && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 30,
              background: "rgba(9,9,12,0.35)",
            }}
          >
            <div
              style={{
                fontSize: "0.65rem",
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                color: accent,
                fontFamily: "'DM Sans', sans-serif",
                background: "var(--surface)",
                border: "1px solid var(--border)",
                padding: "6px 14px",
                borderRadius: 4,
              }}
            >
              Paused
            </div>
          </div>
        )}

        {/* notes */}
        {(riff.events ?? []).map((n, idx) => {
          const startSec = n.start / BPS;
          const durSec   = n.duration / BPS;
          const worldX   = n.start * PX_PER_BEAT;
          const x = worldX - (time - LEAD_IN) * SPEED + PLAYHEAD_X;
          const rowIndex =
            typeof n.string === "number"
              ? stringIndexMap[n.string]
              : strings.findIndex((s) => s === n.string);
          const y = rowIndex * rowHeight + rowHeight / 2 - 13;
          const active =
            time >= startSec + LEAD_IN &&
            time <= startSec + durSec + LEAD_IN;

          return (
            <div
              key={idx}
              style={{
                position: "absolute",
                left: x,
                top: y,
                width: Math.max(n.duration * PX_PER_BEAT, 22),
                height: 26,
                background: active
                  ? `linear-gradient(135deg, ${accent}, #4a9fe8)`
                  : "rgba(220,228,240,0.88)",
                boxShadow: active
                  ? "0 0 16px rgba(126,184,247,0.5)"
                  : "0 2px 8px rgba(0,0,0,0.4)",
                borderRadius: 6,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 11,
                fontFamily: "'DM Mono', monospace",
                fontWeight: 400,
                color: "#09090c",
                transform: active ? "scale(1.06)" : "scale(1)",
                transition: "transform 80ms linear, box-shadow 120ms ease",
                zIndex: 10,
              }}
            >
              {n.fret}
              {n.technique === "hammer-on" && (
                <div
                  style={{
                    position: "absolute",
                    top: -17,
                    fontSize: 9,
                    fontFamily: "'DM Mono', monospace",
                    color: accent,
                    letterSpacing: "0.05em",
                    textTransform: "uppercase",
                  }}
                >
                  H
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* action buttons */}
      <div style={{ display: "flex", gap: "1rem", marginTop: "1.5rem" }}>
        <ActionButton
          riff={riff}
          sessionId={sessionId}
          type="like"
          label="Like"
          activeLabel="Liked"
          accent={accent}
          accentDim={accentDim}
          icon={<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />}
        />
        <ActionButton
          riff={riff}
          sessionId={sessionId}
          type="save"
          label="Save"
          activeLabel="Saved"
          accent={accent}
          accentDim={accentDim}
          icon={<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />}
        />
      </div>
    </div>
  );
}

/* ═══ ACTION BUTTON ═══ */
function ActionButton({ riff, sessionId, type, label, activeLabel, icon, accent, accentDim }) {
  const [active, setActive] = useState(false);

  function handleClick(e) {
    e.stopPropagation();
    const next = !active;
    setActive(next);
    fetch("http://127.0.0.1:8000/interact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        riff_id: riff.id,
        interaction_type: next ? type : `un${type}`,
        session_id: sessionId.current,
      }),
    }).catch(() => {});
  }

  return (
    <button
      onClick={handleClick}
      style={{
        padding: 0,
        background: "none",
        border: "none",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: "0.6rem",
        color: active ? accent : "var(--muted)",
        fontFamily: "'DM Sans', sans-serif",
        fontSize: "0.75rem",
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        transition: "color 0.2s",
        width: "fit-content",
      }}
    >
      <span
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 28,
          height: 28,
          border: `1px solid ${active ? accentDim : "var(--border)"}`,
          borderRadius: "50%",
          background: "var(--surface)",
          transition: "border-color 0.2s",
          flexShrink: 0,
        }}
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill={active ? accent : "none"}
          stroke={active ? accent : "#4a5260"}
          strokeWidth="1.5"
          style={{ transition: "fill 0.2s, stroke 0.2s" }}
        >
          {icon}
        </svg>
      </span>
      {active ? activeLabel : label}
    </button>
  );
}
