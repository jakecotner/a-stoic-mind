"use client";

// The getting-started tour: a spotlight walkthrough over the real UI,
// auto-opened once per device on a visitor's first trip (any page), and
// replayable from the sidebar. Steps anchor to sidebar links via
// [data-tour] attributes, which exist on every page; steps without an
// anchor render as a centered card.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { useUser } from "@/lib/useUser";

const SEEN_KEY = "astoicmind:tour-seen";
/** Dispatched (window) by the sidebar's "Take the tour" button. */
export const TOUR_OPEN_EVENT = "astoicmind:tour-open";

// Token-consuming and auth flows shouldn't be interrupted; the tour waits
// for the next ordinary page instead (SEEN_KEY stays unset).
const QUIET_PATHS = ["/login", "/register", "/reset-password", "/verify"];

const buttonCls =
  "rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-85";
const subtleButtonCls =
  "rounded border border-black/15 px-3 py-1.5 text-xs hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10";

type Step = {
  /** Matches a [data-tour] attribute; absent = centered card. */
  target?: string;
  title: string;
  body: string;
};

const STEPS: Step[] = [
  {
    title: "Welcome to A Stoic Mind",
    body: "A place to read the Stoics and practice what they taught — a passage each day, a journal beside it, and a calendar of your practice. A quick look around?",
  },
  {
    target: "journal",
    title: "Journal",
    body: "Each day begins with one passage and a short reflection on it. Write alongside it — entries you save receive a brief reflection of their own.",
  },
  {
    target: "library",
    title: "Library",
    body: "The Stoic texts, free to read. Click any passage for a plain-spoken breakdown, listen to it read aloud, and — signed in — keep margin notes.",
  },
  {
    target: "stoics",
    title: "The Stoics",
    body: "The philosophers themselves: who they were, how they lived, and what they taught.",
  },
  {
    target: "practice",
    title: "Practice",
    body: "Guided morning and evening sessions, and a month calendar that gathers your reading, journaling, and sits.",
  },
  {
    target: "mentor",
    title: "Mentor",
    body: "A conversation partner in the Stoic tradition — bring a passage, a question, or a hard day.",
  },
  {
    title: "Free to explore",
    body: "", // The closing step's body depends on sign-in state; see below.
  },
];

export default function Tour() {
  const { user, loading } = useUser();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);

  // Auto-open once per device, after the user check settles so the closing
  // step's copy is right. Marked seen immediately, so it never nags twice.
  useEffect(() => {
    if (loading || QUIET_PATHS.includes(pathname)) return;
    if (localStorage.getItem(SEEN_KEY)) return;
    localStorage.setItem(SEEN_KEY, "1");
    const t = setTimeout(() => {
      setStep(0);
      setOpen(true);
    }, 800);
    return () => clearTimeout(t);
  }, [loading, pathname]);

  // Replay on demand.
  useEffect(() => {
    const onOpen = () => {
      localStorage.setItem(SEEN_KEY, "1");
      setStep(0);
      setOpen(true);
    };
    window.addEventListener(TOUR_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(TOUR_OPEN_EVENT, onOpen);
  }, []);

  const close = useCallback(() => setOpen(false), []);
  const next = useCallback(
    () => setStep((s) => Math.min(s + 1, STEPS.length - 1)),
    [],
  );
  const back = useCallback(() => setStep((s) => Math.max(s - 1, 0)), []);

  // Measure the current step's anchor; follow it through resizes and
  // scrolls (the sidebar is sticky, but cheap to be safe).
  const target = open ? STEPS[step].target : undefined;
  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => {
      const el = target
        ? document.querySelector<HTMLElement>(`[data-tour="${target}"]`)
        : null;
      setRect(el ? el.getBoundingClientRect() : null);
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, target]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowRight" || e.key === "Enter") {
        if (step < STEPS.length - 1) next();
        else close();
      } else if (e.key === "ArrowLeft") back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, step, close, next, back]);

  if (!open) return null;

  const current = STEPS[step];
  const last = step === STEPS.length - 1;
  const anchored = current.target !== undefined && rect !== null;

  // Card placement: beside the spotlighted sidebar link on wide screens, a
  // bottom sheet on narrow ones, centered when the step has no anchor.
  let cardStyle: React.CSSProperties | undefined;
  let cardCls =
    "pointer-events-auto flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-3 rounded-xl border border-black/10 bg-background p-5 shadow-xl dark:border-white/15";
  if (anchored && typeof window !== "undefined") {
    if (window.innerWidth < 560) {
      cardStyle = { position: "fixed", left: 16, right: 16, bottom: 24 };
      cardCls += " w-auto";
    } else {
      cardStyle = {
        position: "fixed",
        left: Math.min(rect.right + 16, window.innerWidth - 320 - 16),
        top: Math.min(Math.max(rect.top - 8, 16), window.innerHeight - 280),
      };
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Getting started tour"
      className="fixed inset-0 z-50"
    >
      {anchored ? (
        // The hole: everything but the anchor is dimmed by the shadow.
        <div
          aria-hidden
          className="pointer-events-none fixed rounded-lg transition-all duration-300"
          style={{
            left: rect.left - 4,
            top: rect.top - 4,
            width: rect.width + 8,
            height: rect.height + 8,
            boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.55)",
          }}
        />
      ) : (
        <div aria-hidden className="fixed inset-0 bg-black/55" />
      )}

      <div
        className={
          anchored
            ? "pointer-events-none fixed inset-0"
            : "pointer-events-none fixed inset-0 flex items-center justify-center p-4"
        }
      >
        <div className={cardCls} style={cardStyle}>
          <div className="flex items-start justify-between gap-3">
            <h2 className="font-medium">
              {last && user ? "That's the tour" : current.title}
            </h2>
            <button
              aria-label="Close tour"
              className="rounded px-1.5 text-sm opacity-50 hover:opacity-100"
              onClick={close}
            >
              ✕
            </button>
          </div>

          <p className="text-sm leading-relaxed opacity-80">
            {last
              ? user
                ? "You're signed in and ready — the practice is yours."
                : "Everything you've seen is open to read. An account keeps your journal, margin notes, and practice calendar."
              : current.body}
          </p>
          {last && (
            <p className="text-xs opacity-50">
              Replay this tour anytime from the sidebar.
            </p>
          )}

          <div className="mt-1 flex items-center gap-2">
            <span className="mr-auto flex gap-1.5" aria-hidden>
              {STEPS.map((_, i) => (
                <span
                  key={i}
                  className={`h-1.5 w-1.5 rounded-full ${
                    i === step
                      ? "bg-foreground"
                      : "bg-black/20 dark:bg-white/25"
                  }`}
                />
              ))}
            </span>
            {step > 0 && !last && (
              <button className={subtleButtonCls} onClick={back}>
                Back
              </button>
            )}
            {last ? (
              user ? (
                <button className={buttonCls} onClick={close}>
                  Done
                </button>
              ) : (
                <>
                  <button className={subtleButtonCls} onClick={close}>
                    Not yet
                  </button>
                  <Link href="/register" className={buttonCls} onClick={close}>
                    Create an account
                  </Link>
                </>
              )
            ) : (
              <button className={buttonCls} onClick={next}>
                {step === 0 ? "Show me around" : "Next"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
