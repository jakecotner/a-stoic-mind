import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy",
  description:
    "How A Stoic Mind handles your account, your journal, and your data.",
};

// Plain-English policy, kept accurate to what the app actually does. If a
// feature changes what data is collected or shared, update this page in the
// same change.
export default function PrivacyPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10">
      <h1 className="mb-2 text-2xl font-semibold tracking-tight">
        Privacy Policy
      </h1>
      <p className="mb-8 text-sm opacity-70">Effective July 31, 2026</p>

      <div className="flex flex-col gap-6 text-[15px] leading-relaxed">
        <p>
          A Stoic Mind is built and operated by Vireo Systems LLC
          (&ldquo;we&rdquo;). The short version: your journal is private, we
          collect only what the app needs to work, we don&rsquo;t run ads or
          analytics trackers, and we never sell your data. The details follow.
        </p>

        <section>
          <h2 className="mb-2 text-lg font-medium">What we collect</h2>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <span className="font-medium">Your account.</span> An email
              address and a password. The password is stored only as a
              cryptographic hash — we cannot read it.
            </li>
            <li>
              <span className="font-medium">What you write.</span> Journal
              entries, margin notes, and your reading and practice history.
              These are private to your account: they are not visible to other
              users, and we don&rsquo;t read them except as needed to run the
              service or if you ask us to look at something.
            </li>
            <li>
              <span className="font-medium">Billing records.</span> If you
              subscribe, payment is handled by Stripe. Your card number goes
              directly to Stripe and never touches our servers; we keep only
              your subscription status and a reference to your Stripe customer
              record.
            </li>
            <li>
              <span className="font-medium">Service records.</span> Ordinary
              server logs (such as IP addresses and requested pages) for
              security and debugging, and per-request token counts when an AI
              feature runs, for cost accounting.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-medium">Cookies</h2>
          <p>
            We set one cookie: a session cookie that keeps you signed in. There
            are no advertising cookies, no analytics trackers, and no
            third-party scripts watching what you do.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-medium">AI reflections</h2>
          <p>
            When you ask for a reflection on a journal entry, the text of that
            entry (and the day&rsquo;s passage, if the entry was written
            against one) is sent to Anthropic, the AI provider, to generate
            the response. That is the only time your writing leaves our
            systems, it happens only when you request it, and it is used only
            to produce your reflection. The daily passage commentary is
            generated from the public-domain texts alone — no user data is
            involved.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-medium">Who we share data with</h2>
          <p className="mb-2">
            We share data only with the services that run the app, and only
            what each one needs:
          </p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <span className="font-medium">Anthropic</span> — journal entry
              text, when you request an AI reflection (see above).
            </li>
            <li>
              <span className="font-medium">Stripe</span> — payment processing
              and subscription management.
            </li>
            <li>
              <span className="font-medium">Resend</span> — delivers our
              transactional email (verification and password-reset messages).
            </li>
            <li>
              <span className="font-medium">Railway</span> — hosts the
              application and its database.
            </li>
          </ul>
          <p className="mt-2">
            We never sell your data, and we don&rsquo;t share it with
            advertisers or data brokers.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-medium">Email</h2>
          <p>
            We send transactional email only: verifying your address and
            resetting your password. No marketing lists, no newsletters you
            didn&rsquo;t ask for.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-medium">
            Deleting your account and data
          </h2>
          <p>
            You can delete your account yourself from the{" "}
            <Link href="/account" className="underline underline-offset-2">
              account page
            </Link>
            . Deletion is immediate and permanent: your journal entries, margin
            notes, and reading history are removed, and remaining service
            records are disconnected from your identity. There is no
            recovery, so export anything you want to keep first.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-medium">Children</h2>
          <p>
            A Stoic Mind is not directed to children under 13, and we do not
            knowingly collect personal information from them. If you believe a
            child has created an account, contact us and we will delete it.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-medium">Changes to this policy</h2>
          <p>
            If we change how we handle your data, we will update this page and
            its effective date. Material changes — anything that shares more
            data than described here — will be announced in the app before
            they take effect.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-medium">Contact</h2>
          <p>
            Questions about this policy or your data:{" "}
            <a
              href="mailto:hello@astoicmind.com"
              className="underline underline-offset-2"
            >
              hello@astoicmind.com
            </a>{" "}
            — or see the{" "}
            <Link href="/contact" className="underline underline-offset-2">
              contact page
            </Link>
            .
          </p>
        </section>
      </div>
    </div>
  );
}
