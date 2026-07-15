/**
 * Riffly — single-page TikTok-style feed for learning guitar riffs.
 *
 * High-level structure:
 *   - Splash screen -> starts Tone.js audio context on user tap.
 *   - App: owns the vertically-scrolling feed of RiffCards, prefetches the
 *     next recommended riff as the user nears the end, and caps how many
 *     cards stay mounted in the DOM (see KEEP_BEHIND in the scroll handler).
 *   - RiffCard: renders one riff's scrolling tab notation, schedules its
 *     note audio, and reports view-duration + like/save interactions to
 *     the backend.
 *   - SavedPanel / SettingsPanel: slide-in overlays for saved riffs and
 *     resetting the recommender's history.
 *
 * Identity/persistence:
 *   - Each browser gets a UUID session token stored in a cookie
 *     (getOrCreateSessionId), used to scope all interactions server-side.
 *   - "Seen" riff IDs and cached like/save state are also mirrored to
 *     localStorage so the UI feels instant and survives refreshes even if
 *     the backend request hasn't resolved yet. Both are namespaced per
 *     session ID so a reset (new session) never leaks stale state from
 *     the previous session.
 */

import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import * as Tone from "tone";

/**
 * API base URL. Set VITE_API_URL in the environment (e.g. a Railway
 * variable pointing at the deployed backend's public domain) for
 * production/staging builds. Falls back to the local FastAPI dev server
 * so `npm run dev` still works untouched.
 */
const API_BASE = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

// MIDI note number of each string's open (unfretted) pitch, standard tuning.
const OPEN_NOTES = { 1: 64, 2: 59, 3: 55, 4: 50, 5: 45, 6: 40 };

/** Convert a MIDI note number (e.g. 64) to a note name + octave (e.g. "E4"). */
function midiToNoteName(midi) {
  const names = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
  const octave = Math.floor(midi / 12) - 1;
  return names[midi % 12] + octave;
}

/** Resolve a (string, fret) tab position to a playable note name for the synth. */
function fretToNote(string, fret) {
  const open = OPEN_NOTES[string] ?? 40;
  return midiToNoteName(open + fret);
}

// Accent color pair per difficulty level (1-5), used to tint each card's
// playhead, active-note glow, and buttons. Levels 1-2 share a color since
// they're both "beginner"; difficulty rises from blue -> purple -> red.
const DIFF_COLORS = {
  1: { accent: [126, 184, 247], accentDim: [42,  80, 128] },
  2: { accent: [126, 184, 247], accentDim: [42,  80, 128] },
  3: { accent: [167, 130, 255], accentDim: [72,  40, 140] },
  4: { accent: [255, 110,  80], accentDim: [130, 35,  10] },
  5: { accent: [220,  70, 100], accentDim: [110, 20,  40] },
};

/** Look up a difficulty's color pair, defaulting to level 2 if unset/unknown. */
function getDiffColor(difficulty) {
  return DIFF_COLORS[difficulty] ?? DIFF_COLORS[2];
}

/** Format an [r,g,b] array as a CSS rgb() string. */
function rgbStr(rgb) {
  return `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
}

/**
 * Normalize a riff object fetched from the API so `events` is always a
 * real array on the frontend, regardless of whether the backend sent it
 * as a JSON string (e.g. straight from a text column) or already-parsed JSON.
 */
function normalizeRiff(data) {
  if (!data) return data;
  if (typeof data.events === "string") {
    try { data.events = JSON.parse(data.events); } catch { data.events = []; }
  }
  if (!Array.isArray(data.events)) data.events = [];
  return data;
}


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
    box-sizing: border-box; margin: 0; padding: 0;
    scrollbar-width: none; -ms-overflow-style: none;
  }
  *::-webkit-scrollbar { display: none; }

  html, body, #root {
    width: 100%; height: 100%;
    background: var(--bg); color: var(--text);
    font-family: 'DM Sans', sans-serif; font-weight: 300;
    overflow: hidden;
  }

  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
  @keyframes slideOut { from { transform: translateX(0); } to { transform: translateX(100%); } }

  .riffly-slider {
    -webkit-appearance: none; appearance: none;
    background: transparent; cursor: pointer; outline: none;
    display: block; width: 100%; height: 100%;
    margin: 0; padding: 0; position: absolute; left: 0; top: 0;
  }
  .riffly-slider::-webkit-slider-thumb {
    -webkit-appearance: none; appearance: none;
    width: 14px; height: 14px; border-radius: 50%;
    background: var(--text); border: 2px solid var(--bg);
    margin-top: -5px; box-shadow: 0 0 0 1px var(--accent-dim);
    transition: transform 0.1s, box-shadow 0.1s;
    position: relative; z-index: 2;
  }
  .riffly-slider::-webkit-slider-thumb:hover {
    transform: scale(1.2); box-shadow: 0 0 0 2px var(--accent);
  }
  .riffly-slider::-moz-range-thumb {
    width: 14px; height: 14px; border-radius: 50%;
    background: var(--text); border: 2px solid var(--bg);
    box-shadow: 0 0 0 1px var(--accent-dim);
  }
  .riffly-slider::-webkit-slider-runnable-track {
    height: 4px; border-radius: 2px; background: transparent;
  }
  .riffly-slider::-moz-range-track {
    height: 4px; border-radius: 2px; background: transparent;
  }
`;

/* ═══════════════════════════════════════
   SESSION ID
   Identity is a UUID stored in a long-lived cookie, no login required.
   getOrCreateSessionId() is the only entry point callers should use.
═══════════════════════════════════════ */
const SESSION_COOKIE = "riffly_session_id";
const COOKIE_DAYS    = 365;

function getCookie(name) {
  const match = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
  return match ? decodeURIComponent(match[1]) : null;
}

function setCookie(name, value, days) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = name + "=" + encodeURIComponent(value) + "; expires=" + expires + "; path=/; SameSite=Lax";
}

function deleteCookie(name) {
  document.cookie = name + "=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
}

/** Read the persistent session UUID from its cookie, creating and storing a fresh one on first visit. */
function getOrCreateSessionId() {
  const existing = getCookie(SESSION_COOKIE);
  if (existing) return existing;
  const fresh = crypto.randomUUID();
  setCookie(SESSION_COOKIE, fresh, COOKIE_DAYS);
  return fresh;
}

/* ═══════════════════════════════════════
   SEEN RIFFS
   Tracks which riff IDs this session has already been shown, persisted to
   localStorage (keyed by session) so a page refresh doesn't repeat riffs.
   Sent to the backend as the `exclude` param on GET /next-riff.
═══════════════════════════════════════ */
function seenStorageKey(sessionId) {
  return `riffly_seen_${sessionId}`;
}

