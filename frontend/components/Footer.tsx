import Link from "next/link";

export default function Footer() {
  return (
    <footer className="border-t border-black/10 dark:border-white/15">
      <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-4 text-xs opacity-70">
        <span>© {new Date().getFullYear()} Vireo Systems LLC</span>
        <Link href="/privacy" className="hover:opacity-100 hover:underline">
          Privacy
        </Link>
        <Link href="/contact" className="hover:opacity-100 hover:underline">
          Contact
        </Link>
      </div>
    </footer>
  );
}
