// The Transcendentalists — editorial content for the /transcendentalists
// pages, the sibling of lib/stoics.ts. Checked-in content, not database
// data: it changes rarely, is owned by no user, and reads best under
// review in a PR. The "works in the Library" sections come live from the
// works API by matching corpusAuthor against passages.author.
//
// Quotes are excerpted verbatim from our own passages table (the corpus is
// immutable, so they cannot drift).
import type { StoicImage, StoicQuote } from "./stoics";

export type Transcendentalist = {
  slug: string;
  name: string;
  fullName?: string;
  dates: string;
  /** One line under the name — who this person was, in a breath. */
  epithet: string;
  /** Matches passages.author when their works are in the corpus. */
  corpusAuthor: string | null;
  image: StoicImage | null;
  life: string[];
  themes: { title: string; text: string }[];
  quote: StoicQuote;
};

/** The movement in a breath — the index page's framing. */
export const CIRCLE_INTRO = {
  title: "The Transcendentalists",
  span: "Concord and Boston, c. 1836–1860",
  blurb:
    "A preacher who left the pulpit, a surveyor who built a cabin by a pond, a critic who talked circles around Boston. The Transcendentalists believed each person can meet truth directly — in conscience, in solitude, in nature — and their lives tested the belief as hard as their pages argue it.",
};

