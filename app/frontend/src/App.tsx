import { useEffect, useMemo, useRef, useState } from "react";\nimport { useDeepgramTranscription } from "./hooks/useDeepgramTranscription";
import {
  Activity, ArrowDown, ArrowLeft, ArrowRight, AudioLines, BadgeCheck, BarChart3,
  Bell, BookOpen, BrainCircuit, Check, ChevronDown, CircleHelp, Clock3, Command,
  Headphones, History, LayoutDashboard, Mic, MicOff, MoreHorizontal, Phone,
  PhoneOff, Plus, Search, Settings2, ShieldCheck, Sparkles, Square, Target,
  TrendingUp, Volume2, Waves, X, Zap, Sun, Moon,
} from "lucide-react";

type Stage = { name: string; purpose: string; prompt: string; tip: string };
type TranscriptLine = { id: number; speaker: "You" | "Prospect" | "Voice 1" | "Voice 2" | "Unknown"; text: string; time: string };
type CallRecord = { id: string; prospect: string; company: string; date: string; outcome: string; stage: number; duration: string };

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

const initialLines: TranscriptLine[] = [
  { id: 1, speaker: "You", text: "Hi Jordan, this is Alex. Have I caught you at an okay time for a quick question?", time: "00:04" },
  { id: 2, speaker: "Prospect", text: "I've got about a minute. What's this regarding?", time: "00:11" },
];
const seedHistory: CallRecord[] = [
  { id: "DL-2048", prospect: "Priya Sharma", company: "Northstar Labs", date: "Today, 10:42 AM", outcome: "Meeting booked", stage: 8, duration: "06:24" },
  { id: "DL-2047", prospect: "Marcus Chen", company: "Vertex Systems", date: "Today, 09:18 AM", outcome: "Follow-up", stage: 6, duration: "04:51" },
  { id: "DL-2046", prospect: "Elena Rodriguez", company: "Brightline", date: "Yesterday", outcome: "Not a fit", stage: 4, duration: "03:12" },
];

