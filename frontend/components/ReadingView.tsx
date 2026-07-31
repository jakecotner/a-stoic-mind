// The reading surface, shared by whole-work pages and part pages. A server
// component wrapper: passages arrive server-fetched (so the text is in the
// HTML search engines index) and ReaderShell adds the interactive layer —
// passage selection, the breakdown companion panel, margin notes, and
// mark-as-read.
import type { Passage, Work } from "@/lib/api";
import ReaderShell from "@/components/ReaderShell";

type NavLink = { href: string; label: string } | null;

export default function ReadingView({
  work,
  label,
  part,
  passages,
  prev,
  next,
}: {
  work: Work;
  label: string | null;
  part: string;
  passages: Passage[];
  prev?: NavLink;
  next?: NavLink;
}) {
  return (
    <ReaderShell
      work={work}
      label={label}
      part={part}
      passages={passages}
      prev={prev}
      next={next}
    />
  );
}