export const TRANSCENDENTALISTS: Transcendentalist[] = [
  {
    slug: "emerson",
    name: "Ralph Waldo Emerson",
    dates: "1803–1882",
    epithet: "The preacher who left the pulpit to trust the inner light",
    corpusAuthor: "Ralph Waldo Emerson",
    image: {
      src: "/transcendentalists/emerson.jpg",
      alt: "Photograph of Ralph Waldo Emerson, c. 1857",
      position: "center 20%",
      credit: "Photograph of Emerson, c. 1857. Public domain, via Wikimedia Commons",
      creditUrl:
        "https://commons.wikimedia.org/wiki/File:Ralph_Waldo_Emerson_ca1857_retouched.jpg",
    },
    life: [
      "Emerson was a seventh-generation New England minister who found, a few years into the work, that he could no longer administer a ritual he did not feel. He resigned his Boston pulpit at twenty-nine, sailed to Europe grieving his first wife, and came home resolved to speak only what he had verified in his own experience. In 1836 he published a small anonymous book called Nature; it became the founding document of Transcendentalism.",
      "From his house in Concord he made his living on the lecture circuit — hundreds of towns, decades of winters — turning the lectures into the essays that made him the most famous thinker in America: Self-Reliance, Compensation, The Over-Soul, Experience. His study became the movement's meeting room; his generosity, its funding. He walked daily, kept a journal for sixty years, and mined it for every page he published.",
      "What he preached, from the platform instead of the pulpit, was self-trust — not self-satisfaction, but the discipline of listening for the voice under the borrowed opinions, and acting on it. He buried a son, weathered mockery of his 'newness,' and kept lecturing into old age as his memory failed. Asked late in life what he had been doing all those years, he might have answered with his own line: the one thing in the world of value is the active soul.",
    ],
    themes: [
      {
        title: "Self-reliance",
        text: "The center of everything Emerson wrote: imitation is suicide, envy is ignorance, and the voice within — heard in solitude, tested in conduct — is the only guide a person can finally follow.",
      },
      {
        title: "The Over-Soul",
        text: "Beneath individual minds, Emerson taught, runs one common life, the way coves and creeks hold one sea. Moments of insight, conscience, and love are that larger life breaking through.",
      },
      {
        title: "Nature as teacher",
        text: "Woods and stars are not scenery but scripture — a daily, wordless instruction in proportion and calm, available to anyone who will go outside and actually look.",
      },
    ],
    quote: {
      text: "Trust thyself: every heart vibrates to that iron string.",
      source: "Self-Reliance",
      work: "Self-Reliance",
    },
  },
  {
    slug: "thoreau",
    name: "Henry David Thoreau",
    dates: "1817–1862",
    epithet: "The surveyor who built a cabin to find out what life is",
    corpusAuthor: "Henry David Thoreau",
    image: {
      src: "/transcendentalists/thoreau.jpg",
      alt: "Daguerreotype of Henry David Thoreau by Benjamin Maxham, 1856",
      position: "center 25%",
      credit:
        "Daguerreotype by Benjamin D. Maxham, 1856. Public domain, via Wikimedia Commons",
      creditUrl:
        "https://commons.wikimedia.org/wiki/File:Benjamin_D._Maxham_-_Henry_David_Thoreau_-_Restored.jpg",
    },
    life: [
      "Thoreau was Concord born and Concord loyal — a Harvard graduate who came home to work in his family's pencil shop, keep school, survey woodlots, and walk four hours a day. He was Emerson's handyman, gardener, and friend, and took the older man's doctrine of self-trust more literally than anyone: if life is to be examined, examine it with your hands.",
      "In 1845 he borrowed an axe and built a cabin on Emerson's land at Walden Pond, a mile from town, to 'front only the essential facts of life.' He stayed two years, growing beans, keeping accounts to the half-cent, reading, and writing. One night in town he was jailed for refusing the poll tax of a government that enforced slavery; the night became the essay now called Civil Disobedience, which later reached Gandhi and Martin Luther King Jr.",
      "Walden, the book he distilled from the experiment, took nine years and seven drafts. He died of tuberculosis at forty-four, mostly unknown, his masterpiece a commercial failure. Asked near the end whether he had made his peace with God, he answered that he was not aware they had ever quarreled.",
    ],
    themes: [
      {
        title: "Deliberate living",
        text: "The Walden experiment in one word: strip life to what is essential, learn what it teaches, and refuse to reach the end having never lived. Simplicity is the method, not the point.",
      },
      {
        title: "Wildness",
        text: "\"In Wildness is the preservation of the World.\" Wild nature — and the wild, unsubdued part of a person — is not a luxury but the spring that keeps a life, and a civilization, from going stale.",
      },
      {
        title: "Conscience over law",
        text: "When law and conscience conflict, Thoreau taught, follow conscience and accept the cost — one honest act, one night in jail, weighs more than years of opinion.",
      },
    ],
    quote: {
      text: "I went to the woods because I wished to live deliberately, to front only the essential facts of life, and see if I could not learn what it had to teach, and not, when I came to die, discover that I had not lived.",
      source: "Walden, “Where I Lived, and What I Lived For”",
      work: "Walden",
    },
  },
  {
    slug: "fuller",
    name: "Margaret Fuller",
    dates: "1810–1850",
    epithet: "The critic who argued the soul has no sex",
    corpusAuthor: "Margaret Fuller",
    image: {
      src: "/transcendentalists/fuller.jpg",
      alt: "Daguerreotype of Margaret Fuller by John Plumbe, 1846",
      position: "center 30%",
      credit:
        "Daguerreotype by John Plumbe, 1846, National Portrait Gallery. Public domain, via Wikimedia Commons",
      creditUrl:
        "https://commons.wikimedia.org/wiki/File:Margaret_Fuller_by_John_Plumbe,_Jr.,_1846,_sixth-plate_daguerreotype,_from_the_National_Portrait_Gallery_-_NPG-B8000006C_1.jpg",
    },
    life: [
      "Fuller was educated by her father like a prodigy of the previous century — Latin at six, reading Virgil while other children played — and grew into the best-read person in the Transcendentalist circle, by their own admission. She taught, translated Goethe, and led her famous 'Conversations' in Boston: paid seminars where women, barred from universities, thought out loud about everything the age reserved for men.",
      "Emerson recruited her to edit The Dial, the movement's magazine, where her essay on the rights and nature of women grew into Woman in the Nineteenth Century — the first major American argument that the soul has no sex and that every barrier around a woman's growth wounds the whole of humanity. Horace Greeley then hired her as the New-York Tribune's first female editor and foreign correspondent.",
      "In Europe she found her way to revolutionary Rome, ran a hospital through the French siege of 1849, and married an Italian marquis turned republican soldier. Sailing home in 1850 with her husband and infant son, she drowned in a shipwreck within sight of Fire Island, New York. She was forty. Thoreau walked the beach for days searching for her manuscript on the revolution; it was never found.",
    ],
    themes: [
      {
        title: "Let the soul work",
        text: "Fuller's first principle: growth is the law of the soul, and nothing — custom, precedent, another person's convenience — has the right to impede it, in women or in anyone.",
      },
      {
        title: "The soul poised on itself",
        text: "Like the Stoics she read closely, Fuller held that relations stay precious only when a person stands on their own center first — union is best between whole beings, not halves.",
      },
      {
        title: "Thinking as conversation",
        text: "Her genius was dialogic: truth emerges between people who examine their lives out loud. Her Conversations made a university out of a parlor.",
      },
    ],
    quote: {
      text: "Let us be wise, and not impede the soul. Let her work as she will. Let us have one creative energy, one incessant revelation.",
      source: "Woman in the Nineteenth Century",
      work: "Woman in the Nineteenth Century",
    },
  },
];

export function findTranscendentalist(
  slug: string,
): Transcendentalist | undefined {
  return TRANSCENDENTALISTS.find((t) => t.slug === slug);
}
