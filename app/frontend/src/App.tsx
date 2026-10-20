import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useDeepgramTranscription } from "./hooks/useDeepgramTranscription";
import {
  Activity, ArrowDown, ArrowLeft, ArrowRight, AudioLines, BadgeCheck, BarChart3,
  Bell, BookOpen, BrainCircuit, Check, ChevronDown, CircleHelp, Clock3, Command,
  Headphones, History, LayoutDashboard, Mic, MicOff, MoreHorizontal, Phone,
  PhoneOff, Plus, Search, Settings2, ShieldCheck, Sparkles, Square, Target,
  TrendingUp, Volume2, Waves, X, Zap, Sun, Moon,
} from "lucide-react";

type Stage = { name: string; purpose: string; prompt: string; tip: string };
type TranscriptLine = { id: number; speaker: "You" | "Prospect" | "Voice 1" | "Voice 2" | "Unknown"; text: string; time: string };
type CallRecord = { id: string; prospect: string; company: string; date: string; outcome: string; stage: number; duration: string; transcript?: Array<{ speaker: string; text: string; time?: string }> };
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");
const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL ?? "").replace(/\/$/, "");
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "";
const AUTH_CONFIGURED = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
type AuthSession = { access_token: string; refresh_token?: string; user?: { email?: string } };

const stages: Stage[] = [
  { name: "Opening", purpose: "Earn a few seconds of attention", prompt: "Hi, this is Alex from Dialog. Have I caught you at an okay time for a quick question?", tip: "Be warm, direct, and brief. Avoid launching into a pitch." },
  { name: "Reason for calling", purpose: "Make the relevance clear", prompt: "I'm reaching out because teams like yours are trying to make first conversations more useful and less time-consuming.", tip: "Connect the call to a business problem, not a list of features." },
  { name: "Permission", purpose: "Create a low-pressure next step", prompt: "Would it be alright if I asked two quick questions to see whether this is relevant?", tip: "Ask for a small commitment. Respect a clear no." },
  { name: "Discovery", purpose: "Understand their current situation", prompt: "How are you handling this today, and what's the most frustrating part?", tip: "Ask one question at a time. Let silence do some work." },
  { name: "Problem impact", purpose: "Understand why the problem matters", prompt: "When that happens, what does it usually cost the team in time or missed opportunities?", tip: "Explore impact without putting words in the prospect's mouth." },
  { name: "Value alignment", purpose: "Connect their need to a useful outcome", prompt: "Based on what you've shared, the area that may be most useful is...", tip: "Reflect their own language back to them. Avoid overpromising." },
  { name: "Objection handling", purpose: "Understand and respond to concerns", prompt: "That makes sense. Could I ask what part feels least relevant right now?", tip: "Acknowledge first. Clarify before responding." },
  { name: "Close / next step", purpose: "Agree on a clear outcome", prompt: "Would a short follow-up next week be useful, or is there a better next step?", tip: "Be specific about the next action, owner, and timing." },
];

const initialLines: TranscriptLine[] = [];
const seedHistory: CallRecord[] = [
  {
    id: "demo-1003", prospect: "Jordan Lee", company: "Meridian Software",
    date: "Oct 20, 2026, 10:42 AM", outcome: "Meeting booked", stage: 8, duration: "04:32",
    transcript: [
      { speaker: "You", text: "Thanks for taking a minute. How are you handling onboarding today?", time: "00:18" },
      { speaker: "Prospect", text: "Mostly spreadsheets and a few manual checklists.", time: "00:34" },
      { speaker: "You", text: "Where does that process tend to slow the team down?", time: "01:02" },
      { speaker: "Prospect", text: "New hires keep asking the same setup questions.", time: "01:26" },
      { speaker: "You", text: "A short walkthrough might help. Would Thursday work?", time: "03:48" },
    ],
  },
  {
    id: "demo-1002", prospect: "Priya Shah", company: "Northstar Labs",
    date: "Oct 19, 2026, 3:15 PM", outcome: "Follow-up", stage: 5, duration: "03:08",
    transcript: [
      { speaker: "You", text: "I am calling to understand how your team manages handoffs.", time: "00:12" },
      { speaker: "Prospect", text: "We have a process, but it is not consistent across teams.", time: "00:46" },
      { speaker: "You", text: "What happens when a handoff gets missed?", time: "01:22" },
      { speaker: "Prospect", text: "Usually we lose a day or two chasing context.", time: "02:10" },
    ],
  },
  {
    id: "demo-1001", prospect: "Marcus Chen", company: "Brightpath Systems",
    date: "Oct 17, 2026, 11:05 AM", outcome: "Not interested", stage: 3, duration: "01:41",
    transcript: [
      { speaker: "You", text: "Have I caught you at an okay time for a quick question?", time: "00:08" },
      { speaker: "Prospect", text: "I am in the middle of something. What is this about?", time: "00:19" },
      { speaker: "You", text: "Understood. It may not be relevant right now, so I will keep it brief.", time: "00:34" },
      { speaker: "Prospect", text: "We are not looking at anything like this currently.", time: "01:03" },
    ],
  },
];

