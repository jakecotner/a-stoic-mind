// Server-safe portrait for a figure on the people pages: the photo or bust
// when one exists, otherwise a quiet initial-letter placeholder (no
// authentic portrait survives for some figures — e.g. Musonius Rufus).
// Shared by the Stoics and Transcendentalists pages.
import Image from "next/image";
import type { StoicImage } from "@/lib/stoics";

export type PortraitSubject = {
  name: string;
  image: StoicImage | null;
};

export default function StoicPortrait({
  subject,
  sizes,
  priority = false,
}: {
  subject: PortraitSubject;
  /** next/image sizes hint for the rendered slot. */
  sizes: string;
  priority?: boolean;
}) {
  if (!subject.image) {
    return (
      <div
        aria-label={`No surviving portrait of ${subject.name}`}
        role="img"
        className="flex h-full w-full items-center justify-center bg-black/5 dark:bg-white/10"
      >
        <span className="font-serif text-5xl opacity-30">
          {subject.name.charAt(0)}
        </span>
      </div>
    );
  }
  return (
    <Image
      src={subject.image.src}
      alt={subject.image.alt}
      fill
      sizes={sizes}
      priority={priority}
      className="object-cover"
      style={{ objectPosition: subject.image.position }}
    />
  );
}
