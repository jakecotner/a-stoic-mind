import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  fetchMe,
  login,
  logout,
  register,
  type AuthUser,
} from "./api";
import type { ReadingPage, ReadingTarget } from "./types";
import Reading from "./Reading";
import Journal from "./Journal";
import Practice from "./Practice";
import Sidebar from "./Sidebar";
import "./App.css";

type View = "reading" | "journal" | "practice";
type AuthMode = "login" | "register";
type Theme = "light" | "dark";

function AuthModal({
  mode,
  onModeChange,
  onClose,
  onAuthed,
}: {
  mode: AuthMode;
  onModeChange: (mode: AuthMode) => void;
  onClose: () => void;
  onAuthed: (user: AuthUser) => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const registering = mode === "register";

  const switchMode = (next: AuthMode) => {
    setError(null);
    setConfirm("");
    onModeChange(next);
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    const addr = email.trim();
    if (!addr || !password || busy) return;
    if (registering) {
      // Mirrors the backend's validate_password rule for an instant answer.
      if (password.length < 8) {
        setError("Password must be at least 8 characters.");
        return;
      }
      if (password !== confirm) {
        setError("Passwords don't match.");
        return;
      }
    }
    setBusy(true);
    setError(null);
    try {
      if (registering) await register(addr, password);
      await login(addr, password);
      const me = await fetchMe();
      if (me) onAuthed(me);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="auth-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div role="dialog" aria-modal="true" aria-labelledby="auth-title" className="auth-modal">
        <button className="auth-close" aria-label="Close" onClick={onClose}>
          &times;
        </button>
        <h2 id="auth-title">{registering ? "Create your account" : "Welcome back"}</h2>
        <p className="auth-sub">
          {registering
            ? "Keep your conversations, journal, and margin notes across visits."
            : "Sign in to your conversations, journal, and margin notes."}
        </p>
        <form className="auth-fields" onSubmit={submit}>
          <label>
            Email
            <input
              type="email"
              value={email}
              required
              autoFocus
              autoComplete="email"
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            Password
            <span className="auth-passrow">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                required
                autoComplete={registering ? "new-password" : "current-password"}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="auth-link"
                onClick={() => setShowPassword((s) => !s)}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </span>
          </label>
          {registering && <span className="auth-note">At least 8 characters.</span>}
          {registering && (
            <label>
              Confirm password
              <input
                type={showPassword ? "text" : "password"}
                value={confirm}
                required
                autoComplete="new-password"
                onChange={(e) => setConfirm(e.target.value)}
              />
            </label>
          )}
          {error && <p className="auth-error">{error}</p>}
          <button
            type="submit"
            className="auth-primary"
            disabled={
              busy || !email.trim() || !password || (registering && !confirm)
            }
          >
            {busy
              ? registering
                ? "Creating account…"
                : "Signing in…"
              : registering
                ? "Create account"
                : "Sign in"}
          </button>
        </form>
        <p className="auth-switch">
          {registering ? (
            <>
              Already have an account?{" "}
              <button className="auth-link" onClick={() => switchMode("login")}>
                Sign in
              </button>
            </>
          ) : (
            <>
              New to the Stoa?{" "}
              <button className="auth-link" onClick={() => switchMode("register")}>
                Create an account
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [view, setView] = useState<View>("journal");
  // Navigation request for the Reading view (sidebar TOC, journal links).
  const [readingTarget, setReadingTarget] = useState<ReadingTarget | null>(null);
  // Mirror of the Reading view's current page, so the sidebar can follow.
  const [readingPos, setReadingPos] = useState<ReadingPage | null>(null);
  // Bumped on any journal change; tells the sidebar to refetch.
  const [notesVersion, setNotesVersion] = useState(0);
  // Past entry open in the Journal view (picked in the sidebar or just saved).
  const [openNoteId, setOpenNoteId] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem("stoa:sidebar-collapsed") === "1",
  );
  const [menuOpen, setMenuOpen] = useState(false);
  // No stored choice falls back to the OS preference (mirrors index.html's
  // pre-render script, which sets data-theme before React mounts).
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = localStorage.getItem("stoa:theme");
    if (stored === "light" || stored === "dark") return stored;
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  });

  useEffect(() => {
    localStorage.setItem("stoa:sidebar-collapsed", sidebarCollapsed ? "1" : "0");
  }, [sidebarCollapsed]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("stoa:theme", theme);
  }, [theme]);
  const [authOpen, setAuthOpen] = useState<AuthMode | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close the menu on outside click or Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const goTo = (v: View) => {
    setView(v);
    setMenuOpen(false);
  };

  useEffect(() => {
    fetchMe().then(setUser);
  }, []);

  return (
    <div className="page">
      <header className="appbar">
        <div className="appbar-menu" ref={menuRef}>
          <button
            className="hamburger"
            aria-label="Menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
          >
            <span />
            <span />
            <span />
          </button>
          {menuOpen && (
            <nav className="menu">
              {user ? (
                <>
                  <div className="menu-user">{user.email}</div>
                  <button
                    className="menu-item"
                    onClick={async () => {
                      await logout();
                      setUser(null);
                      setMenuOpen(false);
                    }}
                  >
                    Sign out
                  </button>
                </>
              ) : (
                <>
                  <button
                    className="menu-item"
                    onClick={() => {
                      setAuthOpen("login");
                      setMenuOpen(false);
                    }}
                  >
                    Sign in
                  </button>
                  <button
                    className="menu-item"
                    onClick={() => {
                      setAuthOpen("register");
                      setMenuOpen(false);
                    }}
                  >
                    Create account
                  </button>
                </>
              )}
              <div className="menu-sep" />
              {(
                [
                  ["reading", "Stoic Texts"],
                  ["journal", "Journal"],
                  ["practice", "Practice"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  className={view === key ? "menu-item menu-active" : "menu-item"}
                  onClick={() => goTo(key)}
                >
                  {label}
                </button>
              ))}
              <div className="menu-sep" />
              <button
                className="menu-item"
                onClick={() =>
                  setTheme((t) => (t === "dark" ? "light" : "dark"))
                }
              >
                {theme === "dark" ? "Light mode" : "Dark mode"}
              </button>
            </nav>
          )}
        </div>
        <div className="appbar-title">
          <h1>A Stoic Mind</h1>
          <p className="tagline">Ancient practice for present problems</p>
        </div>
      </header>

      {authOpen && !user && (
        <AuthModal
          mode={authOpen}
          onModeChange={setAuthOpen}
          onClose={() => setAuthOpen(null)}
          onAuthed={setUser}
        />
      )}

      <div className="layout">
      <Sidebar
        view={view}
        user={user}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((c) => !c)}
        readingPos={readingPos}
        onNavigateReading={(target) => {
          setReadingTarget(target);
          setView("reading");
        }}
        notesVersion={notesVersion}
        openNoteId={view === "journal" ? openNoteId : null}
        onOpenNote={(id) => {
          setOpenNoteId(id);
          setView("journal");
        }}
      />
      <div className="main-col">
      {view === "reading" && (
        <main className="view">
          <Reading
            user={user}
            target={readingTarget}
            onTargetConsumed={() => setReadingTarget(null)}
            onPageChange={setReadingPos}
          />
        </main>
      )}

      {view === "journal" && (
        <main className="view view-wide">
          <Journal
            user={user}
            openNoteId={openNoteId}
            onOpenNote={setOpenNoteId}
            onOpenPassage={(passageId) => {
              setReadingTarget({ kind: "passage", passageId });
              setView("reading");
            }}
            onMutated={() => setNotesVersion((v) => v + 1)}
            onGoToTexts={() => setView("reading")}
            onSignIn={() => setAuthOpen("login")}
          />
          <p className="disclaimer">
            A philosophical practice tool, not therapy or medical care. In
            crisis? Call or text 988 (US) or your local emergency services.
          </p>
        </main>
      )}

      {view === "practice" && (
        <main className="view">
          <Practice
            user={user}
            onOpenPassage={(passageId) => {
              setReadingTarget({ kind: "passage", passageId });
              setView("reading");
            }}
            onOpenNote={(id) => {
              setOpenNoteId(id);
              setView("journal");
            }}
            onSignIn={() => setAuthOpen("login")}
          />
        </main>
      )}
      </div>
      </div>
    </div>
  );
}
