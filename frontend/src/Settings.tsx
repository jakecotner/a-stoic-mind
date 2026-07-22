import { useEffect, useState } from "react";
import { fetchVoices } from "./api";
import type { Language, Voice } from "./types";
import { getVoicePref, setVoicePref } from "./audio";
import { Overlay } from "./Account";

/* Settings: how the Stoa looks, reads, and sounds. Device-and-account
   preferences live here; plan/billing stays in AccountModal. Everything
   works signed out too (theme and voice are per-device; language is
   per-device until sign-in adopts it into the account). */

export type Theme = "light" | "dark" | "midnight";

/** Swatch colors mirror the :root[data-theme] palettes in App.css. */
const THEMES: {
  id: Theme;
  label: string;
  blurb: string;
  bg: string;
  ink: string;
  line: string;
}[] = [
  {
    id: "light",
    label: "Light",
    blurb: "parchment & noon",
    bg: "#f6f2ea",
    ink: "#26241f",
    line: "#e2dbcc",
  },
  {
    id: "dark",
    label: "Dark",
    blurb: "lamplit study",
    bg: "#211e18",
    ink: "#e7dfcf",
    line: "#3c362b",
  },
  {
    id: "midnight",
    label: "Midnight",
    blurb: "near-black & sharp",
    bg: "#0c0b09",
    ink: "#ece5d4",
    line: "#2c2820",
  },
];

export function SettingsModal({
  theme,
  onThemeChange,
  languages,
  lang,
  onLangChange,
  onClose,
}: {
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  /** App-wide reading language, saved to the account when signed in. */
  languages: Language[];
  lang: string;
  onLangChange: (code: string) => void;
  onClose: () => void;
}) {
  // Narration voices; empty (fetch failed / audio unconfigured) hides the picker.
  const [voices, setVoices] = useState<Voice[]>([]);
  const [voicePref, setVoicePrefState] = useState(getVoicePref());

  useEffect(() => {
    fetchVoices()
      .then(setVoices)
      .catch(() => {});
  }, []);

  return (
    <Overlay onClose={onClose} labelledBy="settings-title">
      <h2 id="settings-title">Settings</h2>
      <p className="auth-sub">How the Stoa looks, reads, and sounds.</p>

      <section className="acct-section">
        <div className="pane-caption">Theme</div>
        <div className="theme-cards">
          {THEMES.map((t) => (
            <button
              key={t.id}
              className={
                theme === t.id ? "theme-card theme-selected" : "theme-card"
              }
              onClick={() => onThemeChange(t.id)}
            >
              <span
                className="theme-swatch"
                aria-hidden="true"
                style={{
                  background: t.bg,
                  color: t.ink,
                  borderColor: t.line,
                }}
              >
                Aa
              </span>
              <span className="theme-name">{t.label}</span>
              <span className="theme-blurb">{t.blurb}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="acct-section">
        <div className="pane-caption">Reading</div>
        <label className="lang-picker acct-lang">
          Reading language
          <select value={lang} onChange={(e) => onLangChange(e.target.value)}>
            <option value="">English</option>
            {languages.map((l) => (
              <option key={l.code} value={l.code}>
                {l.native}
              </option>
            ))}
          </select>
        </label>
        <p className="auth-note acct-note">
          Passages, breakdowns, and your conversations with the Stoa all
          follow this language.
        </p>
      </section>

      {voices.length > 0 && (
        <section className="acct-section">
          <div className="pane-caption">Narration</div>
          <label className="lang-picker acct-lang">
            Narration voice
            <select
              value={voicePref || (voices.find((v) => v.default)?.id ?? "")}
              onChange={(e) => {
                setVoicePref(e.target.value);
                setVoicePrefState(e.target.value);
              }}
            >
              {voices.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.id[0].toUpperCase() + v.id.slice(1)} —{" "}
                  {v.description.toLowerCase()}
                  {v.default ? " (default)" : ""}
                </option>
              ))}
            </select>
          </label>
          <p className="auth-note acct-note">
            The voice that reads passages and breakdowns aloud, on this
            device. Takes effect on your next listen.
          </p>
        </section>
      )}
    </Overlay>
  );
}