/** Load this session's seen-riff-ID set from localStorage (empty set if none/corrupt). */
function loadSeenFromStorage(sessionId) {
  try {
    const raw = localStorage.getItem(seenStorageKey(sessionId));
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch { return new Set(); }
}

/** Mark a riff ID as seen, both in the in-memory ref and in localStorage. */
function seenAdd(seen, sessionId, id) {
  seen.current.add(id);
  try {
    localStorage.setItem(seenStorageKey(sessionId), JSON.stringify([...seen.current]));
  } catch {}
}

/** Clear the seen-riff set, e.g. after all riffs have been shown or on a full feed reset. */
function seenClear(seen, sessionId) {
  seen.current.clear();
  try {
    localStorage.removeItem(seenStorageKey(sessionId));
  } catch {}
}

/* ═══════════════════════════════════════
   LOCAL INTERACTION CACHE
   Mirrors each riff's like/save state in localStorage so ActionButton can
   render the correct state instantly on mount, and stays correct even if
   the backend is temporarily unreachable or the page is refreshed before
   the reconciling fetch (see ActionButton) completes.

   Namespaced per session ID (same pattern as the seen-riff set above) so
   that resetting the feed — which spins up a brand-new session — can't
   read back a *previous* session's liked/saved flags out of localStorage.
   Before this was namespaced, ActionButton would briefly (or, if the
   backend reconcile call failed, permanently) show stale like/save state
   from before the reset.
═══════════════════════════════════════ */
function interactionsStorageKey(sessionId) {
  return `riffly_interactions_${sessionId}`;
}

function loadInteractionsCache(sessionId) {
  try {
    const raw = localStorage.getItem(interactionsStorageKey(sessionId));
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveInteractionsCache(sessionId, cache) {
  try {
    localStorage.setItem(interactionsStorageKey(sessionId), JSON.stringify(cache));
  } catch {}
}

/** Read a riff's cached like/save flag, or null if nothing's cached yet. */
function getCachedInteraction(sessionId, riffId, type) {
  const cache = loadInteractionsCache(sessionId);
  return cache[riffId]?.[type] ?? null;
}

/** Write a riff's like/save flag to the local cache immediately (optimistic UI). */
function setCachedInteraction(sessionId, riffId, type, value) {
  const cache = loadInteractionsCache(sessionId);
  if (!cache[riffId]) cache[riffId] = {};
  cache[riffId][type] = value;
  saveInteractionsCache(sessionId, cache);
}

/** Inject the app's global stylesheet once (idempotent — safe to call on every render). */
function injectGlobalCSS() {
  if (document.getElementById("riffly-global")) return;
  const style = document.createElement("style");
  style.id = "riffly-global";
  style.textContent = GLOBAL_CSS;
  document.head.appendChild(style);
}

/* ═══════════════════════════════════════
   GLOBAL SHARED SYNTH
   One shared PolySynth handles all normal note playback across cards.
═══════════════════════════════════════ */
let globalSynth = null;

/** Lazily create (once) and return the shared PolySynth used for normal note playback. */
function getGlobalSynth() {
  if (!globalSynth) {
    globalSynth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "triangle" },
      envelope: { attack: 0.005, decay: 0.1, sustain: 0.3, release: 0.8 },
    }).toDestination();
  }
  return globalSynth;
}

/**
 * Play one silent note through the shared synth so the AudioContext and
 * its worklets are fully initialized before the first real note fires.
 * Must be called once, synchronously in response to the user's splash tap
 * (browsers require a user gesture to start audio).
 */
function warmUpSynth() {
  const synth = getGlobalSynth();
  const saved = Tone.getDestination().volume.value;
  Tone.getDestination().volume.value = -Infinity;
  synth.triggerAttackRelease("E2", 0.01, Tone.now() + 0.05);
  // restore volume after the silent note has definitely finished
  setTimeout(() => {
    Tone.getDestination().volume.value = saved;
  }, 300);
}

/* ═══════════════════════════════════════
   BEND HELPERS
═══════════════════════════════════════ */

/** Convert a bend fraction (e.g. 0.5 = half-step, 1 = full-step) to semitones for detuning. */
function bendAmountToSemitones(bendAmount) {
  return (bendAmount ?? 1) * 2;
}

/** Format a bend amount as the short label shown on the tab (e.g. "1/2", "full"). */
function getBendLabel(bendAmount) {
  const amt = bendAmount ?? 1;
  if (amt === 0.25) return "1/4";
  if (amt === 0.5)  return "1/2";
  if (amt === 1)    return "full";
  if (amt === 1.5)  return "1\u00bd";
  if (amt === 2)    return "2";
  return `${amt}`;
}

/* BEND AUDIO — dedicated per-note synth
   The shared globalSynth is a PolySynth. Detuning
   `synth.voices` (as a naive implementation might) bends
   *every currently sounding voice*, not just the note being
   bent — so a ringing open string gets yanked out of tune
   whenever a bend fires elsewhere in the riff.
   Instead, spin up a short-lived monophonic Tone.Synth just
   for the bent note, ramp its detune, and dispose it once
   the note has fully released. It still routes through
   toDestination(), so it responds to the same master volume
   control as everything else. */
function triggerBend(note, durSec, when, semitones) {
  const bendSynth = new Tone.Synth({
    oscillator: { type: "triangle" },
    envelope: { attack: 0.005, decay: 0.1, sustain: 0.3, release: 0.8 },
  }).toDestination();

  bendSynth.triggerAttackRelease(note, durSec, when);

  try {
    bendSynth.detune.cancelScheduledValues(when);
    bendSynth.detune.setValueAtTime(0, when);
    bendSynth.detune.linearRampToValueAtTime(semitones * 100, when + durSec * 0.6);
    bendSynth.detune.setValueAtTime(0, when + durSec + 0.02);
  } catch (_) {}

  // Dispose once the release tail has finished so we don't leak nodes.
  const releaseSec = 0.8; // matches envelope.release above
  const disposeInMs = Math.max(0, (when - Tone.now() + durSec + releaseSec + 0.2) * 1000);
  setTimeout(() => { try { bendSynth.dispose(); } catch (_) {} }, disposeInMs);
}

/* ═══════════════════════════════════════
   SPLASH
═══════════════════════════════════════ */
/** Full-screen intro tap target. Starting audio requires a user gesture in
 * the browser, so this is also where Tone.js gets started and warmed up
 * before the feed (and its autoplaying audio) is shown. */
