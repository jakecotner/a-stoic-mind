import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Contact",
  description: "How to reach the people behind A Stoic Mind.",
};

export default function ContactPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10">
      <h1 className="mb-2 text-2xl font-semibold tracking-tight">Contact</h1>
      <p className="mb-8 text-sm opacity-70">
        A Stoic Mind is built and operated by Vireo Systems LLC.
      </p>

      <div className="flex flex-col gap-6 text-[15px] leading-relaxed">
        <p>
          For anything — a question, a bug, trouble with your account or
          subscription, feedback on the readings — email{" "}
          <a
            href="mailto:hello@astoicmind.com"
            className="underline underline-offset-2"
          >
            hello@astoicmind.com
          </a>
          . A person reads every message.
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <span className="font-medium">Account or sign-in trouble</span> —
            include the email address on the account. You can reset a
            forgotten password from the{" "}
            <Link href="/login" className="underline underline-offset-2">
              sign-in page
            </Link>
            .
          </li>
          <li>
            <span className="font-medium">Billing</span> — subscriptions can
            be managed any time from your{" "}
            <Link href="/account" className="underline underline-offset-2">
              account page
            </Link>
            ; email us if something looks wrong.
          </li>
          <li>
            <span className="font-medium">Privacy</span> — how we handle your
            data is described in the{" "}
            <Link href="/privacy" className="underline underline-offset-2">
              privacy policy
            </Link>
            .
          </li>
        </ul>
      </div>
    </div>
  );
}