function App() {
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    try { return window.localStorage.getItem("dialog-ai-theme") === "light" ? "light" : "dark"; }
    catch { return "dark"; }
  });
  const [page, setPage] = useState<"workspace" | "history">("workspace");
  const [stageIndex, setStageIndex] = useState(0);
  const [prospect, setProspect] = useState("Jordan Lee");
  const [company, setCompany] = useState("Meridian Software");
  const [callActive, setCallActive] = useState(true);
  const [micOn, setMicOn] = useState(false);
  const [listening, setListening] = useState(false);
  const [responseType, setResponseType] = useState("Asked for context");
  const [notes, setNotes] = useState("");
  const [transcript, setTranscript] = useState(initialLines);\n  const [interimTranscript, setInterimTranscript] = useState<TranscriptLine | null>(null);
  const [draft, setDraft] = useState("");
  const [suggestion, setSuggestion] = useState("They've offered a one-minute window. Give a concise reason for calling, then ask one focused question.");
  const [history, setHistory] = useState(seedHistory);
  const [showEnd, setShowEnd] = useState(false);
  const [outcome, setOutcome] = useState("Meeting booked");
  const [toast, setToast] = useState("");
  const [search, setSearch] = useState("");
  const transcriptRef = useRef<HTMLDivElement>(null);
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
  function finishCall() {
    setHistory((items) => [{
      id: `DL-${Math.floor(2050 + Math.random() * 900)}`, prospect, company,
      date: "Just now", outcome, stage: stageIndex + 1, duration: "Live",
    }, ...items]);
    setShowEnd(false); setCallActive(false); setListening(false); setMicOn(false);
    notify("Call closed and added to demo history");
    setPage("history");
  }
  function startNewCall() {
    setStageIndex(0); setCallActive(true); setListening(false); setMicOn(false);
    setTranscript([]); setInterimTranscript(null); setNotes(""); setResponseType("Asked for context"); setSuggestion("Start with a concise opening. AI suggestions will appear here when the backend is connected.");
    setPage("workspace"); notify("New demo call ready");
  }

  return (
    <div className="app-shell" data-theme={theme}>
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark"><AudioLines size={21} /></div><div><strong>dialog<span>ai</span></strong><small>CALL INTELLIGENCE</small></div></div>
        <button className="workspace-switch"><div className="workspace-avatar">S</div><span><b>Sales workspace</b><small>Growth team</small></span><ChevronDown size={15} /></button>
        <div className="nav-label">WORKSPACE</div>
        <button className={`nav-item ${page === "workspace" ? "active" : ""}`} onClick={() => setPage("workspace")}><LayoutDashboard size={17} />Live call <span className="nav-live"><i />LIVE</span></button>
        <button className={`nav-item ${page === "history" ? "active" : ""}`} onClick={() => setPage("history")}><History size={17} />Call history</button>
        <button className="nav-item" onClick={() => notify("Analytics will be available when call data is connected")}><BarChart3 size={17} />Analytics <span className="soon">SOON</span></button>
        <div className="sidebar-bottom"><div className="upgrade-card"><div className="upgrade-icon"><Sparkles size={17} /></div><b>Make every call count.</b><p>Keep conversations human. Let the details stay organized.</p><button onClick={() => notify("You're using the Dialog AI demo workspace")}>Explore workspace <ArrowRight size={14} /></button></div><button className="profile"><div className="profile-avatar">AL</div><span><b>Alex Morgan</b><small>Sales representative</small></span><MoreHorizontal size={18} /></button></div>
      </aside>

      <main className="main-area">
        <header className="topbar"><div className="breadcrumbs"><span>Workspace</span><span className="slash">/</span><b>{page === "workspace" ? "Live call" : "Call history"}</b></div><div className="top-actions"><div className="system-status"><span className="status-dot" />Demo mode · Offline-safe</div><button className="icon-button" aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"} title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"} onClick={() => setTheme((current) => current === "dark" ? "light" : "dark")}>{theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}</button><button className="icon-button" aria-label="Notifications" onClick={() => notify("You're all caught up")}><Bell size={17} /></button><div className="top-avatar">AM</div></div></header>

        {page === "workspace" ? (
          <div className="page-content">
            <div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line" />REAL-TIME ASSISTANCE</div><h1>Live call workspace</h1><p>Stay present in the conversation. We'll keep the details in view.</p></div><div className="heading-actions"><span className={`call-state ${callActive ? "on" : "off"}`}><i />{callActive ? "Call in progress" : "Call ended"}</span><button className="button button-secondary" onClick={startNewCall}><Plus size={16} />New call</button></div></div>

            <section className="call-overview panel">
              <div className="prospect-block"><div className="prospect-avatar">{prospect.split(" ").map((x) => x[0]).join("").slice(0,2)}</div><div className="prospect-details"><div className="prospect-name">{prospect}<span className="verified"><BadgeCheck size={14} /></span></div><div className="company-line">{company}<span className="meta-dot" />Outbound prospect</div><div className="call-meta"><span><Clock3 size={13} />00:04:32</span><span><Activity size={13} />{listening ? "Listening" : "Audio source not connected"}</span></div></div></div>
              <div className="overview-divider" /><div className="call-progress"><div className="progress-label"><span>Conversation progress</span><b>{stageIndex + 1} <small>/ 8 stages</small></b></div><div className="progress-track"><div style={{ width: `${progress}%` }} /></div><div className="progress-foot"><span>{stage.name}</span><span>{progress}% complete</span></div></div>
              <div className="overview-controls"><button className={`control-button ${micOn ? "control-active" : ""}`} onClick={toggleMic}>{micOn ? <Mic size={16} /> : <MicOff size={16} />}{micOn ? "Mic enabled" : "Enable mic"}</button><button className="end-call" onClick={() => setShowEnd(true)} disabled={!callActive}><PhoneOff size={15} />End call</button></div>
            </section>

            <div className="workspace-grid">
              <div className="left-column">
                <section className="panel transcript-panel">
                  <div className="panel-heading"><div className="heading-icon purple"><AudioLines size={17} /></div><div><h2>Live transcript</h2><p>Capture the words that matter</p></div><span className={`live-pill ${listening ? "listening" : ""}`}><i />{listening ? "LISTENING" : "MANUAL MODE"}</span><button className="icon-button small" aria-label="Transcript help" onClick={() => notify("Live speech-to-text needs a provider connection on the backend")}><CircleHelp size={16} /></button></div>
                  <div className="transcript-feed" ref={transcriptRef}>
                    {transcript.length === 0 && <div className="empty-transcript"><AudioLines size={26} /><b>Conversation starts here</b><span>Use the composer below to add a speaker turn.</span></div>}
                    {[...transcript, ...(interimTranscript ? [interimTranscript] : [])].map((line) => <div className={`transcript-line ${line.speaker === "Prospect" || line.speaker === "Voice 2" ? "prospect-line" : ""}`} key={line.id}><div className={`speaker-avatar ${line.speaker === "Prospect" || line.speaker === "Voice 2" ? "prospect-speaker" : ""}`}>{line.speaker === "You" || line.speaker === "Voice 1" ? "Y" : line.speaker === "Unknown" ? "?" : "P"}</div><div className="transcript-copy"><div className="transcript-meta"><b>{line.speaker === "You" ? "You" : line.speaker === "Prospect" ? prospect : line.speaker}</b><span>{line.time}{line === interimTranscript ? " · interim" : ""}</span></div><p>{line.text}</p></div></div>)}
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
                  <div className="ai-insight"><div className="ai-insight-head"><div><Sparkles size={15} /><b>Conversation insight</b></div><span>DEMO</span></div><p>{suggestion}</p><div className="insight-foot"><span><Activity size={13} />Context-aware guidance</span><span>Illustrative</span></div></div>
                  <div className="stage-actions"><button className="button button-secondary" onClick={() => setStageIndex(Math.max(0, stageIndex - 1))} disabled={stageIndex === 0}><ArrowLeft size={15} />Previous</button><button className="button button-primary" onClick={saveStage}>{stageIndex === 7 ? "Save stage" : "Save & continue"}<ArrowRight size={15} /></button></div>
                </section>

                <section className="panel response-panel">
                  <div className="panel-heading"><div className="heading-icon green"><Headphones size={17} /></div><div><h2>Prospect response</h2><p>Record what you heard</p></div></div>
                  <label className="field-label" htmlFor="response-type">Response type</label><div className="select-wrap"><select id="response-type" value={responseType} onChange={(e) => setResponseType(e.target.value)}><option>Asked for context</option><option>Interested</option><option>Busy / short on time</option><option>Raised an objection</option><option>Shared a pain point</option><option>Not interested</option><option>Requested follow-up</option><option>Other</option></select><ChevronDown size={15} /></div>
                  <label className="field-label" htmlFor="stage-notes">Exact words / stage notes</label><textarea id="stage-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="“I've got about a minute. What's this regarding?”" />
                  <div className="response-footer"><span><ShieldCheck size={13} />Saved to this demo session</span><span>{notes.length} chars</span></div>
                </section>

                <section className="panel quick-stats"><div className="stat-item"><span><TrendingUp size={15} />Stages covered</span><b>{stageIndex + 1}<small>/8</small></b></div><div className="stat-item"><span><Waves size={15} />Transcript turns</span><b>{transcript.length}</b></div><div className="stat-item"><span><Zap size={15} />AI assist</span><b className="stat-ready">Demo</b></div></section>
              </div>
            </div>
            <div className="page-footnote"><span>Dialog AI <span className="meta-dot" /> Human-first call assistance</span><span>Demo workspace · Not connected to a live call provider</span></div>
          </div>
        ) : (
          <div className="page-content history-page">
            <div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line" />YOUR CONVERSATIONS</div><h1>Call history</h1><p>Review outcomes, learn from conversations, and pick up the next step.</p></div><button className="button button-primary" onClick={startNewCall}><Plus size={16} />Start a call</button></div>
            <div className="history-metrics"><div className="metric-card"><span>Total calls</span><b>{history.length + 24}</b><small><TrendingUp size={13} />12% vs. last week</small></div><div className="metric-card"><span>Meetings booked</span><b>{history.filter((x) => x.outcome === "Meeting booked").length + 8}</b><small><Target size={13} />Positive outcomes</small></div><div className="metric-card"><span>Avg. call duration</span><b>04:38</b><small><Clock3 size={13} />Across completed calls</small></div><div className="metric-card"><span>Avg. stage reached</span><b>{(history.reduce((n,x) => n + x.stage,0) / Math.max(1,history.length)).toFixed(1)}<small>/8</small></b><small><BarChart3 size={13} />Conversation depth</small></div></div>
            <section className="panel history-table-panel"><div className="history-toolbar"><div><h2>Recent calls</h2><p>Latest activity across your workspace</p></div><div className="history-filters"><label className="search-box"><Search size={16} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search prospect or company" /></label><button className="button button-secondary" onClick={() => notify("Showing all call outcomes")}><Settings2 size={15} />Filters</button></div></div>
              <div className="table-wrap"><table><thead><tr><th>PROSPECT</th><th>DATE</th><th>FURTHEST STAGE</th><th>DURATION</th><th>OUTCOME</th><th /></tr></thead><tbody>{filteredHistory.map((call) => <tr key={call.id}><td><div className="table-person"><div className="table-avatar">{call.prospect.split(" ").map((x) => x[0]).join("").slice(0,2)}</div><div><b>{call.prospect}</b><small>{call.company}</small></div></div></td><td>{call.date}</td><td><div className="stage-cell"><div className="mini-progress"><span style={{ width: `${call.stage / 8 * 100}%` }} /></div><span>{call.stage}/8</span></div></td><td>{call.duration}</td><td><span className={`outcome-pill ${call.outcome === "Meeting booked" ? "positive" : call.outcome === "Not a fit" ? "neutral" : "followup"}`}><i />{call.outcome}</span></td><td><button className="icon-button small" aria-label={`View ${call.prospect}`} onClick={() => notify(`${call.prospect}: reached stage ${call.stage} of 8`)}><ArrowRight size={15} /></button></td></tr>)}</tbody></table>{filteredHistory.length === 0 && <div className="no-results">No calls match that search.</div>}</div>
              <div className="table-footer"><span>Showing {filteredHistory.length} recent calls</span><span>Furthest stage reached is saved per call</span></div>
            </section>
          </div>
        )}
      </main>

      {toast && <div className="toast"><Check size={16} />{toast}<button aria-label="Dismiss notification" onClick={() => setToast("")}><X size={14} /></button></div>}
      {showEnd && <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowEnd(false); }}><section className="end-modal" role="dialog" aria-modal="true" aria-labelledby="end-title"><button className="modal-close icon-button" onClick={() => setShowEnd(false)} aria-label="Close"><X size={17} /></button><div className="modal-symbol"><PhoneOff size={22} /></div><h2 id="end-title">Wrap up this call</h2><p>Capture the outcome before closing the session with {prospect}.</p><label className="field-label" htmlFor="outcome">Call outcome</label><select id="outcome" value={outcome} onChange={(e) => setOutcome(e.target.value)}><option>Meeting booked</option><option>Follow-up</option><option>Not interested</option><option>Not a fit</option><option>No answer</option></select><div className="modal-summary"><span>Furthest stage reached</span><b>{stageIndex + 1} of 8 · {stage.name}</b></div><div className="modal-actions"><button className="button button-secondary" onClick={() => setShowEnd(false)}>Keep calling</button><button className="button button-danger" onClick={finishCall}><PhoneOff size={15} />Close call</button></div></section></div>}
    </div>
  );
}

export default App;
