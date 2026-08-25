import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  LayoutGrid, Calendar as CalendarIcon, Clock, ListChecks, AlarmClock,
  Timer, Target, Repeat, StickyNote, Search, Settings as SettingsIcon,
  Plus, X, Check, Trash2, Pause, Play, RotateCcw, ChevronLeft, ChevronRight,
  Pin, PinOff, Archive, Bell, BellOff, AlertTriangle, Flame, Download, Upload,
  Menu, CircleCheck, Circle
} from "lucide-react";

/* ---------------------------------------------------------------------- */
/*  Storage helpers                                                       */
/* ---------------------------------------------------------------------- */

const STORAGE_KEYS = {
  tasks: "tf-tasks",
  events: "tf-events",
  timetable: "tf-timetable",
  alarms: "tf-alarms",
  goals: "tf-goals",
  habits: "tf-habits",
  notes: "tf-notes",
  settings: "tf-settings",
  focusSessions: "tf-focus-sessions",
};

const DEFAULT_SETTINGS = {
  displayName: "",
  theme: "dark",
  clock24h: false,
  weekStart: 0, // 0 = Sunday
  defaultFocusMinutes: 25,
  defaultShortBreak: 5,
  defaultLongBreak: 15,
  notificationsEnabled: false,
  soundEnabled: true,
};

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/* Standalone build: persistence uses the browser's own localStorage
   (per-device, per-browser). This replaces the window.storage API that
   only exists inside Claude.ai artifacts. */
async function storageLoad(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw) return JSON.parse(raw);
    return fallback;
  } catch {
    return fallback;
  }
}

async function storageSave(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/* A simple hook that loads a collection from storage once, and persists
   on every change (after the initial load completes). */
function usePersistentState(key, fallback) {
  const [value, setValue] = useState(fallback);
  const [loaded, setLoaded] = useState(false);
  const firstRun = useRef(true);

  useEffect(() => {
    let cancelled = false;
    storageLoad(key, fallback).then((v) => {
      if (!cancelled) {
        setValue(v);
        setLoaded(true);
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (!loaded) return;
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    storageSave(key, value);
  }, [value, loaded, key]);

  return [value, setValue, loaded];
}

/* ---------------------------------------------------------------------- */
/*  Date / time utilities                                                 */
/* ---------------------------------------------------------------------- */

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_NAMES_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function pad(n) { return n.toString().padStart(2, "0"); }
function toDateKey(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function todayKey() { return toDateKey(new Date()); }
function formatTime(hhmm, use24h) {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":").map(Number);
  if (use24h) return `${pad(h)}:${pad(m)}`;
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad(m)} ${period}`;
}
function minutesFromHHMM(hhmm) {
  if (!hhmm) return 0;
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}
function dayProgressPct() {
  const now = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  return Math.min(100, Math.max(0, (mins / 1440) * 100));
}

/* ---------------------------------------------------------------------- */
/*  Shared small UI primitives                                            */
/* ---------------------------------------------------------------------- */

const CATEGORY_COLORS = {
  work: "#5EEAD4", study: "#93C5FD", exercise: "#FCA5A5", personal: "#FCD34D",
  meeting: "#C4B5FD", meal: "#FDBA74", sleep: "#94A3B8", prayer: "#6EE7B7",
  rest: "#A5B4FC", other: "#CBD5E1",
};
const CATEGORY_LIST = Object.keys(CATEGORY_COLORS);

const PRIORITY_STYLES = {
  Critical: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  High: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  Medium: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  Low: "bg-slate-500/15 text-slate-300 border-slate-500/30",
};

function Eyebrow({ children }) {
  return (
    <div className="font-mono text-[11px] tracking-[0.2em] uppercase text-teal-400/80 mb-1">
      {children}
    </div>
  );
}

function PanelHeader({ eyebrow, title, action }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div>
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <h2 className="text-lg font-bold text-slate-100 tracking-tight">{title}</h2>
      </div>
      {action}
    </div>
  );
}

function Btn({ children, onClick, variant = "primary", className = "", type = "button", disabled }) {
  const base = "inline-flex items-center gap-1.5 justify-center rounded-md px-3 py-2 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed";
  const variants = {
    primary: "bg-teal-500 text-slate-950 hover:bg-teal-400",
    secondary: "bg-slate-800 text-slate-200 hover:bg-slate-700 border border-slate-700",
    ghost: "text-slate-400 hover:text-slate-100 hover:bg-slate-800",
    danger: "bg-rose-500/15 text-rose-300 hover:bg-rose-500/25 border border-rose-500/30",
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`${base} ${variants[variant]} ${className}`}>
      {children}
    </button>
  );
}

function Field({ label, children }) {
  return (
    <label className="block mb-3">
      <span className="block text-xs font-medium text-slate-400 mb-1">{label}</span>
      {children}
    </label>
  );
}

const inputCls = "w-full rounded-md bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500";

function Modal({ title, onClose, children, wide }) {
  useEffect(() => {
    function onKey(e) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/70 backdrop-blur-sm p-0 sm:p-4">
      <div className={`w-full ${wide ? "sm:max-w-lg" : "sm:max-w-md"} bg-slate-900 border border-slate-700 rounded-t-2xl sm:rounded-2xl max-h-[90vh] overflow-y-auto`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 sticky top-0 bg-slate-900">
          <h3 className="font-bold text-slate-100">{title}</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-200" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function EmptyState({ icon: Icon, title, hint }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-10 text-slate-500">
      <Icon size={28} className="mb-2 opacity-50" />
      <div className="text-sm font-medium text-slate-400">{title}</div>
      {hint && <div className="text-xs mt-1 max-w-xs">{hint}</div>}
    </div>
  );
}

function ConfirmDialog({ title, message, onConfirm, onCancel }) {
  return (
    <Modal title={title} onClose={onCancel}>
      <p className="text-sm text-slate-300 mb-5">{message}</p>
      <div className="flex justify-end gap-2">
        <Btn variant="secondary" onClick={onCancel}>Cancel</Btn>
        <Btn variant="danger" onClick={onConfirm}>Confirm</Btn>
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------------------- */
/*  Toast notifications (in-app)                                          */
/* ---------------------------------------------------------------------- */

function useToasts() {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((message, tone = "info") => {
    const id = uid();
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 6000);
  }, []);
  const dismiss = (id) => setToasts((t) => t.filter((x) => x.id !== id));
  return { toasts, push, dismiss };
}

function ToastStack({ toasts, dismiss }) {
  return (
    <div className="fixed bottom-20 sm:bottom-4 right-4 z-[60] flex flex-col gap-2 w-72 max-w-[90vw]">
      {toasts.map((t) => (
        <div key={t.id} className={`rounded-lg border px-3 py-2.5 text-sm shadow-lg flex items-start gap-2 ${
          t.tone === "alarm" ? "bg-amber-500/10 border-amber-500/40 text-amber-200" : "bg-slate-800 border-slate-700 text-slate-200"
        }`}>
          {t.tone === "alarm" ? <AlarmClock size={16} className="mt-0.5 shrink-0" /> : <Bell size={16} className="mt-0.5 shrink-0" />}
          <span className="flex-1">{t.message}</span>
          <button onClick={() => dismiss(t.id)} className="text-slate-500 hover:text-slate-200"><X size={14} /></button>
        </div>
      ))}
    </div>
  );
}

/* ========================================================================
   MAIN APP
   ======================================================================== */

export default function App() {
  const [tasks, setTasks, tasksLoaded] = usePersistentState(STORAGE_KEYS.tasks, []);
  const [events, setEvents, eventsLoaded] = usePersistentState(STORAGE_KEYS.events, []);
  const [blocks, setBlocks, blocksLoaded] = usePersistentState(STORAGE_KEYS.timetable, []);
  const [alarms, setAlarms, alarmsLoaded] = usePersistentState(STORAGE_KEYS.alarms, []);
  const [goals, setGoals, goalsLoaded] = usePersistentState(STORAGE_KEYS.goals, []);
  const [habits, setHabits, habitsLoaded] = usePersistentState(STORAGE_KEYS.habits, []);
  const [notes, setNotes, notesLoaded] = usePersistentState(STORAGE_KEYS.notes, []);
  const [settings, setSettings, settingsLoaded] = usePersistentState(STORAGE_KEYS.settings, DEFAULT_SETTINGS);
  const [focusSessions, setFocusSessions, focusLoaded] = usePersistentState(STORAGE_KEYS.focusSessions, []);

  const allLoaded = tasksLoaded && eventsLoaded && blocksLoaded && alarmsLoaded && goalsLoaded && habitsLoaded && notesLoaded && settingsLoaded && focusLoaded;

  const [view, setView] = useState("dashboard");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState("");
  const [now, setNow] = useState(new Date());
  const { toasts, push, dismiss } = useToasts();

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const unlock = () => { unlockAudio(); window.removeEventListener("pointerdown", unlock); window.removeEventListener("keydown", unlock); };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => { window.removeEventListener("pointerdown", unlock); window.removeEventListener("keydown", unlock); };
  }, []);

  /* ---------------- Alarm checking (in-app, foreground only) ---------- */
  const firedRef = useRef(new Set());
  useEffect(() => {
    const check = () => {
      const n = new Date();
      const hhmm = `${pad(n.getHours())}:${pad(n.getMinutes())}`;
      const dayIdx = n.getDay();
      const fireKey = `${toDateKey(n)}-${hhmm}`;
      alarms.forEach((a) => {
        if (!a.enabled) return;
        if (a.time !== hhmm) return;
        const repeats = a.days && a.days.length > 0;
        if (repeats && !a.days.includes(dayIdx)) return;
        if (!repeats && a.firedOnce) return;
        const key = `${a.id}-${fireKey}`;
        if (firedRef.current.has(key)) return;
        firedRef.current.add(key);
        push(`Alarm: ${a.label || "Untitled alarm"}`, "alarm");
        if (settings.soundEnabled !== false) playAlertChime();
        if (settings.notificationsEnabled && typeof Notification !== "undefined" && Notification.permission === "granted") {
          try { new Notification(a.label || "TimeFlow alarm", { body: formatTime(a.time, settings.clock24h) }); } catch {}
        }
        if (!repeats) {
          setAlarms((prev) => prev.map((x) => (x.id === a.id ? { ...x, firedOnce: true, enabled: false } : x)));
        }
      });
    };
    const t = setInterval(check, 15000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alarms, settings]);

  const requestNotificationPermission = async () => {
    if (typeof Notification === "undefined") {
      push("This browser does not support notifications.");
      return;
    }
    const perm = await Notification.requestPermission();
    setSettings((s) => ({ ...s, notificationsEnabled: perm === "granted" }));
    push(perm === "granted" ? "Notifications enabled." : "Notification permission was not granted.");
  };

  const theme = settings.theme === "light" ? "light" : "dark"; // "system" simplified to dark for prototype baseline

  if (!allLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-400 font-mono text-sm">
        Loading TimeFlow OS…
      </div>
    );
  }

  const NAV = [
    { id: "dashboard", label: "Dashboard", icon: LayoutGrid },
    { id: "calendar", label: "Calendar", icon: CalendarIcon },
    { id: "timetable", label: "Timetable", icon: Clock },
    { id: "tasks", label: "Tasks", icon: ListChecks },
    { id: "focus", label: "Focus", icon: Timer },
    { id: "goals", label: "Goals", icon: Target },
    { id: "habits", label: "Habits", icon: Repeat },
    { id: "alarms", label: "Alarms", icon: AlarmClock },
    { id: "notes", label: "Notes", icon: StickyNote },
    { id: "settings", label: "Settings", icon: SettingsIcon },
  ];

  const ctx = {
    tasks, setTasks, events, setEvents, blocks, setBlocks, alarms, setAlarms,
    goals, setGoals, habits, setHabits, notes, setNotes, settings, setSettings,
    focusSessions, setFocusSessions, now, push, setView,
  };

  return (
    <div className={theme === "light" ? "light" : ""}>
      <div className="min-h-screen bg-slate-950 text-slate-100 flex font-sans">
        {/* Desktop sidebar */}
        <aside className="hidden md:flex flex-col w-56 shrink-0 border-r border-slate-800 bg-slate-900/40 px-3 py-4">
          <div className="flex items-center gap-2 px-2 mb-6">
            <div className="w-8 h-8 rounded-lg bg-teal-500 flex items-center justify-center text-slate-950 font-bold font-mono">tf</div>
            <div>
              <div className="font-bold text-sm leading-none tracking-tight">TimeFlow OS</div>
              <div className="text-[10px] text-slate-500 font-mono">v0.1</div>
            </div>
          </div>
          <nav className="flex-1 flex flex-col gap-0.5">
            {NAV.map((n) => (
              <button
                key={n.id}
                onClick={() => setView(n.id)}
                className={`flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm font-medium transition-colors ${
                  view === n.id ? "bg-teal-500/15 text-teal-300" : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                }`}
              >
                <n.icon size={16} />
                {n.label}
              </button>
            ))}
          </nav>
          <div className="px-2.5 text-[10px] text-slate-600 font-mono">
            {DAY_NAMES_FULL[now.getDay()]} · {formatTime(`${pad(now.getHours())}:${pad(now.getMinutes())}`, settings.clock24h)}
          </div>
        </aside>

        {/* Mobile top bar */}
        <div className="md:hidden fixed top-0 inset-x-0 z-40 flex items-center justify-between px-4 h-14 bg-slate-900/90 backdrop-blur border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-teal-500 flex items-center justify-center text-slate-950 font-bold text-xs font-mono">tf</div>
            <span className="font-bold text-sm">TimeFlow OS</span>
          </div>
          <button onClick={() => setMobileNavOpen(true)} className="text-slate-300"><Menu size={20} /></button>
        </div>

        {mobileNavOpen && (
          <div className="md:hidden fixed inset-0 z-50 bg-slate-950/80" onClick={() => setMobileNavOpen(false)}>
            <div className="absolute right-0 top-0 bottom-0 w-64 bg-slate-900 border-l border-slate-800 p-4" onClick={(e) => e.stopPropagation()}>
              <div className="flex justify-end mb-4"><button onClick={() => setMobileNavOpen(false)}><X size={20} /></button></div>
              <nav className="flex flex-col gap-1">
                {NAV.map((n) => (
                  <button key={n.id} onClick={() => { setView(n.id); setMobileNavOpen(false); }}
                    className={`flex items-center gap-2.5 px-3 py-2.5 rounded-md text-sm font-medium ${view === n.id ? "bg-teal-500/15 text-teal-300" : "text-slate-400"}`}>
                    <n.icon size={16} />{n.label}
                  </button>
                ))}
              </nav>
            </div>
          </div>
        )}

        {/* Main content */}
        <main className="flex-1 min-w-0 pt-14 md:pt-0 pb-16 md:pb-0">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
            <div className="hidden md:flex items-center gap-2 mb-6">
              <div className="relative flex-1 max-w-sm">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input value={globalSearch} onChange={(e) => setGlobalSearch(e.target.value)}
                  placeholder="Search tasks, events, notes…" className={`${inputCls} pl-8`} />
              </div>
            </div>

            {globalSearch.trim() ? (
              <GlobalSearchResults query={globalSearch} ctx={ctx} onClear={() => setGlobalSearch("")} />
            ) : (
              <>
                {view === "dashboard" && <Dashboard ctx={ctx} />}
                {view === "calendar" && <CalendarView ctx={ctx} />}
                {view === "timetable" && <TimetableView ctx={ctx} />}
                {view === "tasks" && <TasksView ctx={ctx} />}
                {view === "focus" && <FocusView ctx={ctx} />}
                {view === "goals" && <GoalsView ctx={ctx} />}
                {view === "habits" && <HabitsView ctx={ctx} />}
                {view === "alarms" && <AlarmsView ctx={ctx} requestPermission={requestNotificationPermission} />}
                {view === "notes" && <NotesView ctx={ctx} />}
                {view === "settings" && <SettingsView ctx={ctx} />}
              </>
            )}
          </div>
        </main>

        {/* Mobile bottom nav */}
        <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-slate-900/95 backdrop-blur border-t border-slate-800 flex overflow-x-auto">
          {NAV.slice(0, 5).map((n) => (
            <button key={n.id} onClick={() => setView(n.id)}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-w-[64px] ${view === n.id ? "text-teal-300" : "text-slate-500"}`}>
              <n.icon size={18} />
              <span className="text-[10px]">{n.label}</span>
            </button>
          ))}
        </nav>

        <ToastStack toasts={toasts} dismiss={dismiss} />
      </div>
    </div>
  );
}