function SplashScreen({ onStart }) {
  const [loading, setLoading] = useState(false);

  function handleClick() {
    if (loading) return;
    setLoading(true);
    // Start the audio context, then immediately warm up the synth with a
    // silent note before handing off to the feed.
    Tone.start().then(() => {
      warmUpSynth();
      onStart();
    });
  }

  return (
    <div
      onClick={handleClick}
      style={{
        width: "100vw", height: "100vh", background: "var(--bg)",
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", cursor: "pointer", position: "relative",
        overflow: "hidden", userSelect: "none",
      }}
    >
      <div style={{
        position: "absolute", top: "50%", left: "50%",
        transform: "translate(-50%,-50%)", width: "40vw", height: "40vw",
        background: "radial-gradient(ellipse, rgba(126,184,247,0.07) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />
      <h1 style={{
        fontFamily: "'Bebas Neue', cursive",
        fontSize: "clamp(4rem, 12vw, 8rem)",
        letterSpacing: "0.06em", lineHeight: 1, color: "var(--text)", marginBottom: 8,
      }}>riffly</h1>
      <p style={{
        fontFamily: "'DM Mono', monospace", fontStyle: "italic", fontWeight: 300,
        fontSize: "0.65rem", letterSpacing: "0.2em", textTransform: "uppercase",
        color: "var(--muted)", marginBottom: 56,
      }}>learn guitar, one riff at a time</p>
      <div style={{ position: "relative" }}>
        {[0, 10].map((_, i) => (
          <div key={i} style={{
            position: "absolute", inset: -(16 + i * 14), borderRadius: "50%",
            border: `1px solid rgba(26,30,40,${0.8 - i * 0.3})`, pointerEvents: "none",
          }} />
        ))}
        <button style={{
          width: 140, height: 140, borderRadius: "50%", background: "var(--surface)",
          border: `1px solid ${loading ? "var(--accent-dim)" : "var(--border)"}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          cursor: "pointer", outline: "none", transition: "border-color 0.2s",
        }}>
          {loading ? (
            <div style={{
              width: 28, height: 28, borderRadius: "50%",
              border: "2px solid var(--border)", borderTopColor: "var(--accent)",
              animation: "spin 0.8s linear infinite",
            }} />
          ) : (
            <svg width="38" height="38" viewBox="0 0 24 24" fill="#7eb8f7" stroke="none" style={{ marginLeft: 6 }}>
              <polygon points="5,3 19,12 5,21" />
            </svg>
          )}
        </button>
      </div>
      <p style={{
        fontFamily: "'DM Mono', monospace", fontWeight: 300, fontSize: "0.6rem",
        letterSpacing: "0.18em", textTransform: "uppercase",
        color: loading ? "var(--accent)" : "#2a3040", marginTop: 36, transition: "color 0.3s",
      }}>
        {loading ? "loading riffs..." : "tap to begin"}
      </p>
    </div>
  );
}

/* ═══════════════════════════════════════
   SAVED PANEL
═══════════════════════════════════════ */
/** Slide-in overlay listing every riff this session has saved (GET
 * /saved-riffs), rendered with the same RiffCard used in the main feed.
 * Finite/scrollable — no pagination or further recommendations here. */
function SavedPanel({ sessionId, closing, volume, setVolume }) {
  const [riffs,  setRiffs]  = useState([]);
  const [status, setStatus] = useState("loading");

  useEffect(() => {
    setStatus("loading");
    fetch(`${API_BASE}/saved-riffs?session_id=${sessionId.current}`)
      .then(r => r.json())
      .then(data => {
        if (!Array.isArray(data) || data.length === 0) { setStatus("empty"); return; }
        setRiffs(data.map(normalizeRiff));
        setStatus("ok");
      })
      .catch(() => setStatus("empty"));
  }, []);

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 200,
      background: "var(--bg)", animation: `${closing ? "slideOut" : "slideIn"} 0.28s cubic-bezier(0.32,0,0.18,1)`,
    }}>
      {status === "loading" && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh" }}>
          <div style={{
            width: 28, height: 28, borderRadius: "50%",
            border: "2px solid var(--border)", borderTopColor: "var(--accent)",
            animation: "spin 0.8s linear infinite",
          }} />
        </div>
      )}
      {status === "empty" && (
        <div style={{
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", height: "100vh", gap: "1rem",
        }}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none"
            stroke="var(--muted)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
          </svg>
          <p style={{
            fontFamily: "'DM Mono', monospace", fontStyle: "italic",
            fontSize: "0.65rem", letterSpacing: "0.18em", textTransform: "uppercase",
            color: "var(--muted)",
          }}>no saved riffs yet</p>
        </div>
      )}
      {status === "ok" && (
        <div style={{ width: "100%", height: "100vh", overflowY: "scroll", scrollSnapType: "y mandatory" }}>
          {riffs.map(riff => (
            <RiffCard key={riff.id} riff={riff} sessionId={sessionId} volume={volume} setVolume={setVolume} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════
   BPM SLIDER
═══════════════════════════════════════ */
/** Tempo slider for a riff card. Snaps back to the riff's original BPM
 * whenever the dragged value comes within SNAP_ZONE, so it's easy to
 * return to the intended tempo after experimenting. */
function BpmSlider({ bpm, originalBpm, onChange, accent, accentDim }) {
  const MIN = 40, MAX = 220, SNAP_ZONE = 3, TRACK_W = 110;
  const fillPct = ((bpm - MIN) / (MAX - MIN)) * 100;
  const origPct = ((originalBpm - MIN) / (MAX - MIN)) * 100;
  const atOrig  = bpm === originalBpm;

  function handleChange(e) {
    let v = Number(e.target.value);
    if (Math.abs(v - originalBpm) <= SNAP_ZONE) v = originalBpm;
    onChange(v);
  }

  return (
    <div
      style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexShrink: 0 }}
      onClick={e => e.stopPropagation()}
      onMouseDown={e => e.stopPropagation()}
      onTouchStart={e => e.stopPropagation()}
    >
      <span style={{
        fontFamily: "'DM Mono', monospace",
        fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase",
        color: atOrig ? accent : "var(--muted)", transition: "color 0.15s",
        width: 68, flexShrink: 0, display: "inline-block", whiteSpace: "nowrap",
      }}>
        {bpm} bpm
      </span>
      <div style={{ position: "relative", width: TRACK_W, height: 20, flexShrink: 0 }}>
        <div style={{
          position: "absolute", left: 0, top: "50%", transform: "translateY(-50%)",
          width: TRACK_W, height: 4, borderRadius: 2, background: "var(--border)",
          pointerEvents: "none",
        }} />
        <div style={{
          position: "absolute", left: 0, top: "50%", transform: "translateY(-50%)",
          width: `${fillPct}%`, height: 4, borderRadius: 2,
          background: atOrig ? accent : accentDim,
          pointerEvents: "none", transition: "background 0.15s",
        }} />
        <div style={{
          position: "absolute", left: `${origPct}%`, top: "50%",
          transform: "translate(-50%, -50%)",
          width: 2, height: 12, borderRadius: 1,
          background: atOrig ? accent : "rgba(126,184,247,0.3)",
          pointerEvents: "none", transition: "background 0.15s",
        }} />
        <input type="range" min={MIN} max={MAX} step={1} value={bpm}
          onChange={handleChange} className="riffly-slider" />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════
   VOLUME SLIDER
═══════════════════════════════════════ */
/** Master volume slider for a riff card; icon reflects mute/low/high state. */
function VolumeSlider({ volume, onChange, accent }) {
  return (
    <div
      style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexShrink: 0 }}
      onClick={e => e.stopPropagation()}
      onMouseDown={e => e.stopPropagation()}
      onTouchStart={e => e.stopPropagation()}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
        stroke={volume === 0 ? "var(--muted)" : accent}
        strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
        style={{ flexShrink: 0 }}>
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
        {volume > 0  && <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />}
        {volume > 50 && <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />}
      </svg>
      <div style={{ position: "relative", width: 80, height: 20, flexShrink: 0 }}>
        <div style={{
          position: "absolute", left: 0, top: "50%", transform: "translateY(-50%)",
          width: 80, height: 4, borderRadius: 2, background: "var(--border)",
          pointerEvents: "none",
        }} />
        <div style={{
          position: "absolute", left: 0, top: "50%", transform: "translateY(-50%)",
          width: `${volume}%`, height: 4, borderRadius: 2,
          background: accent, pointerEvents: "none",
        }} />
        <input type="range" min={0} max={100} step={1} value={volume}
          onChange={e => onChange(Number(e.target.value))} className="riffly-slider" />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════
   APP
   Top-level component: owns the scrollable feed, the saved/settings
   overlays, and the DOM-cap + prefetch logic that keeps the feed going.
═══════════════════════════════════════ */

export default function App() {
  injectGlobalCSS();

  const [started,         setStarted]         = useState(false);
  const [savedVisible,    setSavedVisible]     = useState(false);
  const [savedClosing,    setSavedClosing]     = useState(false);
  const [settingsVisible, setSettingsVisible]  = useState(false);
  const [settingsClosing, setSettingsClosing]  = useState(false);

  const [riffs,        setRiffs]        = useState([]);
  const currentIndexRef = useRef(0);
  const riffsLenRef    = useRef(0);

  function openSaved()  { setSavedVisible(true);  setSavedClosing(false); }
  function closeSaved() {
    setSavedClosing(true);
    setTimeout(() => { setSavedVisible(false); setSavedClosing(false); }, 280);
  }
  function openSettings()  { setSettingsVisible(true);  setSettingsClosing(false); }
  function closeSettings() {
    setSettingsClosing(true);
    setTimeout(() => { setSettingsVisible(false); setSettingsClosing(false); }, 280);
  }
  function handleReset() {
    seenClear(seen, sessionId.current);
    deleteCookie(SESSION_COOKIE);
    const newId = getOrCreateSessionId();
    sessionId.current = newId;
    setRiffs([]);
    currentIndexRef.current = 0;
    riffsLenRef.current = 0;
    closeSettings();
    setTimeout(() => initFeed(), 300);
  }

  const [volume, setVolumeState] = useState(15);
  function setVolume(v) {
    setVolumeState(v);
    Tone.getDestination().volume.value = v === 0 ? -Infinity : 20 * Math.log10(v / 100);
  }

  const sessionId = useRef(getOrCreateSessionId());
  const seen      = useRef(loadSeenFromStorage(sessionId.current));
  const feedRef   = useRef(null);
  const lockRef   = useRef(false);

  useEffect(() => { if (started) initFeed(); }, [started]);

  /** Prefetch the first two riffs on start so the feed never opens empty. */
  async function initFeed() {
    const r1 = await fetchRiff(); if (r1) addRiff(r1);
    const r2 = await fetchRiff(); if (r2) addRiff(r2);
  }

  /**
   * Ask the backend for the next recommended riff, excluding everything
   * this session has already seen. If every riff has been seen, clear the
   * seen-set and retry once so the feed can start recycling riffs instead
   * of dead-ending.
   *
   * NOTE: the backend now ALSO excludes every riff this session has a
   * 'view' Interaction for, independent of what we send in `exclude`
   * (see /next-riff docstring). That's a deliberate belt-and-suspenders
   * fix for a cleared/corrupted localStorage `seen` set — but it does
   * mean the client-side reset below can't force riffs to recycle by
   * itself anymore; the server will keep excluding them regardless.
   * True recycling would need a server-side "forget my view history"
   * action, which doesn't exist yet.
   */
  async function fetchRiff() {
  try {
    const excludeParam = [...seen.current].join(",");
    const res  = await fetch(`${API_BASE}/next-riff?session_id=${sessionId.current}&exclude=${excludeParam}`);
    const data = await res.json();

    if (data?.message === "no new riffs") {
      seenClear(seen, sessionId.current);
      const res2  = await fetch(`${API_BASE}/next-riff?session_id=${sessionId.current}&exclude=&recycle=true`);
      const data2 = await res2.json();
      if (!data2?.id) return null;
      return normalizeRiff(data2);
    }
    if (!data?.id) return null;
    return normalizeRiff(data);
  } catch (err) {
    console.error("fetchRiff failed:", err);
    return null;
  }
}

  // NOTE: "view" interactions are no longer fired here. Firing them the
  // instant a riff is prefetched sent duration_ms=null every time, which
  // meant the backend's view_completion_score (how much of a riff the
  // user actually watched) was always 0 — a completely dead signal.
  // RiffCard now tracks real on-screen time via IntersectionObserver and
  // reports the actual watched duration once a card leaves the viewport
  // (see sendViewInteraction inside RiffCard below).
  function addRiff(riff) {
    if (!riff?.id) return;
    if (seen.current.has(riff.id)) return;
    seenAdd(seen, sessionId.current, riff.id);
    setRiffs(prev => {
      const next = [...prev, riff];
      riffsLenRef.current = next.length;
      return next;
    });
  }

  useEffect(() => {
    const feed = feedRef.current;
    if (!feed || !started) return;
    const onScrollEnd = () => {
      if (lockRef.current) return;
      const { scrollTop, clientHeight } = feed;
      const idx = Math.round(scrollTop / clientHeight);
      currentIndexRef.current = idx;

      // DOM CAP: keep at most KEEP_BEHIND cards behind the current index,
      // trimming older ones off the front of the array. Combined with the
      // current card and the ~1 card prefetched ahead (see the fetch below),
      // this keeps total mounted cards to roughly KEEP_BEHIND + 2.
      // flushSync removes them from the DOM synchronously, then we
      // immediately shift scrollTop by the same height — all before
      // the browser paints, so the user sees no jump.
      const KEEP_BEHIND = 8;
      const trimCount = Math.max(0, idx - KEEP_BEHIND);
      if (trimCount > 0) {
        flushSync(() => {
          setRiffs(prev => {
            if (prev.length <= trimCount) return prev;
            const next = prev.slice(trimCount);
            riffsLenRef.current = next.length;
            return next;
          });
        });
        // scrollTop correction must happen after flushSync paints the removal
        feed.scrollTop = scrollTop - trimCount * clientHeight;
        currentIndexRef.current = Math.round(feed.scrollTop / clientHeight);
      }

      // Fetch when on second-to-last card or beyond
      if (currentIndexRef.current > riffsLenRef.current - 2) {
        lockRef.current = true;
        fetchRiff()
          .then(r => { if (r) addRiff(r); })
          .catch(console.error)
          .finally(() => { lockRef.current = false; });
      }
    };
    feed.addEventListener("scrollend", onScrollEnd);
    return () => feed.removeEventListener("scrollend", onScrollEnd);
  }, [started]);

  if (!started) return <SplashScreen onStart={() => setStarted(true)} />;

  return (
    <div style={{ width: "100vw", height: "100vh", background: "var(--bg)", position: "relative" }}>
      {/* Saved button */}
      <button
        onClick={savedVisible ? closeSaved : openSaved}
        style={{
          position: "fixed", top: 14, right: 16, zIndex: 220,
          background: "var(--surface)",
          border: `1px solid ${savedVisible ? "var(--accent-dim)" : "var(--border)"}`,
          borderRadius: 20, padding: "6px 14px 6px 10px",
          display: "flex", alignItems: "center", gap: "0.4rem",
          cursor: "pointer", color: savedVisible ? "var(--accent)" : "var(--muted)",
          fontFamily: "'DM Mono', monospace", fontSize: "0.6rem",
          letterSpacing: "0.16em", textTransform: "uppercase",
          transition: "color 0.15s, border-color 0.15s",
        }}
        onMouseEnter={e => { if (!savedVisible) { e.currentTarget.style.color = "var(--accent)"; e.currentTarget.style.borderColor = "var(--accent-dim)"; } }}
        onMouseLeave={e => { if (!savedVisible) { e.currentTarget.style.color = "var(--muted)"; e.currentTarget.style.borderColor = "var(--border)"; } }}
      >
        {savedVisible ? (
          <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>Feed</>
        ) : (
          <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></svg>Saved</>
        )}
      </button>

      {/* Feed */}
      <div ref={feedRef} style={{ width: "100%", height: "100vh", overflowY: "scroll", scrollSnapType: "y mandatory" }}>
        {riffs.map(riff => (
          <RiffCard
            key={riff.id}
            riff={riff}
            sessionId={sessionId}
            volume={volume}
            setVolume={setVolume}
            // Pause playback whenever either overlay is open, not just
            // Saved — otherwise opening Settings while a card is playing
            // left it running (and audible) behind the overlay.
            externalPause={savedVisible || settingsVisible}
          />
        ))}
      </div>

      {savedVisible && <SavedPanel sessionId={sessionId} closing={savedClosing} volume={volume} setVolume={setVolume} />}

      {/* Settings button */}
      <button
        onClick={settingsVisible ? closeSettings : openSettings}
        style={{
          position: "fixed", bottom: 16, right: 16, zIndex: 220,
          background: "var(--surface)",
          border: `1px solid ${settingsVisible ? "var(--accent-dim)" : "var(--border)"}`,
          borderRadius: 20, padding: "6px 14px 6px 10px",
          display: "flex", alignItems: "center", gap: "0.4rem",
          cursor: "pointer", color: settingsVisible ? "var(--accent)" : "var(--muted)",
          fontFamily: "'DM Mono', monospace", fontSize: "0.6rem",
          letterSpacing: "0.16em", textTransform: "uppercase",
          transition: "color 0.15s, border-color 0.15s",
        }}
        onMouseEnter={e => { if (!settingsVisible) { e.currentTarget.style.color = "var(--accent)"; e.currentTarget.style.borderColor = "var(--accent-dim)"; } }}
        onMouseLeave={e => { if (!settingsVisible) { e.currentTarget.style.color = "var(--muted)"; e.currentTarget.style.borderColor = "var(--border)"; } }}
      >
        {settingsVisible ? (
          <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>Feed</>
        ) : (
          <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>Settings</>
        )}
      </button>

      {settingsVisible && <SettingsPanel closing={settingsClosing} onClose={closeSettings} onReset={handleReset} />}
    </div>
  );
}

/* ═══════════════════════════════════════
   SETTINGS PANEL
═══════════════════════════════════════ */
/** Slide-in overlay for resetting the recommender: clears seen-riff history,
 * deletes the session cookie, and starts a fresh session/feed. Requires a
 * two-tap confirmation before actually resetting. */
function SettingsPanel({ closing, onClose, onReset }) {
  const [confirmed, setConfirmed] = useState(false);

  function handleReset() {
    if (!confirmed) { setConfirmed(true); return; }
    onReset();
  }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 200,
      background: "var(--bg)", animation: `${closing ? "slideOut" : "slideIn"} 0.28s cubic-bezier(0.32,0,0.18,1)`,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "2rem",
    }}>
      <h2 style={{ fontFamily: "'Bebas Neue', cursive", fontSize: "2.4rem", letterSpacing: "0.06em", color: "var(--text)" }}>Settings</h2>
      <div style={{
        background: "var(--surface)", border: "1px solid var(--border)",
        borderRadius: 10, padding: "1.5rem 2rem", width: 280,
        display: "flex", flexDirection: "column", gap: "0.75rem",
      }}>
        <p style={{ fontFamily: "'DM Mono', monospace", fontSize: "0.6rem", letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--muted)" }}>Recommendation System</p>
        <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "0.78rem", color: "var(--text)", lineHeight: 1.5, fontWeight: 300 }}>
          {confirmed ? "Are you sure? This will clear your history and start fresh." : "Reset your personalised feed. Riffly will forget your likes and start fresh recommendations."}
        </p>
        <button onClick={handleReset} style={{
          marginTop: "0.25rem", padding: "8px 0", borderRadius: 6,
          background: confirmed ? "rgba(220,70,100,0.15)" : "transparent",
          border: `1px solid ${confirmed ? "rgba(220,70,100,0.6)" : "var(--border)"}`,
          color: confirmed ? "rgb(220,70,100)" : "var(--muted)",
          fontFamily: "'DM Mono', monospace", fontSize: "0.6rem",
          letterSpacing: "0.16em", textTransform: "uppercase",
          cursor: "pointer", transition: "all 0.2s",
        }}>
          {confirmed ? "Confirm reset" : "Reset feed"}
        </button>
        {confirmed && (
          <button onClick={() => setConfirmed(false)} style={{
            padding: "6px 0", borderRadius: 6,
            background: "transparent", border: "1px solid var(--border)",
            color: "var(--muted)", fontFamily: "'DM Mono', monospace",
            fontSize: "0.6rem", letterSpacing: "0.16em", textTransform: "uppercase", cursor: "pointer",
          }}>Cancel</button>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════
   RIFF CARD
   Renders one riff: a scrolling tab strip synced to a setInterval clock,
   scheduling each note's audio via Tone.js as the playhead reaches it.
   Tracks on-screen time via IntersectionObserver and reports it as a
   'view' interaction (with actual dwell duration) once the card leaves
   the viewport, which is what feeds the backend's engagement scoring.
═══════════════════════════════════════ */
const LOOKAHEAD = 0.05;

// Below this, a "view" is almost certainly just a fast scroll-past and
// isn't a meaningful engagement signal — don't bother reporting it.
const MIN_VIEW_MS = 300;

function RiffCard({ riff, sessionId, volume, setVolume, externalPause = false }) {
  const [time,      setTime]      = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const [paused,    setPaused]    = useState(false);
  const [bpm,       setBpm]       = useState(riff.bpm ?? 120);

  const startRef      = useRef(null);
  const intervalRef   = useRef(null);
  const elRef         = useRef(null);
  const pausedTimeRef = useRef(0);
  const firedRef      = useRef(new Set());
  const viewStartRef  = useRef(null);

  const originalBpm = riff.bpm ?? 120;
  const PX_PER_BEAT = 90;
  const BPS         = bpm / 60;
  const SPEED       = PX_PER_BEAT * BPS;
  const LEAD_IN     = 3 / BPS;
  const PLAYHEAD_X  = 180;

  const strings        = ["e", "B", "G", "D", "A", "E"];
  const stringIndexMap = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5 };
  const height         = 320;
  const rowHeight      = height / 6;

  const diffColor = getDiffColor(riff.difficulty ?? 2);
  const accent    = rgbStr(diffColor.accent);
  const accentDim = rgbStr(diffColor.accentDim);

  useEffect(() => {
    Tone.getDestination().volume.value = volume === 0 ? -Infinity : 20 * Math.log10(volume / 100);
  }, [volume]);

  useEffect(() => { if (paused) pausedTimeRef.current = time; }, [paused, time]);

  useEffect(() => {
    if (externalPause) { clearInterval(intervalRef.current); pausedTimeRef.current = time; }
  }, [externalPause]);

  useEffect(() => {
    if (!isVisible) { pausedTimeRef.current = 0; setTime(0); }
  }, [isVisible]);

  useEffect(() => { if (isVisible) setPaused(false); }, [isVisible]);

  /* ── VIEW-DURATION SIGNAL ──────────────────────────────
     Reports how long the user actually kept this card on screen, so the
     backend's view_completion_score has something real to work with.
     (Paused time still counts — pausing to study a riff is engagement,
     not disengagement, and the backend caps the ratio at 1.0 anyway so
     a long pause can't blow the score out of proportion.) */
  function sendViewInteraction(durationMs) {
    if (durationMs < MIN_VIEW_MS) return;
    fetch(`${API_BASE}/interact`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        riff_id: riff.id,
        interaction_type: "view",
        duration_ms: Math.round(durationMs),
        session_id: sessionId.current,
      }),
    }).catch(() => {});
  }

  // Start/stop the clock as the card enters/leaves the viewport, and
  // flush a "view" interaction with the real elapsed time once it leaves.
  useEffect(() => {
    if (isVisible) {
      viewStartRef.current = performance.now();
    } else if (viewStartRef.current != null) {
      const elapsedMs = performance.now() - viewStartRef.current;
      viewStartRef.current = null;
      sendViewInteraction(elapsedMs);
    }
  }, [isVisible]);

  // Catch cards that get unmounted/trimmed from the DOM while still
  // "visible" (e.g. the KEEP_BEHIND trimming in App), so their partial
  // view time isn't silently dropped.
  useEffect(() => {
    return () => {
      if (viewStartRef.current != null) {
        const elapsedMs = performance.now() - viewStartRef.current;
        viewStartRef.current = null;
        sendViewInteraction(elapsedMs);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => setIsVisible(entry.isIntersecting), { threshold: 0.1 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!isVisible || paused || externalPause) { clearInterval(intervalRef.current); return; }

    const events   = riff.events ?? [];
    const lastBeat = events.length ? Math.max(...events.map(e => e.start + e.duration)) : 4;
    const duration = (lastBeat + 1) / BPS + LEAD_IN;

    startRef.current = performance.now() - pausedTimeRef.current * 1000;
    firedRef.current.clear();
    events.forEach((n, i) => {
      if (n.start / BPS + LEAD_IN < pausedTimeRef.current) firedRef.current.add(i);
    });

    intervalRef.current = setInterval(() => {
      const raw = (performance.now() - startRef.current) / 1000;
      const t   = raw % duration;

      if (raw > 0 && Math.floor(raw / duration) > Math.floor((raw - 0.025) / duration)) {
        firedRef.current.clear();
      }

      const synth = getGlobalSynth();

      events.forEach((n, i) => {
        const startSec = n.start / BPS + LEAD_IN;
        const durSec   = Math.max(n.duration / BPS, 0.05);

        if (t + LOOKAHEAD >= startSec && !firedRef.current.has(i)) {
          firedRef.current.add(i);
          const when = Tone.now() + LOOKAHEAD;

          if (n.fret === "x" || n.fret === "X") return;

          if (n.technique === "palm-mute") {
            synth.triggerAttackRelease(fretToNote(n.string, n.fret), Math.min(durSec, 0.08), when);
          } else if (n.technique === "bend") {
            // FIX — bends now play on a dedicated per-note synth (see
            // triggerBend) instead of detuning every voice in the shared
            // PolySynth, so other ringing notes are no longer pulled
            // out of tune by an unrelated bend.
            const semitones = bendAmountToSemitones(n.bendAmount);
            const note = fretToNote(n.string, n.fret);
            triggerBend(note, durSec, when, semitones);
          } else {
            synth.triggerAttackRelease(fretToNote(n.string, n.fret), durSec, when);
          }
        }
      });

      setTime(t);
    }, 25);

    return () => clearInterval(intervalRef.current);
  }, [isVisible, paused, externalPause, riff, BPS, LEAD_IN]);

  const metaItems = [riff.key && `Key of ${riff.key}`, riff.difficulty].filter(Boolean);
  const BADGE = { "hammer-on": "H", "pull-off": "P", "slide": "S", "tap": "T" };

  // ── NOTE WIDTH ──────────────────────────────
  // Width should visually represent each note's actual duration, and
  // back-to-back notes (next.start === this.start + this.duration)
  // should touch with zero gap — no artificial padding between them.
  // The only adjustment is a small legibility floor: at very fast values
  // (32nd notes) duration*PX_PER_BEAT can shrink to just a few pixels,
  // which isn't enough room to render the fret number at all. A little
  // overlap between adjacent notes there is fine — it just needs to stay
  // wide enough that the number is still readable.
  const MIN_NOTE_W = 16;

  const rowIndexOf = (n) => typeof n.string === "number"
    ? stringIndexMap[n.string]
    : strings.findIndex(s => s === n.string);

  function noteWidth(n) {
    return Math.max(n.duration * PX_PER_BEAT, MIN_NOTE_W);
  }

  return (
    <div
      ref={elRef}
      onClick={() => { setPaused(p => !p); }}
      style={{
        width: "100%", height: "100vh", scrollSnapAlign: "start",
        display: "flex", flexDirection: "column", justifyContent: "center",
        padding: "0 10vw", borderBottom: "1px solid var(--border)",
        position: "relative", overflow: "hidden", userSelect: "none", cursor: "pointer",
      }}
    >
      <div style={{
        position: "absolute", top: "50%", left: "8vw", transform: "translateY(-50%)",
        width: "40vw", height: "50vh",
        background: "radial-gradient(ellipse, rgba(126,184,247,0.04) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />

      <h2 style={{
        fontFamily: "'Bebas Neue', cursive",
        fontSize: "clamp(2.8rem, 6vw, 5rem)",
        letterSpacing: "0.04em", lineHeight: 0.95, color: "var(--text)", marginBottom: "0.6rem",
      }}>{riff.title}</h2>

      <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1.2rem", flexWrap: "nowrap", overflow: "visible" }}>
        {metaItems.map((item, i) => (
          <span key={i} style={{ fontSize: "0.7rem", letterSpacing: "0.18em", textTransform: "uppercase", color: accent, fontFamily: "'DM Sans', sans-serif", flexShrink: 0 }}>{item}</span>
        ))}
        {metaItems.length > 0 && <div style={{ width: 1, height: 14, background: "var(--border)", flexShrink: 0 }} />}
        <BpmSlider bpm={bpm} originalBpm={originalBpm} onChange={setBpm} accent={accent} accentDim={accentDim} />
        <div style={{ width: 1, height: 14, background: "var(--border)", flexShrink: 0 }} />
        <VolumeSlider volume={volume} onChange={setVolume} accent={accent} />
      </div>

      {/* fretboard + PM overlay wrapper */}
      <div style={{ position: "relative" }}>

        {/* P.M. bracket overlay */}
        {(() => {
          const pmEvents = (riff.events ?? []).filter(n => n.technique === "palm-mute").slice().sort((a, b) => a.start - b.start);
          if (!pmEvents.length) return null;

          const MAX_SPAN = 4, GAP_THRESH = 0.5;
          const groups = [];
          let cur = null;
          for (const n of pmEvents) {
            const noteEnd = n.start + n.duration;
            if (!cur) {
              cur = { start: n.start, end: noteEnd };
            } else {
              const gap = n.start - cur.end, spanLen = noteEnd - cur.start;
              if (gap > GAP_THRESH || spanLen > MAX_SPAN) { groups.push(cur); cur = { start: n.start, end: noteEnd }; }
              else { cur.end = Math.max(cur.end, noteEnd); }
            }
          }
          if (cur) groups.push(cur);

          const overlayH = 22, LINE_Y = 7, TICK_H = 10, PM_W = 26;
          return (
            <svg style={{ display: "block", width: "100%", height: overlayH, pointerEvents: "none" }} height={overlayH} preserveAspectRatio="none">
              {groups.map((g, i) => {
                const gx    = g.start * PX_PER_BEAT - (time - LEAD_IN) * SPEED + PLAYHEAD_X;
                const gxEnd = g.end   * PX_PER_BEAT - (time - LEAD_IN) * SPEED + PLAYHEAD_X;
                const gw    = gxEnd - gx;
                const active = time >= g.start / BPS + LEAD_IN && time <= g.end / BPS + LEAD_IN;
                const col    = active ? accent : "rgba(126,184,247,0.45)";
                return (
                  <g key={i}>
                    <text x={gx} y={overlayH - 4} fontSize={7} fontFamily="'DM Mono', monospace" fill={col} letterSpacing="0.06em">P.M.</text>
                    {gw > PM_W + 4 && <line x1={gx + PM_W + 3} y1={LINE_Y} x2={gxEnd} y2={LINE_Y} stroke={col} strokeWidth={1.2} strokeLinecap="round" />}
                    <line x1={gxEnd} y1={LINE_Y} x2={gxEnd} y2={LINE_Y + TICK_H} stroke={col} strokeWidth={1.2} strokeLinecap="round" />
                  </g>
                );
              })}
            </svg>
          );
        })()}

        {/* fretboard */}
        <div style={{
          position: "relative", height, background: "var(--surface)", borderRadius: 8,
          overflow: "hidden", border: "1px solid var(--border)", borderLeft: `2px solid ${accentDim}`,
          boxShadow: "0 20px 70px rgba(0,0,0,0.65)",
        }}>
          {strings.map((s, i) => (
            <div key={s} style={{
              position: "absolute", left: 10, top: i * rowHeight + rowHeight / 2 - 10,
              fontSize: 12, fontFamily: "'DM Mono', monospace", fontStyle: "italic",
              color: "var(--muted)", fontWeight: 300, zIndex: 5,
            }}>{s}</div>
          ))}

          {strings.map((_, i) => (
            <div key={i} style={{
              position: "absolute", left: 40, right: 0,
              top: i * rowHeight + rowHeight / 2,
              height: [1.1, 1.1, 1.5, 2, 2.5, 3][i] * 0.9,
              background: "linear-gradient(90deg, rgba(255,255,255,0.04), rgba(255,255,255,0.13), rgba(255,255,255,0.04))",
            }} />
          ))}

          <div style={{
            position: "absolute", top: 0, bottom: 0, left: PLAYHEAD_X, width: 2,
            background: `linear-gradient(to bottom, transparent, ${accent}, transparent)`,
            boxShadow: "0 0 14px rgba(126,184,247,0.6)", zIndex: 20,
          }} />

          <div style={{
            position: "absolute", inset: 0, pointerEvents: "none",
            background: "radial-gradient(circle at center, transparent 35%, rgba(0,0,0,0.5) 100%)",
            zIndex: 5,
          }} />

          {paused && (
            <div style={{
              position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
              zIndex: 30, background: "rgba(9,9,12,0.35)",
            }}>
              <div style={{
                fontSize: "0.65rem", letterSpacing: "0.22em", textTransform: "uppercase",
                color: accent, fontFamily: "'DM Sans', sans-serif",
                background: "var(--surface)", border: "1px solid var(--border)",
                padding: "6px 14px", borderRadius: 4,
              }}>Paused</div>
            </div>
          )}

          {(riff.events ?? []).map((n, idx) => {
            const startSec = n.start / BPS;
            const durSec   = n.duration / BPS;
            const x        = n.start * PX_PER_BEAT - (time - LEAD_IN) * SPEED + PLAYHEAD_X;
            const rowIndex = rowIndexOf(n);
            const y      = rowIndex * rowHeight + rowHeight / 2 - 13;
            const active = time >= startSec + LEAD_IN && time <= startSec + durSec + LEAD_IN;
            const w      = noteWidth(n);
            const noteFontSize = w < 18 ? 8 : w < 26 ? 9 : 11;

            const isMuted    = n.fret === "x" || n.fret === "X";
            const isPalmMute = n.technique === "palm-mute";
            const isBend     = n.technique === "bend";
            const isSlide    = n.technique === "slide";
            const isPullOff  = n.technique === "pull-off";
            const isTap      = n.technique === "tap";
            const badge      = BADGE[n.technique];

            if (isMuted) {
              return (
                <div key={idx} style={{
                  position: "absolute", left: x, top: y,
                  width: w, height: 26,
                  background: active ? `linear-gradient(135deg, ${accent}, #4a9fe8)` : "rgba(220,228,240,0.88)",
                  boxShadow: active ? "0 0 16px rgba(126,184,247,0.5)" : "0 2px 8px rgba(0,0,0,0.4)",
                  borderRadius: 6,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: noteFontSize, fontFamily: "'DM Mono', monospace", fontWeight: 400,
                  color: "#09090c",
                  transform: active ? "scale(1.06)" : "scale(1)",
                  transition: "transform 80ms linear, box-shadow 120ms ease",
                  zIndex: 10,
                }}>x</div>
              );
            }

            if (isPalmMute) {
              return (
                <div key={idx} style={{
                  position: "absolute", left: x, top: y, width: w, height: 26,
                  background: active ? `linear-gradient(135deg, ${accent}, #4a9fe8)` : "rgba(180,220,255,0.72)",
                  boxShadow: active ? `0 0 16px rgba(126,184,247,0.5)` : "0 2px 8px rgba(0,0,0,0.4)",
                  borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: noteFontSize, fontFamily: "'DM Mono', monospace", fontWeight: 400, color: "#09090c",
                  transform: active ? "scale(1.06)" : "scale(1)",
                  transition: "transform 80ms linear, box-shadow 120ms ease", zIndex: 10,
                }}>{n.fret}</div>
              );
            }

            if (isBend) {
              const label = getBendLabel(n.bendAmount);
              const bw    = w;
              const cx    = bw / 2;

              return (
                <div key={idx} style={{
                  position: "absolute", left: x, top: y - 22,
                  width: bw, height: 48, zIndex: 10,
                  display: "flex", flexDirection: "column-reverse",
                  alignItems: "center", justifyContent: "flex-start",
                }}>
                  <div style={{
                    width: bw, height: 26,
                    background: active ? `linear-gradient(135deg, ${accent}, #4a9fe8)` : "rgba(220,228,240,0.88)",
                    boxShadow: active ? `0 0 16px rgba(126,184,247,0.5)` : "0 2px 8px rgba(0,0,0,0.4)",
                    borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: noteFontSize, fontFamily: "'DM Mono', monospace", fontWeight: 400, color: "#09090c",
                    transform: active ? "scale(1.06)" : "scale(1)",
                    transition: "transform 80ms linear, box-shadow 120ms ease", flexShrink: 0,
                  }}>{n.fret}</div>
                  <svg width={bw} height={22} style={{ flexShrink: 0 }}>
                    <line x1={cx} y1={18} x2={cx} y2={7}
                      stroke={active ? accent : "rgba(126,184,247,0.45)"} strokeWidth="1.5" strokeLinecap="round" />
                    <polygon points={`${cx-3},6 ${cx+3},6 ${cx},2`}
                      fill={active ? accent : "rgba(126,184,247,0.45)"} />
                    <text x={cx} y={20} textAnchor="middle"
                      fontSize="7" fontFamily="'DM Mono', monospace"
                      fill={active ? accent : "rgba(126,184,247,0.5)"}
                    >{label}</text>
                  </svg>
                </div>
              );
            }

            return (
              <div key={idx} style={{
                position: "absolute", left: x, top: y, width: w, height: 26,
                background: active
                  ? `linear-gradient(135deg, ${accent}, #4a9fe8)`
                  : isTap     ? "rgba(255,160,120,0.88)"
                  : isSlide   ? "rgba(180,220,255,0.82)"
                  : isPullOff ? "rgba(200,210,255,0.82)"
                  : "rgba(220,228,240,0.88)",
                boxShadow: active ? "0 0 16px rgba(126,184,247,0.5)" : "0 2px 8px rgba(0,0,0,0.4)",
                borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: noteFontSize, fontFamily: "'DM Mono', monospace", fontWeight: 400, color: "#09090c",
                transform: active ? "scale(1.06)" : "scale(1)",
                transition: "transform 80ms linear, box-shadow 120ms ease", zIndex: 10,
              }}>
                {n.fret}
                {badge && (
                  <div style={{
                    position: "absolute", top: -16, left: "50%", transform: "translateX(-50%)",
                    fontSize: 8, fontFamily: "'DM Mono', monospace", fontWeight: 400,
                    color: isTap ? "#ff6e50" : accent,
                    letterSpacing: "0.08em", textTransform: "uppercase", whiteSpace: "nowrap", lineHeight: 1,
                    background: isTap ? "rgba(255,110,80,0.15)" : "transparent",
                    padding: isTap ? "1px 4px" : 0, borderRadius: isTap ? 3 : 0,
                  }}>{badge}</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* action buttons */}
      <div style={{ display: "flex", gap: "1rem", marginTop: "1.5rem" }}>
        <ActionButton riff={riff} sessionId={sessionId} type="like" label="Like" activeLabel="Liked" accent={accent} accentDim={accentDim}
          icon={<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />}
        />
        <ActionButton riff={riff} sessionId={sessionId} type="save" label="Save" activeLabel="Saved" accent={accent} accentDim={accentDim}
          icon={<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />}
        />
      </div>
    </div>
  );
}

/**
 * Like/Save button shown on a riff card. Reads its initial state from the
 * local interaction cache (instant, no flicker), then reconciles with the
 * backend's actual state once that request resolves. Clicking toggles
 * optimistically: the UI and local cache update immediately, and a
 * like/unlike or save/unsave event is POSTed in the background.
 */
function ActionButton({ riff, sessionId, type, label, activeLabel, icon, accent, accentDim }) {
  const flagKey = type === "like" ? "liked" : type === "save" ? "saved" : type;

  // Seed from the local cache first so the button shows the right state
  // instantly; the effect below reconciles with the backend shortly after.
  const [active, setActive] = useState(() => {
    const cached = getCachedInteraction(sessionId.current, riff.id, type);
    return cached !== null ? cached : (riff[flagKey] === true);
  });

  useEffect(() => {
    fetch(`${API_BASE}/interactions?session_id=${sessionId.current}&riff_id=${riff.id}`)
      .then(r => r.json())
      .then(data => {
        if (data[type] === true || data[type] === false) {
          setActive(data[type]);
          setCachedInteraction(sessionId.current, riff.id, type, data[type]);
        }
      })
      .catch(() => {
        // backend unavailable — localStorage cache value is already shown, nothing to do
      });
  }, [riff.id]);

  function handleClick(e) {
    e.stopPropagation();
    const next = !active;
    setActive(next);
    setCachedInteraction(sessionId.current, riff.id, type, next); // write to cache immediately (optimistic)
    fetch(`${API_BASE}/interact`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ riff_id: riff.id, interaction_type: next ? type : `un${type}`, session_id: sessionId.current }),
    }).catch(() => {});
  }

  return (
    <button onClick={handleClick} style={{
      padding: 0, background: "none", border: "none", cursor: "pointer",
      display: "flex", alignItems: "center", gap: "0.6rem",
      color: active ? accent : "var(--muted)", fontFamily: "'DM Sans', sans-serif",
      fontSize: "0.75rem", letterSpacing: "0.12em", textTransform: "uppercase",
      transition: "color 0.2s", width: "fit-content",
    }}>
      <span style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        width: 28, height: 28,
        border: `1px solid ${active ? accentDim : "var(--border)"}`,
        borderRadius: "50%", background: "var(--surface)",
        transition: "border-color 0.2s", flexShrink: 0,
      }}>
        <svg width="13" height="13" viewBox="0 0 24 24"
          fill={active ? accent : "none"} stroke={active ? accent : "#4a5260"}
          strokeWidth="1.5" style={{ transition: "fill 0.2s, stroke 0.2s" }}>
          {icon}
        </svg>
      </span>
      {active ? activeLabel : label}
    </button>
  );
}