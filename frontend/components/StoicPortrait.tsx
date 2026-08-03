// Server-safe portrait for a Stoic figure: the bust photo when one exists,
// otherwise a quiet initial-letter placeholder (no authentic portrait
// survives for some figures — e.g. Musonius Rufus and Panaetius).
import Image from "next/image";
import type { Stoic } from "@/lib/stoics";

export default function StoicPortrait({
  stoic,
  sizes,
  priority = false,
}: {
  stoic: Stoic;
  /** next/image sizes hint for the rendered slot. */
  sizes: string;
  priority?: boolean;
}) {
  if (!stoic.image) {
    return (
      <div
        aria-label={`No surviving portrait of ${stoic.name}`}
        role="img"
        className="flex h-full w-full items-center justify-center bg-black/5 dark:bg-white/10"
      >
        <span className="font-serif text-5xl opacity-30">
          {stoic.name.charAt(0)}
        </span>
      </div>
    );
  }
  return (
    <Image
      src={stoic.image.src}
      alt={stoic.image.alt}
      fill
      sizes={sizes}
      priority={priority}
      className="object-cover"
      style={{ objectPosition: stoic.image.position }}
    />
  );
}