function App() {
  const [demoMode, setDemoMode] = useState(() => new URLSearchParams(window.location.search).get("demo") === "1");
  const [authSession, setAuthSession] = useState<AuthSession | null>(() => {
    try {
      const raw = window.localStorage.getItem("dialog-ai-session");
      return raw ? JSON.parse(raw) as AuthSession : null;
    } catch { return null; }
  });
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authMode, setAuthMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authNotice, setAuthNotice] = useState("");
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    try { return window.localStorage.getItem("dialog-ai-theme") === "light" ? "light" : "dark"; }
    catch { return "dark"; }
  });
  const [page, setPage] = useState<"workspace" | "history">("workspace");
  const [stageIndex, setStageIndex] = useState(0);
  const [prospect, setProspect] = useState("");
  const [company, setCompany] = useState("");
  const [callActive, setCallActive] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [audioSource, setAudioSource] = useState<"microphone" | "system" | "both">("both");
  const [listening, setListening] = useState(false);
  const [responseType, setResponseType] = useState("Asked for context");
  const [notes, setNotes] = useState("");
  const [transcript, setTranscript] = useState(initialLines);
  const [interimTranscript, setInterimTranscript] = useState<TranscriptLine | null>(null);
  const [draft, setDraft] = useState("");
  const [coachLoading, setCoachLoading] = useState(false);
  const [suggestion, setSuggestion] = useState("They've offered a one-minute window. Give a concise reason for calling, then ask one focused question.");
  const [history, setHistory] = useState<CallRecord[]>(() => {
    if (!demoMode) return [];
    try {
      const stored = window.localStorage.getItem("dialog-ai-demo-history");
      return stored ? JSON.parse(stored) as CallRecord[] : seedHistory;
    } catch {
      return seedHistory;
    }
  });
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [showEnd, setShowEnd] = useState(false);
  const [outcome, setOutcome] = useState("Meeting booked");
  const [toast, setToast] = useState("");
  const [search, setSearch] = useState("");
  const transcriptRef = useRef<HTMLDivElement>(null);
  const callStartedAtRef = useRef<number | null>(null);
  const [selectedCall, setSelectedCall] = useState<CallRecord | null>(null);
  const transcription = useDeepgramTranscription({ audioSource, onSegment: (segment) => {
    const line: TranscriptLine = {
      id: Date.now(),
      speaker: segment.speaker,
      text: segment.text,
      time: new Date(segment.receivedAt).toLocaleTimeString([], { minute: "2-digit", second: "2-digit" }),
    };
    if (segment.isFinal) {
      setTranscript((lines) => [...lines, line]);
      setInterimTranscript(null);
    } else {
      setInterimTranscript(line);
    }
  } });
  const stage = stages[stageIndex];
  const progress = Math.round(((stageIndex + 1) / stages.length) * 100);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { window.localStorage.setItem("dialog-ai-theme", theme); } catch { /* Storage may be disabled; theme still works for this session. */ }
  }, [theme]);

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: "smooth" });
  }, [transcript]);

  useEffect(() => {
    // Authenticated call data belongs in Supabase, not shared browser storage.
    if (AUTH_CONFIGURED && !demoMode) return;
    try {
      window.localStorage.setItem(demoMode ? "dialog-ai-demo-history" : "dialog-ai-call-history", JSON.stringify(history));
    } catch {
      /* Call history remains available in memory for this session. */
    }
  }, [history, demoMode]);

  useEffect(() => {
    if (demoMode) return;
    if (AUTH_CONFIGURED && !authSession?.access_token) return;
    if (AUTH_CONFIGURED) setHistory([]);
    let cancelled = false;
    const headers: HeadersInit = authSession?.access_token
      ? { Authorization: "Bearer " + authSession.access_token }
      : {};
    fetch(API_BASE_URL + "/api/calls", { headers })
      .then(async (response) => {
        if (!response.ok) throw new Error("Call history could not be loaded");
        return response.json();
      })
      .then((rows: Array<{ id: string; prospect: string; company: string; outcome: string; stage: number; duration: string; transcript?: Array<{ speaker: string; text: string; time?: string }>; created_at: string }>) => {
        if (cancelled || !Array.isArray(rows)) return;
        setHistory(rows.map((row) => ({
          id: row.id,
          prospect: row.prospect,
          company: row.company,
          date: row.created_at ? new Date(row.created_at).toLocaleString() : "Saved call",
          outcome: row.outcome,
          stage: row.stage,
          duration: row.duration,
          transcript: row.transcript ?? [],
        })));
      })
      .catch(() => { if (!cancelled) setToast("Backend history unavailable; showing saved browser history."); });
    return () => { cancelled = true; };
  }, [authSession, demoMode]);

  useEffect(() => {
    setListening(transcription.status === "listening");
    setMicOn(transcription.status === "listening");
    if (transcription.error) setToast(transcription.error);
  }, [transcription.status, transcription.error]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(""), 2800);
    return () => window.clearTimeout(id);
  }, [toast]);

  const filteredHistory = useMemo(() => history.filter((call) =>
    `${call.prospect} ${call.company} ${call.outcome}`.toLowerCase().includes(search.toLowerCase())), [history, search]);

  function notify(message: string) { setToast(message); }
  function addTranscriptLine(speaker: "You" | "Prospect", text: string) {
    if (!text.trim()) return;
    setTranscript((lines) => [...lines, { id: Date.now(), speaker, text: text.trim(), time: new Date().toLocaleTimeString([], { minute: "2-digit", second: "2-digit" }) }]);
    setDraft("");
  }
  async function toggleMic() {
    if (transcription.status === "listening" || transcription.status === "connecting") {
      transcription.stop();
      notify("Transcription stopped. Manual entry remains available.");
      return;
    }
    await transcription.start();
  }
  async function requestCoaching() {
    setCoachLoading(true);
    try {
      const response = await fetch(API_BASE_URL + "/api/coaching/suggestion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stage: stage.name,
          purpose: stage.purpose,
          response_type: responseType,
          notes,
          transcript: transcript.slice(-8).map((line) => line.speaker + ": " + line.text),
        }),
      });
      if (!response.ok) throw new Error("Coaching service is unavailable");
      const data: { suggestion: string; source: "groq" | "fallback" } = await response.json();
      setSuggestion(data.suggestion);
      notify(data.source === "groq" ? "Coaching refreshed" : "Using built-in coaching guidance");
    } catch {
      setSuggestion(stage.tip);
      notify("AI coaching unavailable. Showing built-in guidance instead.");
    } finally {
      setCoachLoading(false);
    }
  }

  function saveStage() {
    const line = notes.trim() ? `Stage note: ${notes.trim()}` : `Response marked: ${responseType}`;
    notify(`Stage ${stageIndex + 1} result saved in this demo session`);
    setSuggestion(stageIndex < 7
      ? `Next: ${stages[stageIndex + 1].purpose.toLowerCase()}. Use their exact wording to keep the conversation relevant.`
      : "Confirm the next action, timing, and owner before ending the call.");
    if (stageIndex < stages.length - 1) setStageIndex(stageIndex + 1);
    setNotes("");
    void line;
  }
  async function finishCall() {
    if (!prospect.trim()) {
      notify("Add the prospect name before saving this call.");
      setShowEnd(false);
      return;
    }
    transcription.stop();
    const elapsedSeconds = callStartedAtRef.current === null
      ? 0
      : Math.max(0, Math.floor((Date.now() - callStartedAtRef.current) / 1000));
    const duration = `${String(Math.floor(elapsedSeconds / 60)).padStart(2, "0")}:${String(elapsedSeconds % 60).padStart(2, "0")}`;
    const transcriptLines = transcript.map(({ id, ...line }) => line);
    const localCall: CallRecord = {
      id: demoMode ? `demo-${crypto.randomUUID()}` : `local-${crypto.randomUUID()}`,
      prospect: prospect.trim(), company: company.trim(), date: new Date().toLocaleString(),
      outcome, stage: stageIndex + 1, duration, transcript: transcriptLines,
    };

    if (demoMode) {
      setHistory((items) => [localCall, ...items]);
      notify("Demo call saved to this browser only");
    } else {
      try {
        const headers: HeadersInit = {
          "Content-Type": "application/json",
          ...(authSession?.access_token ? { Authorization: "Bearer " + authSession.access_token } : {}),
        };
        const response = await fetch(API_BASE_URL + "/api/calls", {
          method: "POST",
          headers,
          body: JSON.stringify({
            prospect: localCall.prospect, company: localCall.company, outcome,
            stage: stageIndex + 1, duration,
            transcript: transcriptLines,
          }),
        });
        if (!response.ok) throw new Error("Backend save failed");
        const saved = await response.json() as { id?: string; created_at?: string };
        setHistory((items) => [{
          ...localCall,
          id: saved.id ?? localCall.id,
          date: saved.created_at ? new Date(saved.created_at).toLocaleString() : localCall.date,
        }, ...items]);
        notify(AUTH_CONFIGURED ? "Call saved to your cloud history" : "Call saved to backend history");
      } catch {
        setHistory((items) => [localCall, ...items]);
        notify(AUTH_CONFIGURED
          ? "Cloud save failed. This call is only in the current session and was not synced."
          : "Backend unavailable. Saved this call in browser history instead.");
      }
    }
    callStartedAtRef.current = null;
    setShowEnd(false); setCallActive(false); setListening(false); setMicOn(false);
    setPage("history");
  }

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthBusy(true); setAuthError(""); setAuthNotice("");
    try {
      const path = authMode === "sign-up" ? "/auth/v1/signup" : "/auth/v1/token?grant_type=password";
      const response = await fetch(SUPABASE_URL + path, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
        body: JSON.stringify({ email: authEmail.trim(), password: authPassword }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.msg || body.message || "Authentication failed.");
      if (!body.access_token) {
        setAuthNotice("Check your email to confirm your account, then sign in.");
        return;
      }
      window.localStorage.setItem("dialog-ai-session", JSON.stringify(body));
      setAuthSession(body as AuthSession);
      setAuthPassword("");
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Authentication failed.");
    } finally {
      setAuthBusy(false);
    }
  }

  function signOut() {
    try { window.localStorage.removeItem("dialog-ai-session"); } catch { /* Continue with in-memory sign-out. */ }
    setAuthSession(null);
    setDemoMode(false);
    notify("Signed out");
  }
  function exitDemoMode() {
    setDemoMode(false);
    try {
      const stored = window.localStorage.getItem("dialog-ai-call-history");
      setHistory(stored ? JSON.parse(stored) as CallRecord[] : []);
    } catch { setHistory([]); }
    setPage("workspace");
    notify("Returned to your workspace");
  }
  function enterDemoMode() {
    setDemoMode(true);
    setHistory(() => {
      try {
        const stored = window.localStorage.getItem("dialog-ai-demo-history");
        return stored ? JSON.parse(stored) as CallRecord[] : seedHistory;
      } catch { return seedHistory; }
    });
    setAuthError("");
    setAuthNotice("");
    setPage("history");
    notify("Demo workspace opened. Sample data stays in this browser.");
  }
  function startNewCall() {
    transcription.stop();
    callStartedAtRef.current = Date.now();
    setProspect(""); setCompany("");
    setStageIndex(0); setCallActive(true); setListening(false); setMicOn(false);
    setTranscript([]); setInterimTranscript(null); setNotes(""); setResponseType("Asked for context"); setSuggestion("Start with a concise opening. AI suggestions will appear here when the backend is connected.");
    setPage("workspace"); notify("New demo call ready");
  }

  if (AUTH_CONFIGURED && !authSession?.access_token && !demoMode) {
    return (
      <div className="auth-screen" data-theme={theme}>
        <form className="auth-card" onSubmit={submitAuth}>
          <div className="brand-mark"><AudioLines size={21} /></div>
          <p className="eyebrow">DIALOG AI · CALL INTELLIGENCE</p>
          <h1>{authMode === "sign-in" ? "Welcome back" : "Create your workspace"}</h1>
          <p className="auth-description">Sign in to securely sync your call history across sessions.</p>
          <label htmlFor="auth-email">Email</label>
          <input id="auth-email" type="email" autoComplete="email" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} required />
          <label htmlFor="auth-password">Password</label>
          <input id="auth-password" type="password" autoComplete={authMode === "sign-in" ? "current-password" : "new-password"} minLength={8} value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} required />
          {authError && <p className="auth-error" role="alert">{authError}</p>}
          {authNotice && <p className="auth-notice" role="status">{authNotice}</p>}
          <button className="button button-primary auth-submit" type="submit" disabled={authBusy}>{authBusy ? "Please wait…" : authMode === "sign-in" ? "Sign in" : "Create account"}</button>
          <button className="auth-toggle" type="button" onClick={() => { setAuthMode((mode) => mode === "sign-in" ? "sign-up" : "sign-in"); setAuthError(""); setAuthNotice(""); }}>
            {authMode === "sign-in" ? "New here? Create an account" : "Already registered? Sign in"}
          </button>
          <button className="auth-toggle demo-entry" type="button" onClick={enterDemoMode}>Explore demo workspace · no account needed</button>
        </form>
      </div>
    );
  }

  return (
    <div className="app-shell" data-theme={theme}>
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark"><AudioLines size={21} /></div><div><strong>dialog<span>ai</span></strong><small>CALL INTELLIGENCE</small></div></div>
        <div className="workspace-switch"><div className="workspace-avatar">{demoMode ? "D" : "S"}</div><span><b>{demoMode ? "Demo workspace" : "Personal workspace"}</b><small>{demoMode ? "Sample data · browser only" : AUTH_CONFIGURED ? "Synced call history" : "Local call history"}</small></span></div>
        <div className="nav-label">WORKSPACE</div>
        <button className={`nav-item ${page === "workspace" ? "active" : ""}`} onClick={() => setPage("workspace")}><LayoutDashboard size={17} />Live call <span className="nav-live"><i />LIVE</span></button>
        <button className={`nav-item ${page === "history" ? "active" : ""}`} onClick={() => setPage("history")}><History size={17} />Call history</button>
        <button className={`nav-item ${demoMode ? "active" : ""}`} onClick={demoMode ? exitDemoMode : enterDemoMode}><Sparkles size={17} />{demoMode ? "Exit demo" : "Explore demo"}</button>
        <button className="nav-item" onClick={() => notify("Analytics will be available when call data is connected")}><BarChart3 size={17} />Analytics <span className="soon">SOON</span></button>
        <div className="sidebar-bottom"><div className="upgrade-card"><div className="upgrade-icon"><Sparkles size={17} /></div><b>Make every call count.</b><p>Keep conversations human. Let the details stay organized.</p><button onClick={() => notify("You're using the Dialog AI demo workspace")}>Explore workspace <ArrowRight size={14} /></button></div><button className="profile" onClick={demoMode ? exitDemoMode : AUTH_CONFIGURED ? signOut : undefined} title={demoMode ? "Exit demo" : AUTH_CONFIGURED ? "Sign out" : "Demo profile"}><div className="profile-avatar">AL</div><span><b>{authSession?.user?.email || "Alex Morgan"}</b><small>{AUTH_CONFIGURED ? "Sign out" : "Sales representative"}</small></span><MoreHorizontal size={18} /></button></div>
      </aside>

      <main className="main-area">
        <header className="topbar"><div className="breadcrumbs"><span>Workspace</span><span className="slash">/</span><b>{page === "workspace" ? "Live call" : "Call history"}</b></div><div className="top-actions"><div className="system-status"><span className="status-dot" />{demoMode ? "Demo workspace" : AUTH_CONFIGURED ? "Account workspace" : "Local workspace"}</div><button className="icon-button" aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"} title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"} onClick={() => setTheme((current) => current === "dark" ? "light" : "dark")}>{theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}</button><button className="icon-button" aria-label="Notifications" onClick={() => notify("You're all caught up")}><Bell size={17} /></button><div className="top-avatar">AM</div></div></header>

        {page === "workspace" ? (
          <div className="page-content">
            <div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line" />REAL-TIME ASSISTANCE</div><h1>Live call workspace</h1><p>Stay present in the conversation. We'll keep the details in view.</p></div><div className="heading-actions"><span className={`call-state ${callActive ? "on" : "off"}`}><i />{callActive ? "Call in progress" : "Call ended"}</span><button className="button button-secondary" onClick={startNewCall}><Plus size={16} />New call</button></div></div>

            <section className="call-overview panel">
              <div className="prospect-block"><div className="prospect-avatar">{prospect.split(" ").map((x) => x[0]).join("").slice(0,2)}</div><div className="prospect-details"><label className="prospect-name"><span className="sr-only">Prospect name</span><input className="call-detail-input" value={prospect} onChange={(event) => setProspect(event.target.value)} placeholder="Prospect name" maxLength={160} /><span className="verified"><BadgeCheck size={14} /></span></label><label className="company-line"><span className="sr-only">Company</span><input className="call-detail-input company-input" value={company} onChange={(event) => setCompany(event.target.value)} placeholder="Company (optional)" maxLength={160} /><span className="meta-dot" />Outbound prospect</label><div className="call-meta"><span><Clock3 size={13} />Current session</span><span><Activity size={13} />{listening ? "Listening" : "Audio source not connected"}</span></div></div></div>
              <div className="overview-divider" /><div className="call-progress"><div className="progress-label"><span>Conversation progress</span><b>{stageIndex + 1} <small>/ 8 stages</small></b></div><div className="progress-track"><div style={{ width: `${progress}%` }} /></div><div className="progress-foot"><span>{stage.name}</span><span>{progress}% complete</span></div></div>
              <div className="overview-controls"><label className="audio-source-control"><Headphones size={15} /><span className="sr-only">Audio source</span><select aria-label="Audio source" value={audioSource} onChange={(event) => setAudioSource(event.target.value as "microphone" | "system" | "both")} disabled={micOn}><option value="microphone">Microphone</option><option value="system">Desktop audio</option><option value="both">Desktop + mic</option></select></label><button className={`control-button ${micOn ? "control-active" : ""}`} onClick={toggleMic}>{micOn ? <Mic size={16} /> : <MicOff size={16} />}{micOn ? "Stop transcription" : "Start transcription"}</button><button className="end-call" onClick={() => setShowEnd(true)} disabled={!callActive}><PhoneOff size={15} />End call</button></div>
            </section>

            <div className="workspace-grid">
              <div className="left-column">
                <section className="panel transcript-panel">
                  <div className="panel-heading"><div className="heading-icon purple"><AudioLines size={17} /></div><div><h2>Live transcript</h2><p>Capture the words that matter</p></div><span className={`live-pill ${listening ? "listening" : ""}`}><i />{listening ? "LISTENING" : "MANUAL MODE"}</span><button className="icon-button small" aria-label="Transcript help" onClick={() => notify("Live speech-to-text needs a provider connection on the backend")}><CircleHelp size={16} /></button></div>
                  <div className="transcript-feed" ref={transcriptRef}>
                    {transcript.length === 0 && !interimTranscript && <div className="empty-transcript"><AudioLines size={26} /><b>Conversation starts here</b><span>Use the composer below to add a speaker turn.</span></div>}
                    {[...transcript, ...(interimTranscript ? [interimTranscript] : [])].map((line) => <div className={`transcript-line ${line.speaker === "Prospect" || line.speaker === "Voice 2" ? "prospect-line" : ""}`} key={line.id}><div className={`speaker-avatar ${line.speaker === "Prospect" || line.speaker === "Voice 2" ? "prospect-speaker" : ""}`}>{line.speaker === "You" ? "Y" : line.speaker === "Voice 1" ? "1" : line.speaker === "Voice 2" ? "2" : line.speaker === "Unknown" ? "?" : "P"}</div><div className="transcript-copy"><div className="transcript-meta"><b>{line.speaker === "You" ? "You" : line.speaker === "Prospect" ? prospect : line.speaker}</b><span>{line.time}{line === interimTranscript ? " · interim" : ""}</span></div><p>{line.text}</p></div></div>)}
                  </div>
                  <form className="transcript-composer" onSubmit={(e) => { e.preventDefault(); addTranscriptLine("Prospect", draft); }}>
                    <div className="composer-top"><span><span className="keyboard-dot" />Add transcript line</span><span>Manual entry</span></div>
                    <div className="composer-input"><input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Type the prospect's exact words…" aria-label="Transcript text" /><button type="submit" disabled={!draft.trim()} aria-label="Add transcript line"><ArrowRight size={17} /></button></div>
                  </form>
                  <div className="transcript-footer"><ShieldCheck size={14} /><span>Keep notes factual. Confirm consent before recording or transcribing calls.</span></div>
                </section>

                <section className="panel stage-panel">
                  <div className="panel-heading"><div className="heading-icon blue"><Target size={17} /></div><div><h2>Conversation roadmap</h2><p>Eight stages, one thoughtful conversation</p></div><span className="stage-count">{stageIndex + 1} OF 8</span></div>
                  <div className="stage-list">{stages.map((item, i) => <button key={item.name} className={`stage-row ${i === stageIndex ? "current" : ""} ${i < stageIndex ? "completed" : ""}`} onClick={() => setStageIndex(i)}><span className="stage-number">{i < stageIndex ? <Check size={13} /> : String(i + 1).padStart(2, "0")}</span><span className="stage-row-copy"><b>{item.name}</b><small>{item.purpose}</small></span>{i === stageIndex && <span className="current-tag">CURRENT</span>}{i > stageIndex && <span className="stage-pending"><ArrowRight size={14} /></span>}</button>)}</div>
                </section>
              </div>

              <div className="right-column">
                <section className="panel guidance-panel">
                  <div className="panel-heading"><div className="heading-icon amber"><BookOpen size={17} /></div><div><h2>Stage guidance</h2><p>Keep the next move intentional</p></div><button className="icon-button small" aria-label="Guidance settings" onClick={() => notify("Guidance is currently using local demo content")}><Settings2 size={16} /></button></div>
                  <div className="stage-context"><span className="context-label">STAGE {String(stageIndex + 1).padStart(2,"0")} <span>/ 08</span></span><h3>{stage.name}</h3><p>{stage.purpose}</p></div>
                  <div className="guidance-section"><div className="section-label"><span className="section-dot violet" />SUGGESTED LANGUAGE</div><blockquote>{stage.prompt}</blockquote><button className="copy-link" onClick={() => { void navigator.clipboard?.writeText(stage.prompt); notify("Suggested language copied"); }}>Copy suggestion <Command size={13} /></button></div>
                  <div className="tip-box"><div className="tip-icon"><Zap size={15} /></div><div><b>Coach's note</b><p>{stage.tip}</p></div></div>
                  <div className="ai-insight"><div className="ai-insight-head"><div><Sparkles size={15} /><b>Conversation insight</b></div><span>{coachLoading ? "WORKING" : "LIVE"}</span></div><p>{suggestion}</p><div className="insight-foot"><span><Activity size={13} />Stage + recent context</span><button className="copy-link" onClick={() => void requestCoaching()} disabled={coachLoading}>{coachLoading ? "Thinking…" : "Refresh coaching"} <Sparkles size={13} /></button></div></div>
                  <div className="stage-actions"><button className="button button-secondary" onClick={() => setStageIndex(Math.max(0, stageIndex - 1))} disabled={stageIndex === 0}><ArrowLeft size={15} />Previous</button><button className="button button-primary" onClick={saveStage}>{stageIndex === 7 ? "Save stage" : "Save & continue"}<ArrowRight size={15} /></button></div>
                </section>

                <section className="panel response-panel">
                  <div className="panel-heading"><div className="heading-icon green"><Headphones size={17} /></div><div><h2>Prospect response</h2><p>Record what you heard</p></div></div>
                  <label className="field-label" htmlFor="response-type">Response type</label><div className="select-wrap"><select id="response-type" value={responseType} onChange={(e) => setResponseType(e.target.value)}><option>Asked for context</option><option>Interested</option><option>Busy / short on time</option><option>Raised an objection</option><option>Shared a pain point</option><option>Not interested</option><option>Requested follow-up</option><option>Other</option></select><ChevronDown size={15} /></div>
                  <label className="field-label" htmlFor="stage-notes">Exact words / stage notes</label><textarea id="stage-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="“I've got about a minute. What's this regarding?”" />
                  <div className="response-footer"><span><ShieldCheck size={13} />Notes are kept for this call</span><span>{notes.length} chars</span></div>
                </section>

                <section className="panel quick-stats"><div className="stat-item"><span><TrendingUp size={15} />Stages covered</span><b>{stageIndex + 1}<small>/8</small></b></div><div className="stat-item"><span><Waves size={15} />Transcript turns</span><b>{transcript.length}</b></div><div className="stat-item"><span><Zap size={15} />AI assist</span><b className="stat-ready">On demand</b></div></section>
              </div>
            </div>
            <div className="page-footnote"><span>Dialog AI <span className="meta-dot" /> Human-first call assistance</span><span>Live audio requires a configured Deepgram key</span></div>
          </div>
        ) : (
          <div className="page-content history-page">
            <div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line" />YOUR CONVERSATIONS</div><h1>Call history</h1><p>Review outcomes, learn from conversations, and pick up the next step.</p></div><button className="button button-primary" onClick={startNewCall}><Plus size={16} />Start a call</button></div>
            <div className="history-metrics"><div className="metric-card"><span>Total calls</span><b>{history.length}</b><small><TrendingUp size={13} />Saved calls</small></div><div className="metric-card"><span>Meetings booked</span><b>{history.filter((x) => x.outcome === "Meeting booked").length}</b><small><Target size={13} />Meetings booked</small></div><div className="metric-card"><span>Avg. call duration</span><b>—</b><small><Clock3 size={13} />Duration not captured yet</small></div><div className="metric-card"><span>Avg. stage reached</span><b>{(history.reduce((n,x) => n + x.stage,0) / Math.max(1,history.length)).toFixed(1)}<small>/8</small></b><small><BarChart3 size={13} />Conversation depth</small></div></div>
            <section className="panel history-table-panel"><div className="history-toolbar"><div><h2>Recent calls</h2><p>Latest activity across your workspace</p></div><div className="history-filters"><label className="search-box"><Search size={16} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search prospect or company" /></label><button className="button button-secondary" onClick={() => notify("Showing all call outcomes")}><Settings2 size={15} />Filters</button></div></div>
              <div className="table-wrap"><table><thead><tr><th>PROSPECT</th><th>DATE</th><th>FURTHEST STAGE</th><th>DURATION</th><th>OUTCOME</th><th /></tr></thead><tbody>{filteredHistory.map((call) => <tr key={call.id}><td><div className="table-person"><div className="table-avatar">{call.prospect.split(" ").map((x) => x[0]).join("").slice(0,2)}</div><div><b>{call.prospect}</b><small>{call.company}</small></div></div></td><td>{call.date}</td><td><div className="stage-cell"><div className="mini-progress"><span style={{ width: `${call.stage / 8 * 100}%` }} /></div><span>{call.stage}/8</span></div></td><td>{call.duration}</td><td><span className={`outcome-pill ${call.outcome === "Meeting booked" ? "positive" : call.outcome === "Not a fit" ? "neutral" : "followup"}`}><i />{call.outcome}</span></td><td><button className="icon-button small" aria-label={`View ${call.prospect}`} onClick={() => setSelectedCall(call)}><ArrowRight size={15} /></button></td></tr>)}</tbody></table>{filteredHistory.length === 0 && <div className="no-results">No calls match that search.</div>}</div>
              <div className="table-footer"><span>Showing {filteredHistory.length} recent calls</span><span>Furthest stage reached is saved per call</span></div>
            </section>
          </div>
        )}
      </main>

      {toast && <div className="toast"><Check size={16} />{toast}<button aria-label="Dismiss notification" onClick={() => setToast("")}><X size={14} /></button></div>}
      {selectedCall && <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setSelectedCall(null); }}><section className="end-modal call-detail-modal" role="dialog" aria-modal="true" aria-labelledby="call-detail-title"><button className="modal-close icon-button" onClick={() => setSelectedCall(null)} aria-label="Close"><X size={17} /></button><div className="modal-symbol"><History size={22} /></div><h2 id="call-detail-title">{selectedCall.prospect}</h2><p>{selectedCall.company || "No company recorded"} · {selectedCall.date}</p><div className="modal-summary"><span>Outcome</span><b>{selectedCall.outcome}</b><span>Furthest stage</span><b>{selectedCall.stage} of 8</b><span>Duration</span><b>{selectedCall.duration || "Not recorded"}</b></div><div className="saved-transcript"><h3>Saved transcript</h3>{selectedCall.transcript?.length ? selectedCall.transcript.map((line, index) => <div className="saved-transcript-line" key={index}><b>{line.speaker}</b><span>{line.time || ""}</span><p>{line.text}</p></div>) : <p>No transcript was saved for this call.</p>}</div><div className="modal-actions"><button className="button button-secondary" onClick={() => setSelectedCall(null)}>Close</button></div></section></div>}
      {showEnd && <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowEnd(false); }}><section className="end-modal" role="dialog" aria-modal="true" aria-labelledby="end-title"><button className="modal-close icon-button" onClick={() => setShowEnd(false)} aria-label="Close"><X size={17} /></button><div className="modal-symbol"><PhoneOff size={22} /></div><h2 id="end-title">Wrap up this call</h2><p>Capture the outcome before closing the session with {prospect}.</p><label className="field-label" htmlFor="outcome">Call outcome</label><select id="outcome" value={outcome} onChange={(e) => setOutcome(e.target.value)}><option>Meeting booked</option><option>Follow-up</option><option>Not interested</option><option>Not a fit</option><option>No answer</option></select><div className="modal-summary"><span>Furthest stage reached</span><b>{stageIndex + 1} of 8 · {stage.name}</b></div><div className="modal-actions"><button className="button button-secondary" onClick={() => setShowEnd(false)}>Keep calling</button><button className="button button-danger" onClick={finishCall}><PhoneOff size={15} />Close call</button></div></section></div>}
    </div>
  );
}

export default App;
