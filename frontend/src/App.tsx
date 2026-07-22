import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  fetchBillingSummary,
  fetchLanguages,
  fetchMe,
  login,
  logout,
  register,
  updateLanguage,
  type AuthUser,
  type BillingSummary,
} from "./api";
import { AccountModal, UpgradeModal } from "./Account";
import { SettingsModal, type Theme } from "./Settings";
import type { Language, ReadingPage, ReadingTarget } from "./types";
import Reading from "./Reading";
import Journal from "./Journal";
import Practice from "./Practice";
import Sidebar from "./Sidebar";
import "./App.css";

type View = "reading" | "journal" | "practice";
type AuthMode = "login" | "register";

const LANG_KEY = "stoa:reading:lang";

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
    if (stored === "light" || stored === "dark" || stored === "midnight")
      return stored;
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
  // Reading language, app-wide. localStorage serves signed-out visits; for a
  // signed-in user the account value is the source of truth (it follows them
  // across devices), and changes from any surface are written back to it.
  const [languages, setLanguages] = useState<Language[]>([]);
  const [lang, setLangState] = useState(
    () => localStorage.getItem(LANG_KEY) ?? "",
  );

  const changeLang = (code: string) => {
    setLangState(code);
    localStorage.setItem(LANG_KEY, code);
    if (user) updateLanguage(code).catch(() => {});
  };

  /** On sign-in / session restore: the account's language wins; if the
      account has none yet, adopt this device's choice into it. */
  const onUserLoaded = (u: AuthUser | null) => {
    setUser(u);
    if (!u) return;
    if (u.language !== null) {
      setLangState(u.language);
      localStorage.setItem(LANG_KEY, u.language);
    } else {
      const local = localStorage.getItem(LANG_KEY);
      if (local) updateLanguage(local).catch(() => {});
    }
  };
  // Plan/usage summary for the signed-in user (null while signed out).
  const [billing, setBilling] = useState<BillingSummary | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Set when a reflection request hits the free-tier monthly cap (402).
  const [capHit, setCapHit] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) {
      setBilling(null);
      return;
    }
    let cancelled = false;
    fetchBillingSummary().then((b) => {
      if (!cancelled) setBilling(b);
    });
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Returning from Stripe Checkout (?checkout=success): the webhook that
  // flips the tier can lag the redirect by a few seconds, so poll the summary
  // briefly until Plus appears. ?checkout=cancelled just cleans the URL.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const outcome = params.get("checkout");
    if (!outcome) return;
    params.delete("checkout");
    const rest = params.toString();
    window.history.replaceState(
      null,
      "",
      window.location.pathname + (rest ? `?${rest}` : ""),
    );
    if (outcome !== "success") return;
    let cancelled = false;
    let tries = 0;
    const poll = () => {
      fetchBillingSummary().then((b) => {
        if (cancelled) return;
        if (b) setBilling(b);
        if (b?.tier !== "plus" && ++tries < 8) setTimeout(poll, 1500);
      });
    };
    poll();
    return () => {
      cancelled = true;
    };
  }, []);

  // On cap hit, re-sync the summary so the account view shows the spent month.
  const onCapHit = () => {
    setCapHit(true);
    fetchBillingSummary().then(setBilling);
  };

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
    fetchMe().then(onUserLoaded);
    // No languages just means the pickers offer English only.
    fetchLanguages().then(setLanguages).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
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
                    onClick={() => {
                      setAccountOpen(true);
                      setMenuOpen(false);
                    }}
                  >
                    Account
                  </button>
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
              <button
                className="menu-item"
                onClick={() => {
                  setSettingsOpen(true);
                  setMenuOpen(false);
                }}
              >
                Settings
              </button>
            </nav>
          )}
        </div>
        <div className="appbar-title">
          <h1>A Stoic Mind</h1>
          <span className="title-sep" aria-hidden="true">
            |
          </span>
          <p className="tagline">Ancient practice for present problems</p>
        </div>
        <span className="title-sep" aria-hidden="true">
          |
        </span>
        <nav className="appbar-nav">
          {(
            [
              ["reading", "Stoic Texts"],
              ["journal", "Journal"],
              ["practice", "Practice"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              className={view === key ? "nav-item nav-active" : "nav-item"}
              onClick={() => goTo(key)}
            >
              {label}
            </button>
          ))}
        </nav>
      </header>

      {authOpen && !user && (
        <AuthModal
          mode={authOpen}
          onModeChange={setAuthOpen}
          onClose={() => setAuthOpen(null)}
          onAuthed={onUserLoaded}
        />
      )}

      {accountOpen && user && (
        <AccountModal
          user={user}
          billing={billing}
          onClose={() => setAccountOpen(false)}
        />
      )}

      {settingsOpen && (
        <SettingsModal
          theme={theme}
          onThemeChange={setTheme}
          languages={languages}
          lang={lang}
          onLangChange={changeLang}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {capHit && (
        <UpgradeModal
          limit={billing?.reflections?.limit ?? null}
          onClose={() => setCapHit(false)}
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
            lang={lang}
            isPlus={billing !== null && billing.reflections === null}
            onShowPlans={() => setAccountOpen(true)}
            onOpenNote={(id) => {
              setOpenNoteId(id);
              setView("journal");
            }}
          />
        </main>
      )}

      {view === "journal" && (
        <main className="view view-wide">
          <Journal
            user={user}
            lang={lang}
            openNoteId={openNoteId}
            onOpenNote={setOpenNoteId}
            onOpenPassage={(passageId) => {
              setReadingTarget({ kind: "passage", passageId });
              setView("reading");
            }}
            onMutated={() => setNotesVersion((v) => v + 1)}
            onGoToTexts={() => setView("reading")}
            onSignIn={() => setAuthOpen("login")}
            capRemaining={
              billing?.tier === "free" && billing.reflections
                ? Math.max(
                    0,
                    billing.reflections.limit - billing.reflections.used,
                  )
                : null
            }
            onCapHit={onCapHit}
            onShowPlans={() => setAccountOpen(true)}
            isPlus={billing !== null && billing.reflections === null}
          />
          <p className="disclaimer">
            A philosophical practice tool, not therapy or medical care. In
            crisis? Call or text 988 (US) or your local emergency services.
          </p>
        </main>
      )}

      {view === "practice" && (
        <main className="view view-wide">
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