/* ========================================================================
   GLOBAL SEARCH
   ======================================================================== */

function GlobalSearchResults({ query, ctx, onClear }) {
  const q = query.toLowerCase();
  const { tasks, events, goals, habits, notes, blocks, alarms } = ctx;
  const match = (s) => (s || "").toLowerCase().includes(q);

  const results = {
    Tasks: tasks.filter((t) => match(t.title) || match(t.description)),
    Events: events.filter((e) => match(e.title) || match(e.location)),
    "Timetable blocks": blocks.filter((b) => match(b.title)),
    Alarms: alarms.filter((a) => match(a.label)),
    Goals: goals.filter((g) => match(g.title)),
    Habits: habits.filter((h) => match(h.title)),
    Notes: notes.filter((n) => match(n.title) || match(n.content)),
  };
  const totalCount = Object.values(results).reduce((a, r) => a + r.length, 0);

  return (
    <div>
      <PanelHeader eyebrow="Global Search" title={`Results for "${query}"`}
        action={<Btn variant="ghost" onClick={onClear}><X size={14} /> Clear</Btn>} />
      {totalCount === 0 && <EmptyState icon={Search} title="No matches" hint="Try a different keyword." />}
      <div className="space-y-5">
        {Object.entries(results).map(([group, items]) =>
          items.length > 0 ? (
            <div key={group}>
              <div className="text-xs font-mono uppercase tracking-wider text-slate-500 mb-2">{group} ({items.length})</div>
              <div className="space-y-1.5">
                {items.slice(0, 8).map((it) => (
                  <div key={it.id} className="rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm text-slate-200">
                    {it.title}
                  </div>
                ))}
              </div>
            </div>
          ) : null
        )}
      </div>
    </div>
  );
}

/* ========================================================================
   DASHBOARD
   ======================================================================== */

function DayRing({ pct }) {
  const r = 42, c = 2 * Math.PI * r;
  return (
    <svg width="110" height="110" viewBox="0 0 110 110" className="shrink-0">
      <circle cx="55" cy="55" r={r} stroke="#1E293B" strokeWidth="8" fill="none" />
      <circle cx="55" cy="55" r={r} stroke="#5EEAD4" strokeWidth="8" fill="none"
        strokeDasharray={c} strokeDashoffset={c - (pct / 100) * c} strokeLinecap="round"
        transform="rotate(-90 55 55)" />
      <text x="55" y="51" textAnchor="middle" className="fill-slate-100" style={{ fontSize: 18, fontFamily: "monospace", fontWeight: 700 }}>
        {Math.round(pct)}%
      </text>
      <text x="55" y="67" textAnchor="middle" className="fill-slate-500" style={{ fontSize: 9, fontFamily: "monospace" }}>
        DAY ELAPSED
      </text>
    </svg>
  );
}

function StatCard({ label, value, icon: Icon, tone = "slate" }) {
  const tones = {
    slate: "text-slate-300", teal: "text-teal-300", amber: "text-amber-300", rose: "text-rose-300",
  };
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] uppercase tracking-wide text-slate-500 font-mono">{label}</span>
        <Icon size={14} className={tones[tone]} />
      </div>
      <div className={`text-2xl font-bold font-mono ${tones[tone]}`}>{value}</div>
    </div>
  );
}

function Dashboard({ ctx }) {
  const { tasks, events, alarms, habits, goals, focusSessions, settings, now, setTasks, setView } = ctx;
  const tKey = todayKey();
  const todayTasks = tasks.filter((t) => t.dueDate === tKey && t.status !== "Completed" && t.status !== "Cancelled");
  const completedToday = tasks.filter((t) => t.status === "Completed" && t.completedOn === tKey).length;
  const highPriorityToday = todayTasks.filter((t) => t.priority === "Critical" || t.priority === "High");
  const overdue = tasks.filter((t) => t.dueDate && t.dueDate < tKey && t.status !== "Completed" && t.status !== "Cancelled");
  const todayEvents = events.filter((e) => e.date === tKey).sort((a, b) => (a.startTime || "").localeCompare(b.startTime || ""));
  const nextEvent = todayEvents.find((e) => e.startTime && minutesFromHHMM(e.startTime) >= now.getHours() * 60 + now.getMinutes());
  const enabledAlarms = alarms.filter((a) => a.enabled).sort((a, b) => a.time.localeCompare(b.time));
  const nextAlarm = enabledAlarms.find((a) => minutesFromHHMM(a.time) >= now.getHours() * 60 + now.getMinutes()) || enabledAlarms[0];
  const focusToday = focusSessions.filter((s) => s.date === tKey).reduce((sum, s) => sum + s.minutes, 0);
  const habitsToday = habits.filter((h) => h.frequency === "daily" || (h.frequency === "custom" && h.days?.includes(now.getDay())));
  const habitsDoneToday = habitsToday.filter((h) => h.completions?.includes(tKey)).length;
  const activeGoals = goals.filter((g) => (g.progress ?? 0) < 100).slice(0, 3);

  const conflicts = [];
  for (let i = 0; i < todayEvents.length; i++) {
    for (let j = i + 1; j < todayEvents.length; j++) {
      const a = todayEvents[i], b = todayEvents[j];
      if (a.startTime && a.endTime && b.startTime && b.endTime) {
        if (minutesFromHHMM(a.startTime) < minutesFromHHMM(b.endTime) && minutesFromHHMM(b.startTime) < minutesFromHHMM(a.endTime)) {
          conflicts.push([a, b]);
        }
      }
    }
  }

  const insights = [];
  if (highPriorityToday.length > 0) insights.push(`You have ${highPriorityToday.length} high-priority task${highPriorityToday.length > 1 ? "s" : ""} today.`);
  if (nextEvent) {
    const diff = minutesFromHHMM(nextEvent.startTime) - (now.getHours() * 60 + now.getMinutes());
    if (diff >= 0 && diff <= 60) insights.push(`"${nextEvent.title}" starts in ${diff} minute${diff === 1 ? "" : "s"}.`);
  }
  if (overdue.length > 0) insights.push(`You have ${overdue.length} overdue task${overdue.length > 1 ? "s" : ""}.`);
  if (conflicts.length > 0) insights.push(`Your schedule has ${conflicts.length} overlapping event${conflicts.length > 1 ? "s" : ""} today.`);

  const [quickTitle, setQuickTitle] = useState("");
  const addQuickTask = () => {
    if (!quickTitle.trim()) return;
    setTasks((p) => [...p, { id: uid(), title: quickTitle.trim(), status: "Planned", priority: "Medium", dueDate: tKey, category: "other", subtasks: [], createdAt: Date.now() }]);
    setQuickTitle("");
  };

  return (
    <div>
      <PanelHeader eyebrow={DAY_NAMES_FULL[now.getDay()]} title={`${MONTH_NAMES[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`}
        action={<div className="font-mono text-2xl font-bold text-teal-300 hidden sm:block">{formatTime(`${pad(now.getHours())}:${pad(now.getMinutes())}`, settings.clock24h)}</div>} />

      <div className="flex flex-col sm:flex-row gap-5 mb-6 items-start">
        <div className="flex items-center gap-4 rounded-xl border border-slate-800 bg-slate-900/60 px-5 py-4">
          <DayRing pct={dayProgressPct()} />
          <div className="space-y-1 text-sm">
            <div className="text-slate-400">Next event: <span className="text-slate-200 font-medium">{nextEvent ? `${nextEvent.title} @ ${formatTime(nextEvent.startTime, settings.clock24h)}` : "None scheduled"}</span></div>
            <div className="text-slate-400">Next alarm: <span className="text-slate-200 font-medium">{nextAlarm ? `${nextAlarm.label || "Alarm"} @ ${formatTime(nextAlarm.time, settings.clock24h)}` : "None set"}</span></div>
            <div className="text-slate-400">Focus today: <span className="text-slate-200 font-medium">{focusToday} min</span></div>
          </div>
        </div>

        <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-3 w-full">
          <StatCard label="Today" value={`${completedToday}/${completedToday + todayTasks.length}`} icon={CircleCheck} tone="teal" />
          <StatCard label="High priority" value={highPriorityToday.length} icon={AlertTriangle} tone="amber" />
          <StatCard label="Habits" value={`${habitsDoneToday}/${habitsToday.length}`} icon={Flame} tone="rose" />
          <StatCard label="Overdue" value={overdue.length} icon={Clock} tone="slate" />
        </div>
      </div>

      {insights.length > 0 && (
        <div className="mb-6 space-y-1.5">
          {insights.map((msg, i) => (
            <div key={i} className="text-sm text-slate-300 bg-slate-900/60 border border-slate-800 rounded-md px-3 py-2 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-teal-400 shrink-0" /> {msg}
            </div>
          ))}
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-5">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <PanelHeader title="Today's tasks" />
          <div className="flex gap-2 mb-3">
            <input value={quickTitle} onChange={(e) => setQuickTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addQuickTask()}
              placeholder="Quick-add a task for today…" className={inputCls} />
            <Btn onClick={addQuickTask}><Plus size={14} /></Btn>
          </div>
          {todayTasks.length === 0 ? <EmptyState icon={ListChecks} title="Nothing due today" /> : (
            <div className="space-y-1.5">
              {todayTasks.slice(0, 6).map((t) => (
                <div key={t.id} className="flex items-center gap-2 text-sm px-2 py-1.5 rounded-md hover:bg-slate-800/60">
                  <button onClick={() => setTasks((p) => p.map((x) => x.id === t.id ? { ...x, status: "Completed", completedOn: tKey } : x))}
                    className="text-slate-500 hover:text-teal-400"><Circle size={15} /></button>
                  <span className="flex-1 text-slate-200">{t.title}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border ${PRIORITY_STYLES[t.priority]}`}>{t.priority}</span>
                </div>
              ))}
            </div>
          )}
          <button onClick={() => setView("tasks")} className="text-xs text-teal-400 mt-2 hover:underline">View all tasks →</button>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <PanelHeader title="Today's schedule" />
          {todayEvents.length === 0 ? <EmptyState icon={CalendarIcon} title="No events today" /> : (
            <div className="space-y-1.5">
              {todayEvents.slice(0, 6).map((e) => (
                <div key={e.id} className="flex items-center gap-2 text-sm px-2 py-1.5 rounded-md">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: CATEGORY_COLORS[e.category] || CATEGORY_COLORS.other }} />
                  <span className="text-slate-500 font-mono text-xs w-16 shrink-0">{e.allDay ? "All day" : formatTime(e.startTime, settings.clock24h)}</span>
                  <span className="flex-1 text-slate-200 truncate">{e.title}</span>
                </div>
              ))}
            </div>
          )}
          <button onClick={() => setView("calendar")} className="text-xs text-teal-400 mt-2 hover:underline">Open calendar →</button>
        </div>
      </div>

      {activeGoals.length > 0 && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 mt-5">
          <PanelHeader title="Goal progress" />
          <div className="space-y-3">
            {activeGoals.map((g) => (
              <div key={g.id}>
                <div className="flex justify-between text-sm mb-1"><span className="text-slate-200">{g.title}</span><span className="text-slate-500 font-mono text-xs">{g.progress ?? 0}%</span></div>
                <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden"><div className="h-full bg-teal-400" style={{ width: `${g.progress ?? 0}%` }} /></div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ========================================================================
   CALENDAR
   ======================================================================== */

function CalendarView({ ctx }) {
  const { events, setEvents, settings, now } = ctx;
  const [cursor, setCursor] = useState(new Date(now.getFullYear(), now.getMonth(), 1));
  const [selectedDay, setSelectedDay] = useState(toDateKey(now));
  const [modalEvent, setModalEvent] = useState(null); // null = closed, {} = new, obj = edit
  const [confirmDel, setConfirmDel] = useState(null);

  const year = cursor.getFullYear(), month = cursor.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const startOffset = firstOfMonth.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));

  const eventsByDay = useMemo(() => {
    const map = {};
    events.forEach((e) => { (map[e.date] = map[e.date] || []).push(e); });
    Object.values(map).forEach((list) => list.sort((a, b) => (a.startTime || "").localeCompare(b.startTime || "")));
    return map;
  }, [events]);

  const dayEvents = eventsByDay[selectedDay] || [];
  const conflictIds = useMemo(() => {
    const set = new Set();
    for (let i = 0; i < dayEvents.length; i++) for (let j = i + 1; j < dayEvents.length; j++) {
      const a = dayEvents[i], b = dayEvents[j];
      if (a.startTime && a.endTime && b.startTime && b.endTime &&
        minutesFromHHMM(a.startTime) < minutesFromHHMM(b.endTime) && minutesFromHHMM(b.startTime) < minutesFromHHMM(a.endTime)) {
        set.add(a.id); set.add(b.id);
      }
    }
    return set;
  }, [dayEvents]);

  const saveEvent = (data) => {
    if (data.id) setEvents((p) => p.map((e) => e.id === data.id ? data : e));
    else setEvents((p) => [...p, { ...data, id: uid() }]);
    setModalEvent(null);
  };

  return (
    <div>
      <PanelHeader eyebrow="Calendar" title={`${MONTH_NAMES[month]} ${year}`}
        action={
          <div className="flex items-center gap-1">
            <Btn variant="ghost" onClick={() => setCursor(new Date(year, month - 1, 1))}><ChevronLeft size={16} /></Btn>
            <Btn variant="secondary" onClick={() => { setCursor(new Date(now.getFullYear(), now.getMonth(), 1)); setSelectedDay(toDateKey(now)); }}>Today</Btn>
            <Btn variant="ghost" onClick={() => setCursor(new Date(year, month + 1, 1))}><ChevronRight size={16} /></Btn>
          </div>
        } />

      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-mono uppercase text-slate-500 mb-1">
        {DAY_NAMES.map((d) => <div key={d}>{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1 mb-6">
        {cells.map((d, i) => {
          if (!d) return <div key={i} />;
          const key = toDateKey(d);
          const isToday = key === toDateKey(now);
          const isSelected = key === selectedDay;
          const dayList = eventsByDay[key] || [];
          return (
            <button key={i} onClick={() => setSelectedDay(key)}
              className={`aspect-square rounded-md p-1 text-left flex flex-col border transition-colors ${
                isSelected ? "border-teal-500 bg-teal-500/10" : isToday ? "border-slate-600 bg-slate-800/50" : "border-slate-800 hover:bg-slate-800/40"
              }`}>
              <span className={`text-xs font-mono ${isToday ? "text-teal-300 font-bold" : "text-slate-400"}`}>{d.getDate()}</span>
              <div className="flex flex-wrap gap-0.5 mt-auto">
                {dayList.slice(0, 3).map((e) => <span key={e.id} className="w-1.5 h-1.5 rounded-full" style={{ background: CATEGORY_COLORS[e.category] || CATEGORY_COLORS.other }} />)}
              </div>
            </button>
          );
        })}
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <PanelHeader title={selectedDay} action={<Btn onClick={() => setModalEvent({ date: selectedDay, category: "other" })}><Plus size={14} />Add event</Btn>} />
        {dayEvents.length === 0 ? <EmptyState icon={CalendarIcon} title="No events this day" /> : (
          <div className="space-y-2">
            {dayEvents.map((e) => (
              <div key={e.id} className={`flex items-center gap-3 rounded-md border px-3 py-2 ${conflictIds.has(e.id) ? "border-rose-500/40 bg-rose-500/5" : "border-slate-800"}`}>
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: CATEGORY_COLORS[e.category] || CATEGORY_COLORS.other }} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-slate-200 font-medium truncate flex items-center gap-2">
                    {e.title}
                    {conflictIds.has(e.id) && <span className="text-[10px] text-rose-300 flex items-center gap-0.5"><AlertTriangle size={10} />conflict</span>}
                  </div>
                  <div className="text-xs text-slate-500 font-mono">
                    {e.allDay ? "All day" : `${formatTime(e.startTime, settings.clock24h)} – ${formatTime(e.endTime, settings.clock24h)}`}
                    {e.location ? ` · ${e.location}` : ""}
                  </div>
                </div>
                <button onClick={() => setModalEvent(e)} className="text-xs text-slate-400 hover:text-teal-300">Edit</button>
                <button onClick={() => setConfirmDel(e.id)} className="text-slate-500 hover:text-rose-400"><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        )}
      </div>

      {modalEvent && <EventModal event={modalEvent} onSave={saveEvent} onClose={() => setModalEvent(null)} />}
      {confirmDel && <ConfirmDialog title="Delete event" message="This event will be permanently removed. This cannot be undone."
        onCancel={() => setConfirmDel(null)} onConfirm={() => { setEvents((p) => p.filter((e) => e.id !== confirmDel)); setConfirmDel(null); }} />}
    </div>
  );
}

function EventModal({ event, onSave, onClose }) {
  const [form, setForm] = useState({
    title: "", date: event.date, startTime: "09:00", endTime: "10:00", allDay: false,
    category: "other", location: "", description: "", attendees: "", recurring: false, ...event,
  });
  return (
    <Modal title={event.id ? "Edit event" : "New event"} onClose={onClose} wide>
      <Field label="Title"><input className={inputCls} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Event title" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date"><input type="date" className={inputCls} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
        <Field label="Category">
          <select className={inputCls} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {CATEGORY_LIST.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-300 mb-3">
        <input type="checkbox" checked={form.allDay} onChange={(e) => setForm({ ...form, allDay: e.target.checked })} /> All-day event
      </label>
      {!form.allDay && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start time"><input type="time" className={inputCls} value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} /></Field>
          <Field label="End time"><input type="time" className={inputCls} value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} /></Field>
        </div>
      )}
      <Field label="Location"><input className={inputCls} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></Field>
      <Field label="Attendees"><input className={inputCls} value={form.attendees} onChange={(e) => setForm({ ...form, attendees: e.target.value })} placeholder="Comma-separated names" /></Field>
      <Field label="Description"><textarea className={inputCls} rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
      <label className="flex items-center gap-2 text-sm text-slate-300 mb-4">
        <input type="checkbox" checked={form.recurring} onChange={(e) => setForm({ ...form, recurring: e.target.checked })} /> Repeats weekly on this weekday
      </label>
      <div className="flex justify-end gap-2">
        <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
        <Btn onClick={() => form.title.trim() && onSave(form)}>Save event</Btn>
      </div>
    </Modal>
  );
}

/* ========================================================================
   TIMETABLE (weekly recurring blocks / time blocking)
   ======================================================================== */

const HOURS = Array.from({ length: 18 }, (_, i) => i + 5); // 5am - 10pm

function TimetableView({ ctx }) {
  const { blocks, setBlocks } = ctx;
  const [modal, setModal] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);

  const byDay = useMemo(() => {
    const map = Array.from({ length: 7 }, () => []);
    blocks.forEach((b) => { if (b.enabled !== false) map[b.day].push(b); });
    return map;
  }, [blocks]);

  const conflictSet = useMemo(() => {
    const set = new Set();
    byDay.forEach((list) => {
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        if (minutesFromHHMM(a.start) < minutesFromHHMM(b.end) && minutesFromHHMM(b.start) < minutesFromHHMM(a.end)) {
          set.add(a.id); set.add(b.id);
        }
      }
    });
    return set;
  }, [byDay]);

  const save = (data) => {
    if (data.id) setBlocks((p) => p.map((b) => b.id === data.id ? data : b));
    else setBlocks((p) => [...p, { ...data, id: uid(), enabled: true }]);
    setModal(null);
  };

  return (
    <div>
      <PanelHeader eyebrow="Weekly Routine" title="Timetable"
        action={<Btn onClick={() => setModal({ day: 1, start: "09:00", end: "10:00", category: "work" })}><Plus size={14} />Add block</Btn>} />

      <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/60">
        <div className="grid grid-cols-[48px_repeat(7,minmax(96px,1fr))] min-w-[760px]">
          <div />
          {DAY_NAMES.map((d) => <div key={d} className="text-center text-xs font-mono uppercase text-slate-400 py-2 border-b border-l border-slate-800">{d}</div>)}
          {HOURS.map((h) => (
            <React.Fragment key={h}>
              <div className="text-right pr-1 text-[10px] text-slate-600 font-mono border-b border-slate-800 pt-1">{pad(h)}:00</div>
              {DAY_NAMES.map((_, dayIdx) => {
                const block = byDay[dayIdx].find((b) => minutesFromHHMM(b.start) <= h * 60 && minutesFromHHMM(b.end) > h * 60);
                const isStart = block && Math.floor(minutesFromHHMM(block.start) / 60) === h;
                return (
                  <div key={dayIdx} className="border-b border-l border-slate-800 h-9 relative">
                    {block && isStart && (
                      <button onClick={() => setModal(block)}
                        className={`absolute inset-x-0.5 top-0.5 rounded px-1 text-[10px] text-slate-950 font-medium overflow-hidden text-left ${conflictSet.has(block.id) ? "ring-2 ring-rose-400" : ""}`}
                        style={{ background: CATEGORY_COLORS[block.category] || CATEGORY_COLORS.other, height: `${Math.max(1, (minutesFromHHMM(block.end) - minutesFromHHMM(block.start)) / 60) * 36 - 2}px` }}>
                        {block.title}
                      </button>
                    )}
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>

      <div className="mt-5">
        <PanelHeader title="All blocks" />
        {blocks.length === 0 ? <EmptyState icon={Clock} title="No recurring blocks yet" hint="Add classes, work, study, exercise, meals, sleep or custom routines." /> : (
          <div className="space-y-1.5">
            {blocks.map((b) => (
              <div key={b.id} className="flex items-center gap-3 rounded-md border border-slate-800 px-3 py-2 text-sm">
                <span className="w-2 h-2 rounded-full" style={{ background: CATEGORY_COLORS[b.category] }} />
                <span className="text-slate-200 flex-1">{b.title}</span>
                <span className="text-xs text-slate-500 font-mono">{DAY_NAMES[b.day]} {formatTime(b.start, ctx.settings.clock24h)}–{formatTime(b.end, ctx.settings.clock24h)}</span>
                <button onClick={() => setBlocks((p) => p.map((x) => x.id === b.id ? { ...x, enabled: x.enabled === false ? true : false } : x))}
                  className="text-xs text-slate-400 hover:text-teal-300">{b.enabled === false ? "Enable" : "Disable"}</button>
                <button onClick={() => setBlocks((p) => [...p, { ...b, id: uid() }])} className="text-xs text-slate-400 hover:text-teal-300">Duplicate</button>
                <button onClick={() => setConfirmDel(b.id)} className="text-slate-500 hover:text-rose-400"><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        )}
      </div>

      {modal && <BlockModal block={modal} onSave={save} onClose={() => setModal(null)} />}
      {confirmDel && <ConfirmDialog title="Delete block" message="This recurring block will be removed."
        onCancel={() => setConfirmDel(null)} onConfirm={() => { setBlocks((p) => p.filter((b) => b.id !== confirmDel)); setConfirmDel(null); }} />}
    </div>
  );
}

function BlockModal({ block, onSave, onClose }) {
  const [form, setForm] = useState({ title: "", ...block });
  return (
    <Modal title={block.id ? "Edit block" : "New time block"} onClose={onClose}>
      <Field label="Title"><input className={inputCls} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Deep work" /></Field>
      <Field label="Day">
        <select className={inputCls} value={form.day} onChange={(e) => setForm({ ...form, day: Number(e.target.value) })}>
          {DAY_NAMES_FULL.map((d, i) => <option key={d} value={i}>{d}</option>)}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Start"><input type="time" className={inputCls} value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} /></Field>
        <Field label="End"><input type="time" className={inputCls} value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} /></Field>
      </div>
      <Field label="Category">
        <select className={inputCls} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
          {CATEGORY_LIST.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </Field>
      <div className="flex justify-end gap-2 mt-2">
        <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
        <Btn onClick={() => form.title.trim() && form.end > form.start && onSave(form)}>Save block</Btn>
      </div>
    </Modal>
  );
}

/* ========================================================================
   TASKS
   ======================================================================== */

function TasksView({ ctx }) {
  const { tasks, setTasks, goals, habits } = ctx;
  const [modal, setModal] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [filterStatus, setFilterStatus] = useState("All");
  const [filterPriority, setFilterPriority] = useState("All");
  const [sortBy, setSortBy] = useState("due");

  const tKey = todayKey();
  let list = tasks.filter((t) => (filterStatus === "All" || t.status === filterStatus) && (filterPriority === "All" || t.priority === filterPriority));
  list = [...list].sort((a, b) => {
    if (sortBy === "due") return (a.dueDate || "9999").localeCompare(b.dueDate || "9999");
    if (sortBy === "priority") { const order = { Critical: 0, High: 1, Medium: 2, Low: 3 }; return order[a.priority] - order[b.priority]; }
    return (b.createdAt || 0) - (a.createdAt || 0);
  });

  const save = (data) => {
    if (data.id) setTasks((p) => p.map((t) => t.id === data.id ? data : t));
    else setTasks((p) => [...p, { ...data, id: uid(), createdAt: Date.now(), subtasks: data.subtasks || [] }]);
    setModal(null);
  };

  const toggleComplete = (t) => {
    setTasks((p) => p.map((x) => x.id === t.id ? { ...x, status: x.status === "Completed" ? "Planned" : "Completed", completedOn: x.status === "Completed" ? undefined : tKey } : x));
  };

  return (
    <div>
      <PanelHeader eyebrow="Tasks" title="Task manager" action={<Btn onClick={() => setModal({ status: "Planned", priority: "Medium", category: "other", subtasks: [] })}><Plus size={14} />New task</Btn>} />

      <div className="flex flex-wrap gap-2 mb-4">
        <select className={`${inputCls} w-auto`} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          {["All", "Inbox", "Planned", "In progress", "Completed", "Cancelled"].map((s) => <option key={s}>{s}</option>)}
        </select>
        <select className={`${inputCls} w-auto`} value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)}>
          {["All", "Critical", "High", "Medium", "Low"].map((s) => <option key={s}>{s}</option>)}
        </select>
        <select className={`${inputCls} w-auto`} value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
          <option value="due">Sort: Due date</option>
          <option value="priority">Sort: Priority</option>
          <option value="created">Sort: Newest</option>
        </select>
      </div>

      {list.length === 0 ? <EmptyState icon={ListChecks} title="No tasks match these filters" /> : (
        <div className="space-y-2">
          {list.map((t) => {
            const overdue = t.dueDate && t.dueDate < tKey && t.status !== "Completed" && t.status !== "Cancelled";
            return (
              <div key={t.id} className={`rounded-lg border px-3 py-2.5 ${overdue ? "border-rose-500/30 bg-rose-500/5" : "border-slate-800 bg-slate-900/60"}`}>
                <div className="flex items-start gap-2.5">
                  <button onClick={() => toggleComplete(t)} className={`mt-0.5 ${t.status === "Completed" ? "text-teal-400" : "text-slate-500 hover:text-teal-400"}`}>
                    {t.status === "Completed" ? <CircleCheck size={17} /> : <Circle size={17} />}
                  </button>
                  <div className="flex-1 min-w-0" onClick={() => setModal(t)}>
                    <div className={`text-sm font-medium cursor-pointer ${t.status === "Completed" ? "line-through text-slate-500" : "text-slate-200"}`}>{t.title}</div>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border ${PRIORITY_STYLES[t.priority]}`}>{t.priority}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded border border-slate-700 text-slate-400">{t.status}</span>
                      {t.dueDate && <span className={`text-[10px] font-mono ${overdue ? "text-rose-300" : "text-slate-500"}`}>{overdue ? "Overdue · " : ""}{t.dueDate}{t.dueTime ? ` ${t.dueTime}` : ""}</span>}
                      {t.subtasks?.length > 0 && <span className="text-[10px] text-slate-500">{t.subtasks.filter((s) => s.done).length}/{t.subtasks.length} subtasks</span>}
                    </div>
                  </div>
                  <button onClick={() => setConfirmDel(t.id)} className="text-slate-500 hover:text-rose-400 mt-0.5"><Trash2 size={14} /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modal && <TaskModal task={modal} goals={goals} habits={habits} onSave={save} onClose={() => setModal(null)} />}
      {confirmDel && <ConfirmDialog title="Delete task" message="This task and its subtasks will be permanently deleted."
        onCancel={() => setConfirmDel(null)} onConfirm={() => { setTasks((p) => p.filter((t) => t.id !== confirmDel)); setConfirmDel(null); }} />}
    </div>
  );
}

function TaskModal({ task, goals, habits, onSave, onClose }) {
  const [form, setForm] = useState({ title: "", description: "", dueDate: "", dueTime: "", priority: "Medium", category: "other", status: "Planned", subtasks: [], notes: "", goalId: "", habitId: "", ...task });
  const [subInput, setSubInput] = useState("");

  const addSub = () => { if (!subInput.trim()) return; setForm({ ...form, subtasks: [...(form.subtasks || []), { id: uid(), title: subInput.trim(), done: false }] }); setSubInput(""); };
  const toggleSub = (id) => setForm({ ...form, subtasks: form.subtasks.map((s) => s.id === id ? { ...s, done: !s.done } : s) });
  const removeSub = (id) => setForm({ ...form, subtasks: form.subtasks.filter((s) => s.id !== id) });

  return (
    <Modal title={task.id ? "Edit task" : "New task"} onClose={onClose} wide>
      <Field label="Title"><input className={inputCls} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="What needs to get done?" /></Field>
      <Field label="Description"><textarea className={inputCls} rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Due date"><input type="date" className={inputCls} value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></Field>
        <Field label="Due time"><input type="time" className={inputCls} value={form.dueTime} onChange={(e) => setForm({ ...form, dueTime: e.target.value })} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Priority">
          <select className={inputCls} value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
            {["Critical", "High", "Medium", "Low"].map((p) => <option key={p}>{p}</option>)}
          </select>
        </Field>
        <Field label="Status">
          <select className={inputCls} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            {["Inbox", "Planned", "In progress", "Completed", "Cancelled"].map((s) => <option key={s}>{s}</option>)}
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Category">
          <select className={inputCls} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {CATEGORY_LIST.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Linked goal">
          <select className={inputCls} value={form.goalId || ""} onChange={(e) => setForm({ ...form, goalId: e.target.value })}>
            <option value="">None</option>
            {goals.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Subtasks">
        <div className="space-y-1 mb-2">
          {(form.subtasks || []).map((s) => (
            <div key={s.id} className="flex items-center gap-2 text-sm">
              <button onClick={() => toggleSub(s.id)} className={s.done ? "text-teal-400" : "text-slate-500"}>{s.done ? <CircleCheck size={14} /> : <Circle size={14} />}</button>
              <span className={`flex-1 ${s.done ? "line-through text-slate-500" : "text-slate-300"}`}>{s.title}</span>
              <button onClick={() => removeSub(s.id)} className="text-slate-600 hover:text-rose-400"><X size={12} /></button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input className={inputCls} value={subInput} onChange={(e) => setSubInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addSub())} placeholder="Add a subtask" />
          <Btn variant="secondary" onClick={addSub}><Plus size={14} /></Btn>
        </div>
      </Field>
      <Field label="Notes"><textarea className={inputCls} rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
      <div className="flex justify-end gap-2 mt-2">
        <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
        <Btn onClick={() => form.title.trim() && onSave(form)}>Save task</Btn>
      </div>
    </Modal>
  );
}

/* ========================================================================
   FOCUS (Pomodoro / Stopwatch / Countdown)
   ======================================================================== */

function useTicker(active, onTick, intervalMs = 1000) {
  const savedCallback = useRef(onTick);
  useEffect(() => { savedCallback.current = onTick; }, [onTick]);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => savedCallback.current(), intervalMs);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, intervalMs]);
}

/* ---------------------------------------------------------------------- */
/*  Sound engine (Web Audio API — no external audio files, works offline) */
/* ---------------------------------------------------------------------- */

let sharedAudioCtx = null;
function getAudioCtx() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!sharedAudioCtx) sharedAudioCtx = new Ctx();
  if (sharedAudioCtx.state === "suspended") sharedAudioCtx.resume();
  return sharedAudioCtx;
}

/* Mobile/desktop browsers block audio until a real user gesture has
   happened at least once. Call this from any click/tap early on so
   later programmatic sounds (alarms firing on a timer) are allowed to play. */
function unlockAudio() {
  const ctx = getAudioCtx();
  if (ctx && ctx.state === "suspended") ctx.resume();
}

function playTone(freq = 880, startAt = 0, duration = 0.16, gainPeak = 0.22) {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const t0 = ctx.currentTime + startAt;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(freq, t0);
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(gainPeak, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

/* A short, distinct three-beep pattern for alarms/timers going off. */
function playAlertChime() {
  playTone(880, 0, 0.16);
  playTone(880, 0.22, 0.16);
  playTone(1175, 0.44, 0.24);
}


function FocusView({ ctx }) {
  const { settings, tasks, focusSessions, setFocusSessions, push } = ctx;
  const [mode, setMode] = useState("pomodoro");
  const [linkedTask, setLinkedTask] = useState("");

  /* ---- Pomodoro ---- */
  const [pomoPhase, setPomoPhase] = useState("focus"); // focus | short | long
  const [pomoCycles, setPomoCycles] = useState(0);
  const [pomoSecondsLeft, setPomoSecondsLeft] = useState(settings.defaultFocusMinutes * 60);
  const [pomoRunning, setPomoRunning] = useState(false);

  const phaseMinutes = { focus: settings.defaultFocusMinutes, short: settings.defaultShortBreak, long: settings.defaultLongBreak };

  useTicker(pomoRunning, () => {
    setPomoSecondsLeft((s) => {
      if (s <= 1) {
        setPomoRunning(false);
        if (pomoPhase === "focus") {
          logSession(settings.defaultFocusMinutes, "pomodoro-focus");
          const nextCycles = pomoCycles + 1;
          setPomoCycles(nextCycles);
          const nextPhase = nextCycles % 4 === 0 ? "long" : "short";
          setPomoPhase(nextPhase);
          setPomoSecondsLeft(phaseMinutes[nextPhase] * 60);
          push(`Focus session complete. Time for a ${nextPhase === "long" ? "long" : "short"} break.`);
          if (settings.soundEnabled !== false) playAlertChime();
        } else {
          setPomoPhase("focus");
          setPomoSecondsLeft(phaseMinutes.focus * 60);
          push("Break's over. Ready for another focus session.");
          if (settings.soundEnabled !== false) playAlertChime();
        }
        return 0;
      }
      return s - 1;
    });
  });

  const logSession = (minutes, type) => {
    setFocusSessions((p) => [...p, { id: uid(), date: todayKey(), minutes, type, taskId: linkedTask || null, endedAt: Date.now() }]);
  };

  const resetPomo = () => { setPomoRunning(false); setPomoPhase("focus"); setPomoCycles(0); setPomoSecondsLeft(settings.defaultFocusMinutes * 60); };

  /* ---- Stopwatch ---- */
  const [swSeconds, setSwSeconds] = useState(0);
  const [swRunning, setSwRunning] = useState(false);
  const [laps, setLaps] = useState([]);
  useTicker(swRunning, () => setSwSeconds((s) => s + 1));

  /* ---- Countdown ---- */
  const [cdInputMinutes, setCdInputMinutes] = useState(10);
  const [cdSecondsLeft, setCdSecondsLeft] = useState(10 * 60);
  const [cdRunning, setCdRunning] = useState(false);
  useTicker(cdRunning, () => setCdSecondsLeft((s) => {
    if (s <= 1) { setCdRunning(false); push("Countdown complete."); if (settings.soundEnabled !== false) playAlertChime(); logSession(cdInputMinutes, "countdown"); return 0; }
    return s - 1;
  }));

  const fmt = (totalSeconds) => `${pad(Math.floor(totalSeconds / 60))}:${pad(totalSeconds % 60)}`;

  const todayMinutes = focusSessions.filter((s) => s.date === todayKey()).reduce((a, s) => a + s.minutes, 0);
  const totalSessions = focusSessions.length;

  return (
    <div>
      <PanelHeader eyebrow="Focus System" title="Focus center" />

      <div className="flex gap-2 mb-5">
        {["pomodoro", "stopwatch", "countdown"].map((m) => (
          <button key={m} onClick={() => setMode(m)} className={`px-3 py-1.5 rounded-md text-sm font-medium capitalize ${mode === m ? "bg-teal-500 text-slate-950" : "bg-slate-800 text-slate-300"}`}>{m}</button>
        ))}
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 flex flex-col items-center">
        {mode === "pomodoro" && (
          <>
            <div className="text-xs font-mono uppercase tracking-widest text-slate-500 mb-2">{pomoPhase === "focus" ? "Focus" : pomoPhase === "short" ? "Short break" : "Long break"} · Cycle {pomoCycles}</div>
            <div className="text-6xl font-mono font-bold text-teal-300 mb-4">{fmt(pomoSecondsLeft)}</div>
            <div className="flex gap-2">
              <Btn onClick={() => setPomoRunning((r) => !r)}>{pomoRunning ? <Pause size={15} /> : <Play size={15} />} {pomoRunning ? "Pause" : "Start"}</Btn>
              <Btn variant="secondary" onClick={resetPomo}><RotateCcw size={15} />Reset</Btn>
            </div>
          </>
        )}
        {mode === "stopwatch" && (
          <>
            <div className="text-6xl font-mono font-bold text-teal-300 mb-4">{fmt(swSeconds)}</div>
            <div className="flex gap-2 mb-3">
              <Btn onClick={() => setSwRunning((r) => !r)}>{swRunning ? <Pause size={15} /> : <Play size={15} />} {swRunning ? "Pause" : "Start"}</Btn>
              <Btn variant="secondary" onClick={() => swRunning && setLaps((l) => [fmt(swSeconds), ...l])} disabled={!swRunning}>Lap</Btn>
              <Btn variant="secondary" onClick={() => { setSwRunning(false); setSwSeconds(0); setLaps([]); if (swSeconds >= 60) logSession(Math.round(swSeconds / 60), "stopwatch"); }}><RotateCcw size={15} />Reset</Btn>
            </div>
            {laps.length > 0 && <div className="text-xs font-mono text-slate-400 space-y-0.5 max-h-24 overflow-y-auto">{laps.map((l, i) => <div key={i}>Lap {laps.length - i}: {l}</div>)}</div>}
          </>
        )}
        {mode === "countdown" && (
          <>
            {!cdRunning && cdSecondsLeft === cdInputMinutes * 60 && (
              <Field label="Duration (minutes)"><input type="number" min={1} className={inputCls} value={cdInputMinutes}
                onChange={(e) => { const v = Number(e.target.value) || 1; setCdInputMinutes(v); setCdSecondsLeft(v * 60); }} /></Field>
            )}
            <div className="text-6xl font-mono font-bold text-teal-300 mb-4">{fmt(cdSecondsLeft)}</div>
            <div className="flex gap-2">
              <Btn onClick={() => setCdRunning((r) => !r)} disabled={cdSecondsLeft === 0}>{cdRunning ? <Pause size={15} /> : <Play size={15} />} {cdRunning ? "Pause" : "Start"}</Btn>
              <Btn variant="secondary" onClick={() => { setCdRunning(false); setCdSecondsLeft(cdInputMinutes * 60); }}><RotateCcw size={15} />Reset</Btn>
            </div>
          </>
        )}

        <div className="w-full max-w-xs mt-5">
          <Field label="Associate with a task (optional)">
            <select className={inputCls} value={linkedTask} onChange={(e) => setLinkedTask(e.target.value)}>
              <option value="">None</option>
              {tasks.filter((t) => t.status !== "Completed").map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
            </select>
          </Field>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mt-5">
        <StatCard label="Focus today" value={`${todayMinutes}m`} icon={Timer} tone="teal" />
        <StatCard label="Sessions logged" value={totalSessions} icon={ListChecks} tone="slate" />
      </div>
    </div>
  );
}

/* ========================================================================
   GOALS
   ======================================================================== */

const GOAL_LEVELS = ["Vision", "Long-term", "Yearly", "Monthly", "Weekly", "Daily"];

function GoalsView({ ctx }) {
  const { goals, setGoals } = ctx;
  const [modal, setModal] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);

  const save = (data) => {
    if (data.id) setGoals((p) => p.map((g) => g.id === data.id ? data : g));
    else setGoals((p) => [...p, { ...data, id: uid(), milestones: data.milestones || [], progress: data.progress ?? 0 }]);
    setModal(null);
  };

  const grouped = GOAL_LEVELS.map((level) => ({ level, items: goals.filter((g) => g.level === level) }));

  return (
    <div>
      <PanelHeader eyebrow="Goal Hierarchy" title="Goals" action={<Btn onClick={() => setModal({ level: "Weekly", progress: 0, milestones: [] })}><Plus size={14} />New goal</Btn>} />
      {goals.length === 0 && <EmptyState icon={Target} title="No goals yet" hint="Build from Vision down to Daily Action." />}
      <div className="space-y-6">
        {grouped.filter((g) => g.items.length > 0).map(({ level, items }) => (
          <div key={level}>
            <div className="text-xs font-mono uppercase tracking-wider text-slate-500 mb-2">{level}</div>
            <div className="space-y-2">
              {items.map((g) => (
                <div key={g.id} className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 cursor-pointer" onClick={() => setModal(g)}>
                  <div className="flex justify-between items-start mb-1.5">
                    <div className="text-sm font-medium text-slate-200">{g.title}</div>
                    <button onClick={(e) => { e.stopPropagation(); setConfirmDel(g.id); }} className="text-slate-500 hover:text-rose-400"><Trash2 size={13} /></button>
                  </div>
                  {g.deadline && <div className="text-xs text-slate-500 font-mono mb-1.5">Due {g.deadline}</div>}
                  <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden"><div className="h-full bg-teal-400" style={{ width: `${g.progress}%` }} /></div>
                  {g.milestones?.length > 0 && <div className="text-[11px] text-slate-500 mt-1">{g.milestones.filter((m) => m.done).length}/{g.milestones.length} milestones</div>}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      {modal && <GoalModal goal={modal} onSave={save} onClose={() => setModal(null)} />}
      {confirmDel && <ConfirmDialog title="Delete goal" message="This goal and its milestones will be removed."
        onCancel={() => setConfirmDel(null)} onConfirm={() => { setGoals((p) => p.filter((g) => g.id !== confirmDel)); setConfirmDel(null); }} />}
    </div>
  );
}

function GoalModal({ goal, onSave, onClose }) {
  const [form, setForm] = useState({ title: "", description: "", level: "Weekly", deadline: "", progress: 0, priority: "Medium", category: "other", milestones: [], ...goal });
  const [msInput, setMsInput] = useState("");
  const addMs = () => { if (!msInput.trim()) return; setForm({ ...form, milestones: [...form.milestones, { id: uid(), title: msInput.trim(), done: false }] }); setMsInput(""); };
  const toggleMs = (id) => setForm({ ...form, milestones: form.milestones.map((m) => m.id === id ? { ...m, done: !m.done } : m) });

  return (
    <Modal title={goal.id ? "Edit goal" : "New goal"} onClose={onClose} wide>
      <Field label="Title"><input className={inputCls} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
      <Field label="Description"><textarea className={inputCls} rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Level">
          <select className={inputCls} value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })}>{GOAL_LEVELS.map((l) => <option key={l}>{l}</option>)}</select>
        </Field>
        <Field label="Deadline"><input type="date" className={inputCls} value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} /></Field>
      </div>
      <Field label={`Progress: ${form.progress}%`}><input type="range" min={0} max={100} value={form.progress} onChange={(e) => setForm({ ...form, progress: Number(e.target.value) })} className="w-full accent-teal-500" /></Field>
      <Field label="Milestones">
        <div className="space-y-1 mb-2">
          {form.milestones.map((m) => (
            <div key={m.id} className="flex items-center gap-2 text-sm">
              <button onClick={() => toggleMs(m.id)} className={m.done ? "text-teal-400" : "text-slate-500"}>{m.done ? <CircleCheck size={14} /> : <Circle size={14} />}</button>
              <span className={`flex-1 ${m.done ? "line-through text-slate-500" : "text-slate-300"}`}>{m.title}</span>
            </div>
          ))}
        </div>
        <div className="flex gap-2"><input className={inputCls} value={msInput} onChange={(e) => setMsInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addMs())} placeholder="Add a milestone" /><Btn variant="secondary" onClick={addMs}><Plus size={14} /></Btn></div>
      </Field>
      <div className="flex justify-end gap-2 mt-2">
        <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
        <Btn onClick={() => form.title.trim() && onSave(form)}>Save goal</Btn>
      </div>
    </Modal>
  );
}

/* ========================================================================
   HABITS
   ======================================================================== */

function calcStreak(completions = []) {
  if (completions.length === 0) return 0;
  const set = new Set(completions);
  let streak = 0;
  let d = new Date();
  while (set.has(toDateKey(d))) { streak++; d.setDate(d.getDate() - 1); }
  return streak;
}

function HabitsView({ ctx }) {
  const { habits, setHabits } = ctx;
  const [modal, setModal] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const tKey = todayKey();

  const save = (data) => {
    if (data.id) setHabits((p) => p.map((h) => h.id === data.id ? data : h));
    else setHabits((p) => [...p, { ...data, id: uid(), completions: [] }]);
    setModal(null);
  };

  const toggleToday = (h) => {
    const done = h.completions?.includes(tKey);
    setHabits((p) => p.map((x) => x.id === h.id ? { ...x, completions: done ? x.completions.filter((d) => d !== tKey) : [...(x.completions || []), tKey] } : x));
  };

  return (
    <div>
      <PanelHeader eyebrow="Routines" title="Habits" action={<Btn onClick={() => setModal({ frequency: "daily" })}><Plus size={14} />New habit</Btn>} />
      {habits.length === 0 ? <EmptyState icon={Repeat} title="No habits yet" hint="Track reading, exercise, study, sleep routines, and more." /> : (
        <div className="space-y-2">
          {habits.map((h) => {
            const done = h.completions?.includes(tKey);
            const streak = calcStreak(h.completions);
            return (
              <div key={h.id} className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 flex items-center gap-3">
                <button onClick={() => toggleToday(h)} className={`w-8 h-8 rounded-full flex items-center justify-center border-2 shrink-0 ${done ? "bg-teal-500 border-teal-500 text-slate-950" : "border-slate-600 text-slate-500"}`}>
                  {done ? <Check size={15} /> : <Circle size={13} />}
                </button>
                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setModal(h)}>
                  <div className="text-sm font-medium text-slate-200">{h.title}</div>
                  <div className="text-xs text-slate-500 capitalize">{h.frequency} {streak > 0 && <span className="text-amber-400 inline-flex items-center gap-0.5 ml-1"><Flame size={11} />{streak} day streak</span>}</div>
                </div>
                <button onClick={() => setConfirmDel(h.id)} className="text-slate-500 hover:text-rose-400"><Trash2 size={14} /></button>
              </div>
            );
          })}
        </div>
      )}
      {modal && <HabitModal habit={modal} onSave={save} onClose={() => setModal(null)} />}
      {confirmDel && <ConfirmDialog title="Delete habit" message="This habit and its history will be removed. Missing a day is never a failure worth punishing — but deleting is permanent."
        onCancel={() => setConfirmDel(null)} onConfirm={() => { setHabits((p) => p.filter((h) => h.id !== confirmDel)); setConfirmDel(null); }} />}
    </div>
  );
}

function HabitModal({ habit, onSave, onClose }) {
  const [form, setForm] = useState({ title: "", frequency: "daily", days: [], completions: [], ...habit });
  const toggleDay = (d) => setForm({ ...form, days: form.days.includes(d) ? form.days.filter((x) => x !== d) : [...form.days, d] });
  return (
    <Modal title={habit.id ? "Edit habit" : "New habit"} onClose={onClose}>
      <Field label="Title"><input className={inputCls} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Read 20 minutes" /></Field>
      <Field label="Frequency">
        <select className={inputCls} value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })}>
          <option value="daily">Daily</option><option value="weekly">Weekly</option><option value="custom">Custom days</option>
        </select>
      </Field>
      {form.frequency === "custom" && (
        <div className="flex gap-1 mb-3">
          {DAY_NAMES.map((d, i) => (
            <button key={d} onClick={() => toggleDay(i)} className={`w-9 h-9 rounded-md text-xs font-mono ${form.days.includes(i) ? "bg-teal-500 text-slate-950" : "bg-slate-800 text-slate-400"}`}>{d[0]}</button>
          ))}
        </div>
      )}
      <div className="flex justify-end gap-2 mt-2">
        <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
        <Btn onClick={() => form.title.trim() && onSave(form)}>Save habit</Btn>
      </div>
    </Modal>
  );
}

/* ========================================================================
   ALARMS
   ======================================================================== */

function AlarmsView({ ctx, requestPermission }) {
  const { alarms, setAlarms, settings } = ctx;
  const [modal, setModal] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);

  const save = (data) => {
    if (data.id) setAlarms((p) => p.map((a) => a.id === data.id ? data : a));
    else setAlarms((p) => [...p, { ...data, id: uid(), enabled: true }]);
    setModal(null);
  };

  return (
    <div>
      <PanelHeader eyebrow="Alarms" title="Alarm center" action={<Btn onClick={() => setModal({ time: "07:00", days: [], label: "" })}><Plus size={14} />New alarm</Btn>} />

      {!settings.notificationsEnabled && (
        <div className="mb-4 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-200 flex items-start gap-2">
          <Bell size={15} className="mt-0.5 shrink-0" />
          <div className="flex-1">
            Alarms only trigger while this app is open (a tab, or the installed app) — they play a sound here and can also show a system notification.
            <button onClick={requestPermission} className="block mt-1 underline">Enable browser notifications</button>
          </div>
        </div>
      )}
      <button onClick={() => { unlockAudio(); playAlertChime(); }} className="text-xs text-teal-400 hover:underline mb-4 inline-block">Test alarm sound</button>

      {alarms.length === 0 ? <EmptyState icon={AlarmClock} title="No alarms set" /> : (
        <div className="space-y-2">
          {alarms.sort((a, b) => a.time.localeCompare(b.time)).map((a) => (
            <div key={a.id} className={`rounded-lg border p-3 flex items-center gap-3 ${a.enabled ? "border-slate-800 bg-slate-900/60" : "border-slate-800/50 bg-slate-900/20 opacity-60"}`}>
              <div className="font-mono text-xl font-bold text-slate-100 w-20 shrink-0">{formatTime(a.time, settings.clock24h)}</div>
              <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setModal(a)}>
                <div className="text-sm text-slate-300">{a.label || "Alarm"}</div>
                <div className="text-xs text-slate-500">{a.days?.length ? a.days.map((d) => DAY_NAMES[d]).join(", ") : "Once"}</div>
              </div>
              <button onClick={() => setAlarms((p) => p.map((x) => x.id === a.id ? { ...x, enabled: !x.enabled, firedOnce: false } : x))}
                className={a.enabled ? "text-teal-400" : "text-slate-600"}>{a.enabled ? <Bell size={18} /> : <BellOff size={18} />}</button>
              <button onClick={() => setConfirmDel(a.id)} className="text-slate-500 hover:text-rose-400"><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      )}

      {modal && <AlarmModal alarm={modal} onSave={save} onClose={() => setModal(null)} />}
      {confirmDel && <ConfirmDialog title="Delete alarm" message="This alarm will be permanently removed."
        onCancel={() => setConfirmDel(null)} onConfirm={() => { setAlarms((p) => p.filter((a) => a.id !== confirmDel)); setConfirmDel(null); }} />}
    </div>
  );
}

function AlarmModal({ alarm, onSave, onClose }) {
  const [form, setForm] = useState({ time: "07:00", label: "", days: [], ...alarm });
  const toggleDay = (d) => setForm({ ...form, days: form.days.includes(d) ? form.days.filter((x) => x !== d) : [...form.days, d] });
  const presets = ["Wake up", "Study", "Meeting", "Exercise", "Take a break", "Leave home", "Review goals"];
  return (
    <Modal title={alarm.id ? "Edit alarm" : "New alarm"} onClose={onClose}>
      <Field label="Time"><input type="time" className={`${inputCls} text-2xl font-mono py-3`} value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} /></Field>
      <Field label="Label">
        <input className={inputCls} value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="e.g. Wake up" list="alarm-presets" />
        <datalist id="alarm-presets">{presets.map((p) => <option key={p} value={p} />)}</datalist>
      </Field>
      <Field label="Repeat">
        <div className="flex gap-1">
          {DAY_NAMES.map((d, i) => (
            <button key={d} onClick={() => toggleDay(i)} className={`w-9 h-9 rounded-md text-xs font-mono ${form.days.includes(i) ? "bg-teal-500 text-slate-950" : "bg-slate-800 text-slate-400"}`}>{d[0]}</button>
          ))}
        </div>
        <span className="text-[11px] text-slate-500 mt-1 block">Leave all days unselected for a one-time alarm.</span>
      </Field>
      <div className="flex justify-end gap-2 mt-2">
        <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
        <Btn onClick={() => onSave(form)}>Save alarm</Btn>
      </div>
    </Modal>
  );
}

/* ========================================================================
   NOTES
   ======================================================================== */

function NotesView({ ctx }) {
  const { notes, setNotes } = ctx;
  const [modal, setModal] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  const [query, setQuery] = useState("");

  const save = (data) => {
    if (data.id) setNotes((p) => p.map((n) => n.id === data.id ? data : n));
    else setNotes((p) => [...p, { ...data, id: uid(), createdAt: Date.now() }]);
    setModal(null);
  };

  let list = notes.filter((n) => (showArchived ? true : !n.archived));
  if (query.trim()) { const q = query.toLowerCase(); list = list.filter((n) => n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q) || n.tags?.some((t) => t.toLowerCase().includes(q))); }
  list = [...list].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (b.createdAt || 0) - (a.createdAt || 0));

  return (
    <div>
      <PanelHeader eyebrow="Notes" title="Notes" action={<Btn onClick={() => setModal({ title: "", content: "", tags: [] })}><Plus size={14} />New note</Btn>} />
      <div className="flex gap-2 mb-4">
        <input className={inputCls} placeholder="Search notes…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <Btn variant={showArchived ? "primary" : "secondary"} onClick={() => setShowArchived((s) => !s)}><Archive size={14} />{showArchived ? "All" : "Archived"}</Btn>
      </div>
      {list.length === 0 ? <EmptyState icon={StickyNote} title="No notes here" /> : (
        <div className="grid sm:grid-cols-2 gap-3">
          {list.map((n) => (
            <div key={n.id} className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 flex flex-col">
              <div className="flex items-start justify-between mb-1">
                <div className="text-sm font-semibold text-slate-200 cursor-pointer flex-1" onClick={() => setModal(n)}>{n.title || "Untitled"}</div>
                <button onClick={() => setNotes((p) => p.map((x) => x.id === n.id ? { ...x, pinned: !x.pinned } : x))} className={n.pinned ? "text-amber-400" : "text-slate-600"}>
                  {n.pinned ? <Pin size={13} /> : <PinOff size={13} />}
                </button>
              </div>
              <p className="text-xs text-slate-400 line-clamp-3 flex-1 cursor-pointer" onClick={() => setModal(n)}>{n.content}</p>
              <div className="flex items-center justify-between mt-2">
                <div className="flex gap-1 flex-wrap">{n.tags?.slice(0, 3).map((t) => <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">{t}</span>)}</div>
                <div className="flex gap-2">
                  <button onClick={() => setNotes((p) => p.map((x) => x.id === n.id ? { ...x, archived: !x.archived } : x))} className="text-slate-500 hover:text-teal-300"><Archive size={13} /></button>
                  <button onClick={() => setConfirmDel(n.id)} className="text-slate-500 hover:text-rose-400"><Trash2 size={13} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {modal && <NoteModal note={modal} onSave={save} onClose={() => setModal(null)} />}
      {confirmDel && <ConfirmDialog title="Delete note" message="This note will be permanently deleted."
        onCancel={() => setConfirmDel(null)} onConfirm={() => { setNotes((p) => p.filter((n) => n.id !== confirmDel)); setConfirmDel(null); }} />}
    </div>
  );
}

function NoteModal({ note, onSave, onClose }) {
  const [form, setForm] = useState({ title: "", content: "", tags: [], ...note });
  const [tagInput, setTagInput] = useState("");
  const addTag = () => { if (!tagInput.trim()) return; setForm({ ...form, tags: [...(form.tags || []), tagInput.trim()] }); setTagInput(""); };
  return (
    <Modal title={note.id ? "Edit note" : "New note"} onClose={onClose} wide>
      <Field label="Title"><input className={inputCls} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
      <Field label="Content"><textarea className={inputCls} rows={6} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} placeholder="Markdown-ready plain text…" /></Field>
      <Field label="Tags">
        <div className="flex flex-wrap gap-1 mb-2">{(form.tags || []).map((t) => <span key={t} className="text-[11px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 flex items-center gap-1">{t}<button onClick={() => setForm({ ...form, tags: form.tags.filter((x) => x !== t) })}><X size={10} /></button></span>)}</div>
        <div className="flex gap-2"><input className={inputCls} value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())} placeholder="Add a tag" /><Btn variant="secondary" onClick={addTag}><Plus size={14} /></Btn></div>
      </Field>
      <div className="flex justify-end gap-2 mt-2">
        <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
        <Btn onClick={() => onSave(form)}>Save note</Btn>
      </div>
    </Modal>
  );
}

/* ========================================================================
   SETTINGS
   ======================================================================== */

function SettingsView({ ctx }) {
  const { settings, setSettings, push, tasks, events, blocks, alarms, goals, habits, notes, focusSessions,
    setTasks, setEvents, setBlocks, setAlarms, setGoals, setHabits, setNotes, setFocusSessions } = ctx;
  const [confirmClear, setConfirmClear] = useState(false);
  const fileRef = useRef(null);

  const exportData = () => {
    const bundle = { tasks, events, blocks, alarms, goals, habits, notes, focusSessions, settings, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `timeflow-os-backup-${todayKey()}.json`; a.click();
    URL.revokeObjectURL(url);
    push("Backup exported.");
  };

  const importData = (file) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (data.tasks) setTasks(data.tasks);
        if (data.events) setEvents(data.events);
        if (data.blocks) setBlocks(data.blocks);
        if (data.alarms) setAlarms(data.alarms);
        if (data.goals) setGoals(data.goals);
        if (data.habits) setHabits(data.habits);
        if (data.notes) setNotes(data.notes);
        if (data.focusSessions) setFocusSessions(data.focusSessions);
        if (data.settings) setSettings(data.settings);
        push("Data imported successfully.");
      } catch {
        push("Import failed — the file doesn't look like a valid TimeFlow backup.");
      }
    };
    reader.readAsText(file);
  };

  const clearAll = () => {
    setTasks([]); setEvents([]); setBlocks([]); setAlarms([]); setGoals([]); setHabits([]); setNotes([]); setFocusSessions([]);
    setConfirmClear(false);
    push("All local data cleared.");
  };

  return (
    <div>
      <PanelHeader eyebrow="Settings" title="Preferences" />

      <div className="space-y-5 max-w-md">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <Eyebrow>Profile</Eyebrow>
          <Field label="Display name"><input className={inputCls} value={settings.displayName} onChange={(e) => setSettings({ ...settings, displayName: e.target.value })} /></Field>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <Eyebrow>Display</Eyebrow>
          <Field label="Theme">
            <select className={inputCls} value={settings.theme} onChange={(e) => setSettings({ ...settings, theme: e.target.value })}>
              <option value="dark">Dark</option><option value="light">Light</option><option value="system">System</option>
            </select>
          </Field>
          <Field label="Clock format">
            <select className={inputCls} value={settings.clock24h ? "24" : "12"} onChange={(e) => setSettings({ ...settings, clock24h: e.target.value === "24" })}>
              <option value="12">12-hour</option><option value="24">24-hour</option>
            </select>
          </Field>
          <Field label="Week starts on">
            <select className={inputCls} value={settings.weekStart} onChange={(e) => setSettings({ ...settings, weekStart: Number(e.target.value) })}>
              <option value={0}>Sunday</option><option value={1}>Monday</option>
            </select>
          </Field>
          <label className="flex items-center justify-between text-sm text-slate-300 mb-1">
            <span>Alarm &amp; timer sound</span>
            <input type="checkbox" checked={settings.soundEnabled !== false} onChange={(e) => setSettings({ ...settings, soundEnabled: e.target.checked })} />
          </label>
          {settings.soundEnabled !== false && (
            <button onClick={() => { unlockAudio(); playAlertChime(); }} className="text-xs text-teal-400 hover:underline mt-1">Test sound</button>
          )}
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <Eyebrow>Focus defaults</Eyebrow>
          <Field label="Focus length (minutes)"><input type="number" min={1} className={inputCls} value={settings.defaultFocusMinutes} onChange={(e) => setSettings({ ...settings, defaultFocusMinutes: Number(e.target.value) || 1 })} /></Field>
          <Field label="Short break (minutes)"><input type="number" min={1} className={inputCls} value={settings.defaultShortBreak} onChange={(e) => setSettings({ ...settings, defaultShortBreak: Number(e.target.value) || 1 })} /></Field>
          <Field label="Long break (minutes)"><input type="number" min={1} className={inputCls} value={settings.defaultLongBreak} onChange={(e) => setSettings({ ...settings, defaultLongBreak: Number(e.target.value) || 1 })} /></Field>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <Eyebrow>Data</Eyebrow>
          <div className="flex flex-wrap gap-2">
            <Btn variant="secondary" onClick={exportData}><Download size={14} />Export backup</Btn>
            <Btn variant="secondary" onClick={() => fileRef.current?.click()}><Upload size={14} />Import backup</Btn>
            <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={(e) => e.target.files[0] && importData(e.target.files[0])} />
            <Btn variant="danger" onClick={() => setConfirmClear(true)}><Trash2 size={14} />Clear all local data</Btn>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-xs text-slate-500">
          <Eyebrow>About</Eyebrow>
          TimeFlow OS — Version 0.1 (local-first prototype). Data is stored privately for your account only. Cloud sync, accounts and offline installation arrive in later versions.
        </div>
      </div>

      {confirmClear && <ConfirmDialog title="Clear all local data" message="This permanently deletes every task, event, timetable block, alarm, goal, habit, note and focus session stored for your account. Export a backup first if you want to keep a copy."
        onCancel={() => setConfirmClear(false)} onConfirm={clearAll} />}
    </div>
  );
}
