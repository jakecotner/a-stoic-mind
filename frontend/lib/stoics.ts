// The Stoics — editorial content for the /stoics pages. This is checked-in
// content, not database data: it changes rarely, is owned by no user, and
// reads best under review in a PR. The "works in the Library" sections on
// the pages are NOT stored here — they come live from the works API by
// matching corpusAuthor against passages.author.
//
// Quotes from corpus authors are excerpted verbatim from our own passages
// table (the corpus is immutable, so they cannot drift); quotes for the
// earlier Stoics are cited to the ancient source that preserved them.

export type Era = {
  key: string;
  title: string;
  span: string;
  blurb: string;
};

export const ERAS: Era[] = [
  {
    key: "early",
    title: "The Early Stoa",
    span: "c. 300–150 BC",
    blurb:
      "Stoicism began on a painted porch — the Stoa Poikile — in the Athenian marketplace. The first three heads of the school built the whole system: its logic, its physics, its ethics. Their books are lost; their ideas survived everything.",
  },
  {
    key: "middle",
    title: "The Middle Stoa",
    span: "c. 150–50 BC",
    blurb:
      "The school crossed the sea. Two Greeks from the eastern Aegean carried Stoicism into the Roman world and reshaped it for people with careers, families, and public duties — philosophy for the imperfect, not just the ideal sage.",
  },
  {
    key: "roman",
    title: "The Roman Stoa",
    span: "c. 50 BC – AD 180",
    blurb:
      "A senator, a statesman, an exiled teacher, a former slave, an emperor. Every complete Stoic work that survives was written in this period — this is the Stoicism you can read in the Library.",
  },
];

export type StoicQuote = {
  text: string;
  /** Human citation, e.g. "Meditations 5.20" or "reported by Diogenes Laertius". */
  source: string;
  /** Exact corpus work name when the source is readable in the Library. */
  work?: string;
};

export type StoicImage = {
  src: string;
  alt: string;
  /** CSS object-position for square crops on the list page. */
  position: string;
  /** Credit line rendered under the portrait (license attribution). */
  credit: string;
  creditUrl: string;
};

export type Stoic = {
  slug: string;
  name: string;
  fullName?: string;
  dates: string;
  era: Era["key"];
  /** One line under the name — who this person was, in a breath. */
  epithet: string;
  /** Matches passages.author when their works are in the corpus. */
  corpusAuthor: string | null;
  /** Shown instead of a works list when corpusAuthor is null. */
  worksNote?: string;
  image: StoicImage | null;
  life: string[];
  themes: { title: string; text: string }[];
  quote: StoicQuote;
};

export const STOICS: Stoic[] = [
  {
    slug: "zeno",
    name: "Zeno of Citium",
    dates: "c. 334–262 BC",
    era: "early",
    epithet: "The merchant who lost everything and founded a school",
    corpusAuthor: null,
    worksNote:
      "None of Zeno's books survive. What we know of him comes from later writers, above all Diogenes Laertius' life of Zeno — and from the school he left behind.",
    image: {
      src: "/stoics/zeno.jpg",
      alt: "Marble bust of Zeno of Citium, Farnese collection, Naples",
      position: "center 25%",
      credit:
        "Bust of Zeno, Farnese collection, Naples. Photo: Yair Haklai, CC BY-SA 4.0, via Wikimedia Commons",
      creditUrl: "https://commons.wikimedia.org/w/index.php?curid=140032540",
    },
    life: [
      "Zeno was a Phoenician merchant from Citium, a town on Cyprus. Somewhere around his thirtieth year, the story goes, he was shipwrecked near Athens and lost a cargo of purple dye — a fortune. Wandering the city, he sat down in a bookshop and heard the bookseller reading Xenophon's recollections of Socrates. Zeno asked where a man like that could be found. The bookseller pointed at Crates, a Cynic philosopher who happened to be passing, and said: follow him.",
      "He did. For years Zeno studied with Crates and with the other schools of Athens — the Cynics' indifference to comfort and reputation, the logicians' rigor, the Academy's breadth. Around 300 BC he began teaching in his own right, not in a private garden like Epicurus but in the middle of the city, on the Stoa Poikile — the Painted Porch overlooking the marketplace. His students were called the men of the porch: the Stoics.",
      "What he taught was startlingly simple at its core: the only true good is virtue — good character and good judgment — and the only true evil is its absence. Everything else people chase or flee, money, status, health, even life itself, is material to work with, not the measure of a life. Athens, a city not easily impressed, honored the foreigner with a golden crown and a public tomb; the decree said his life had matched his teaching. Looking back on the shipwreck that brought him to philosophy, Zeno liked to say it had been his most profitable voyage.",
    ],
    themes: [
      {
        title: "Virtue is the only good",
        text: "Everything Stoicism became grows from Zeno's claim: character is the one thing that is good in every circumstance, and nothing outside your character can make your life a failure.",
      },
      {
        title: "Live in agreement with nature",
        text: "Zeno's formula for the goal of life. Nature gave humans reason; living well means living by it — seeing things as they are and acting accordingly, rather than being dragged by fear and craving.",
      },
      {
        title: "Philosophy in the marketplace",
        text: "He taught on a public porch, not behind a garden wall. From its first day Stoicism was meant for people in the middle of life — merchants, soldiers, citizens — not for retreat from it.",
      },
    ],
    quote: {
      text: "I made a prosperous voyage when I suffered shipwreck.",
      source: "on the wreck that led him to philosophy — reported by Diogenes Laertius, Lives of the Eminent Philosophers 7",
    },
  },
  {
    slug: "cleanthes",
    name: "Cleanthes",
    dates: "c. 330–230 BC",
    era: "early",
    epithet: "The boxer who hauled water by night to study by day",
    corpusAuthor: null,
    worksNote:
      "Of everything Cleanthes wrote, only fragments remain — but among them is the Hymn to Zeus, the longest surviving piece of early Stoic writing, and the prayer Epictetus quotes at the close of the Enchiridion.",
    image: {
      src: "/stoics/cleanthes.jpg",
      alt: "Marble head of the Stoic philosopher Cleanthes, Ny Carlsberg Glyptotek, Copenhagen",
      position: "center 30%",
      credit:
        "Head of Cleanthes, Ny Carlsberg Glyptotek, Copenhagen. Photo: MumblerJamie, CC BY-SA 2.0, via Wikimedia Commons",
      creditUrl: "https://commons.wikimedia.org/w/index.php?curid=118863249",
    },
    life: [
      "Cleanthes came to Athens from Assos, a town on the Aegean coast of Asia Minor, with four drachmas in his pocket and a boxer's build. To afford philosophy he worked nights: hauling water for a gardener, kneading dough for a baker. By day he sat with Zeno. The Athenians nicknamed him the Well-Water-Gatherer; when a court demanded to know how a man with no visible means lived so decently, he produced his employers as witnesses, and the jurors moved to reward him.",
      "He was not quick, and he knew it. Fellow students mocked him as slow; he called himself a bronze tablet — hard to write on, but what was written stayed. When Zeno died, it was Cleanthes, not a cleverer rival, who led the school, and he led it for over thirty years, holding it together through decades when its doctrines were under attack from every other school in Athens.",
      "His deepest mark on Stoicism is its reverence. For Cleanthes the universe was not a machine but something closer to a living order worthy of devotion, and the good life meant consenting to it willingly. His Hymn to Zeus — the longest fragment of early Stoicism we still have — is philosophy written as prayer. Epictetus, three centuries later, told his students to keep its lines ready at hand for whatever fate brought.",
    ],
    themes: [
      {
        title: "Persistence over brilliance",
        text: "Cleanthes is the school's proof that character outlasts talent. He was mocked as a plodder and became the man Zeno trusted with everything he had built.",
      },
      {
        title: "Willing consent to fate",
        text: "His famous prayer asks Zeus to lead — and promises to follow willingly, because the unwilling get dragged along anyway. Freedom, for Cleanthes, is wanting what happens to happen.",
      },
      {
        title: "Reverence for the rational order",
        text: "Cleanthes gave Stoicism its pious voice: the cosmos as one living whole, worth honoring. The calm the Stoics promise is not resignation but trust in that order.",
      },
    ],
    quote: {
      text: "Lead me, Zeus, and thou, O Destiny, wherever your decrees have fixed my lot. I follow cheerfully; and, did I not, wicked and wretched, I must follow still.",
      source: "his prayer, preserved by Epictetus at the close of the Enchiridion",
      work: "Enchiridion",
    },
  },
  {
    slug: "chrysippus",
    name: "Chrysippus",
    dates: "c. 279–206 BC",
    era: "early",
    epithet: "The runner who wrote the system down — 705 books, none survive",
    corpusAuthor: null,
    worksNote:
      "Chrysippus wrote more than seven hundred books. Not one survives whole — only quotations in later authors. Yet nearly every Stoic argument you will read in Seneca, Epictetus, or Marcus Aurelius runs on rails he laid.",
    image: {
      src: "/stoics/chrysippus.jpg",
      alt: "Marble bust of Chrysippus, British Museum",
      position: "center 30%",
      credit:
        "Bust of Chrysippus, British Museum. Photo: Marie-Lan Nguyen, public domain, via Wikimedia Commons",
      creditUrl: "https://commons.wikimedia.org/w/index.php?curid=1447238",
    },
    life: [
      "Chrysippus of Soli trained as a long-distance runner before he trained as a philosopher, and there is something of the distance runner in what he did next: he wrote over seven hundred books. He came to Athens, studied under Cleanthes, and when he took over the school around 230 BC he set about turning Zeno's vision into a fortress — defining every term, anticipating every objection, answering critics so thoroughly that antiquity said: if Chrysippus had not existed, there would be no Stoa.",
      "His special genius was logic. Chrysippus worked out a logic of propositions — if this, then that — so far ahead of its time that modern logicians rediscovered his results two thousand years later. This was not an academic hobby. For the Stoics, every emotion rides on a judgment, and bad reasoning is how fear, rage, and despair get in. Logic was armor.",
      "That is his deepest legacy: the claim that our passions are not forces that happen to us but opinions we have assented to — and can examine, and can revise. Every modern therapy that teaches people to question the thought behind the feeling is, knowingly or not, working in Chrysippus' shadow. He is said to have died laughing at his own joke, which for a man who spent his life arguing about the good death seems about right.",
    ],
    themes: [
      {
        title: "Emotions are judgments",
        text: "Anger, fear, and grief are not weather systems that strike from outside; they are opinions — usually hasty ones — that we have agreed to. Examine the opinion and the passion loses its grip.",
      },
      {
        title: "Logic as armor",
        text: "Chrysippus made rigorous thinking a spiritual practice. If suffering enters through bad inference, then learning to reason well is not pedantry — it is self-defense.",
      },
      {
        title: "One connected cosmos",
        text: "He argued that everything that happens is woven into a single web of causes. Nothing is random; the task is not to demand exceptions but to play your thread well.",
      },
    ],
    quote: {
      text: "If I had followed the multitude, I should not have studied philosophy.",
      source: "his answer when asked why he stood apart from the crowd — reported by Diogenes Laertius, Lives of the Eminent Philosophers 7",
    },
  },
  {
    slug: "panaetius",
    name: "Panaetius",
    dates: "c. 185–109 BC",
    era: "middle",
    epithet: "The aristocrat who carried the Stoa to Rome",
    corpusAuthor: null,
    worksNote:
      "Panaetius' books are lost, but his most important one survives in disguise: Cicero built On Duties — for centuries one of the most-read books in the West — directly on Panaetius' work of the same name.",
    image: null,
    life: [
      "Panaetius was born to an aristocratic family on Rhodes, studied in Pergamon and Athens, and then did the thing that changed Stoicism's fate: he went to Rome. There he became the friend and house philosopher of Scipio Aemilianus, one of the most powerful Romans of the age, and traveled with him on embassy through the eastern Mediterranean. Through Panaetius, the Roman governing class met Stoic philosophy — and found it suited them.",
      "He suited them partly because he softened the edges. The early Stoa liked to argue from the ideal sage, a figure so perfect no one had ever met one. Panaetius shifted the school's attention to the rest of us: people making progress, holding offices, raising families. His ethics asked not 'what would the perfect man do?' but 'what does decency require of this person, in this role, today?'",
      "His masterwork, On Duties, developed a striking idea: each of us plays several roles at once — a human being, this particular individual, the holder of these circumstances, the chooser of this career — and acting well means honoring all of them. The book is lost, but Cicero rebuilt it in Latin as De Officiis, which became a moral handbook for the West from the Roman Republic to the printing press. In 129 BC Panaetius returned to Athens to lead the school itself, the last great head of the unified Stoa.",
    ],
    themes: [
      {
        title: "Ethics for the imperfect",
        text: "Panaetius aimed philosophy at people making progress, not at a flawless sage. The question is never whether you are perfect — it is whether you are doing today's duty today.",
      },
      {
        title: "The four roles",
        text: "You are a human being, a particular character, a set of circumstances, and a chosen path — all at once. Acting well means playing all four roles honestly, not copying someone else's part.",
      },
      {
        title: "Philosophy for public life",
        text: "Against the temptation to retreat into study, Panaetius argued that duty lives in the forum, the household, and the office — Stoicism as an operating manual for responsibility.",
      },
    ],
    quote: {
      text: "The life of men going through the midst of affairs must defend itself like a boxer — hands up, on guard against every sudden blow of circumstance.",
      source: "after his On Duties, as reported by Aulus Gellius, Attic Nights 13.28",
    },
  },
  {
    slug: "posidonius",
    name: "Posidonius",
    dates: "c. 135–51 BC",
    era: "middle",
    epithet: "The scientist of the school — he mapped the tides and measured the earth",
    corpusAuthor: null,
    worksNote:
      "Everything Posidonius wrote — histories, geographies, treatises on the soul, the tides, the sun — is lost except as fragments quoted by later authors. His reputation survived: antiquity called him the most learned man of his age.",
    image: {
      src: "/stoics/posidonius.jpg",
      alt: "Marble bust of Posidonius, National Archaeological Museum, Naples",
      position: "center 22%",
      credit:
        "Bust of Posidonius, National Archaeological Museum, Naples. Photo: Yair Haklai, CC BY-SA 4.0, via Wikimedia Commons",
      creditUrl: "https://commons.wikimedia.org/w/index.php?curid=140035080",
    },
    life: [
      "Posidonius, born in Apamea in Syria and a student of Panaetius, settled on Rhodes and made it the intellectual capital of the Mediterranean. He was a Stoic the way a river is wet — thoroughly, and in motion. He wrote a fifty-two-book history of his own times. He traveled to Spain to study the Atlantic tides and connected them to the moon. He estimated the circumference of the earth and the distance to the sun. Romans crossed the sea just to hear him lecture; Cicero studied with him, and Pompey — the most powerful man of the age — visited him twice.",
      "For Posidonius none of this was a sideline from philosophy. If the Stoics were right that the cosmos is one rational, interconnected whole, then studying its parts — weather, peoples, planets, history — was studying the divine order itself. He came closer than anyone in antiquity to the modern idea that all knowledge is one fabric.",
      "The most famous story about him is from his sickroom. When Pompey came to pay his respects, Posidonius was crippled by gout — and delivered, from his bed, a lecture arguing that pain is not an evil, pausing during the spasms to address the pain directly: nothing you do will make me admit you are bad. It is the Middle Stoa in one scene: enormous learning, and a doctrine tested where it hurts.",
    ],
    themes: [
      {
        title: "All knowledge is one",
        text: "Tides, history, astronomy, ethics — for Posidonius these were chapters of a single subject, the rational order of the world. Curiosity was a form of piety.",
      },
      {
        title: "Pain is not an evil",
        text: "Not a claim that pain doesn't hurt, but that hurting is not the same as being harmed. What pain cannot touch — judgment, character — is where your good actually lives.",
      },
      {
        title: "Understand causes",
        text: "His histories traced events to their causes in human character and circumstance. The Stoic discipline of seeing things as they are, applied to nations as much as to individuals.",
      },
    ],
    quote: {
      text: "Do your worst, Pain — nothing you do will make me admit that you are an evil.",
      source: "lecturing through illness during Pompey's visit — reported by Cicero, Tusculan Disputations 2",
    },
  },
  {
    slug: "cato",
    name: "Cato the Younger",
    fullName: "Marcus Porcius Cato Uticensis",
    dates: "95–46 BC",
    era: "roman",
    epithet: "Rome's unbending conscience",
    corpusAuthor: null,
    worksNote:
      "Cato wrote no philosophy — he was philosophy, as far as Rome was concerned. You meet him constantly in Seneca's essays in the Library, where he appears as the standing proof that the Stoic ideal can be lived.",
    image: {
      src: "/stoics/cato.jpg",
      alt: "Bronze bust of Cato the Younger, found at Volubilis, Archaeological Museum of Rabat",
      position: "center 20%",
      credit:
        "Bronze bust of Cato the Younger, from Volubilis, Archaeological Museum of Rabat. Photo: Prioryman, CC BY-SA 3.0, via Wikimedia Commons",
      creditUrl: "https://commons.wikimedia.org/w/index.php?curid=22504625",
    },
    life: [
      "Cato was a Roman senator, great-grandson of a legendary censor, and the rare politician whose enemies conceded his honesty. In an age when every office in Rome could be bought, Cato as treasury official audited the books, prosecuted the corrupt clerks everyone else found convenient, and made exactness fashionable for about as long as he held the job. He wore a plain toga, walked where others rode, and voted his conscience with a stubbornness that infuriated allies and opponents alike.",
      "He had studied Stoicism seriously and practiced it in the most public arena on earth. When Julius Caesar's ambition tipped the Republic into civil war, Cato — no admirer of Pompey either — chose the side he thought lawful. After the decisive defeat, holed up in the African city of Utica, he arranged safe passage for his companions, spent his last evening reading Plato on the soul, and took his own life rather than let Caesar make a show of pardoning him. Caesar's clemency was real, and it was also power; Cato refused to owe his life to a man he believed had stolen Rome's liberty.",
      "Rome never got over it. Within a generation 'Cato' meant incorruptibility itself. For the Stoic writers he became the great modern example — proof that the sage was not a thought experiment. Seneca, who fills his essays with him, put it flatly: the gods gave us Cato as a pattern of the wise man, surer than any hero of legend.",
    ],
    themes: [
      {
        title: "Integrity is not for sale",
        text: "Cato's public life was one long demonstration that a person can hold power without being held by it. The Stoics pointed to him whenever anyone said virtue was fine in theory.",
      },
      {
        title: "Principle has a price",
        text: "His refusals cost him alliances, elections, and finally his life. The Stoic claim is not that integrity is free — it is that what you keep by paying is worth more than what you save by folding.",
      },
      {
        title: "The exemplar",
        text: "The Stoics taught by example as much as argument: pick a standard, they said, and live as if that person were watching. For Rome, and for Seneca's essays, that standard was Cato.",
      },
    ],
    quote: {
      text: "It is more certain that the immortal gods have given Cato as a pattern of a wise man to us, than that they gave Ulysses or Hercules to the earlier ages.",
      source: "Seneca, On the Firmness of the Wise Man 2",
      work: "On the Firmness of the Wise Man",
    },
  },
  {
    slug: "seneca",
    name: "Seneca",
    fullName: "Lucius Annaeus Seneca",
    dates: "c. 4 BC – AD 65",
    era: "roman",
    epithet: "Statesman, playwright, and the master of the philosophical letter",
    corpusAuthor: "Seneca",
    image: {
      src: "/stoics/seneca.jpg",
      alt: "Marble double herm portrait of Seneca, inscribed with his name, Antikensammlung Berlin",
      position: "center 25%",
      credit:
        "Seneca, from the double herm of Socrates and Seneca, Antikensammlung Berlin. Photo: Sergey Sosnovskiy, CC BY-SA 4.0, via Wikimedia Commons",
      creditUrl: "https://commons.wikimedia.org/w/index.php?curid=172027504",
    },
    life: [
      "Seneca was born in Corduba, Spain, and rose in Rome as an orator and senator so talented that one emperor reportedly considered having him killed out of envy. Another settled for exile: in AD 41 Claudius banished him to Corsica on a charge few historians believe. He spent eight years on that rock writing consolations — to his mother, among others, on the grief of his own absence — before the empress Agrippina recalled him for a fateful job: tutor to her twelve-year-old son, Nero.",
      "When Nero took the throne, Seneca became the most powerful civilian in the empire, drafting speeches, steering policy, and growing enormously rich — a fact his critics never let him forget. The tension between his wealth and his philosophy is real, and he knew it; his answer, in essays like On the Happy Life, was that the wise man may hold fortune's gifts as long as he can drop them without flinching. In AD 62, as Nero curdled into tyranny, Seneca asked to retire, offering the emperor his entire fortune on the way out.",
      "The retirement years gave us his masterpiece: the Moral Letters to Lucilius, one man writing to a friend about fear, time, friendship, illness, travel, and death — philosophy at the scale of a single Tuesday. In AD 65 Nero, sweeping up after a conspiracy Seneca probably had no part in, ordered his old tutor to die. Tacitus records the scene: Seneca calm, consoling his friends, dictating to the end — allowed at last to practice the lesson he had rehearsed in every letter.",
    ],
    themes: [
      {
        title: "Time is the only possession",
        text: "We guard our money and squander our hours. Seneca's most piercing theme: life is long enough if you actually live it, and no one hands your wasted years back.",
      },
      {
        title: "Rehearse adversity",
        text: "Set aside days to eat plainly and dress roughly, he advised, and ask: is this what I feared? Practicing loss in advance shrinks fortune's power to terrify.",
      },
      {
        title: "Anger is temporary madness",
        text: "His essay Of Anger is the ancient world's fullest anatomy of rage — how it starts, what it costs, and how a delay, a mirror, or a night's sleep starves it.",
      },
      {
        title: "Philosophy between friends",
        text: "The Letters model philosophy as correspondence: honest, specific, one day at a time. Wisdom, for Seneca, is something friends build in each other.",
      },
    ],
    quote: {
      text: "It is not that we have a short space of time, but that we waste much of it. Life is long enough … if the whole of it is well invested.",
      source: "On the Shortness of Life 1",
      work: "On the Shortness of Life",
    },
  },
  {
    slug: "musonius-rufus",
    name: "Musonius Rufus",
    fullName: "Gaius Musonius Rufus",
    dates: "c. AD 30–101",
    era: "roman",
    epithet: "The Roman Socrates — exiled twice, never silenced",
    corpusAuthor: "Musonius Rufus",
    image: null,
    life: [
      "Musonius Rufus was a Roman knight from an Etruscan family who chose the least profitable career open to his class: teaching philosophy as a way of life. Rome called him its Socrates. Like Socrates he wrote nothing; the Lectures in our Library are the notes his students kept. And like Socrates he treated philosophy as something you do — with your diet, your marriage, your money, your temper — not something you discuss.",
      "His convictions made emperors nervous. Nero exiled him to Gyaros, a waterless island used for the empire's unwanted; Musonius set up school there, and students sailed out to the barren rock to study with him. Back in Rome, when Vespasian banished every philosopher from the city, Musonius alone was at first exempted — too respected to touch. He was eventually exiled anyway, and recalled again. Nothing in the record suggests any of it changed his teaching by a syllable.",
      "What he taught was strikingly ahead of its time. Women, he argued, have received the same reason from the gods as men and should study philosophy. He questioned the Roman practice of exposing unwanted infants, championed farming and manual work as fit occupations for a philosopher, and preached a simplicity of food, dress, and furniture that made wealth look like clutter. His greatest legacy sat in his classroom: a lame former slave named Epictetus.",
    ],
    themes: [
      {
        title: "Practice over theory",
        text: "Virtue, he taught, is like medicine or music: knowing the theory is nothing until it is in your hands. Habit — daily, bodily practice — is how philosophy becomes character.",
      },
      {
        title: "Virtue has no gender",
        text: "His argument that women should study philosophy rests on pure Stoic ground: reason is the human inheritance, all of it, for all of us.",
      },
      {
        title: "The simple life",
        text: "Plain food, plain clothes, a plain house. Not asceticism for its own sake, but training: every need you outgrow is a handle fortune loses.",
      },
    ],
    quote: {
      text: "Virtue is a science that is not only theoretical but also practical, just as medicine and music are.",
      source: "Lectures 6",
      work: "Lectures",
    },
  },
  {
    slug: "epictetus",
    name: "Epictetus",
    dates: "c. AD 50–135",
    era: "roman",
    epithet: "Born a slave, he taught Rome what freedom is",
    corpusAuthor: "Epictetus",
    image: {
      src: "/stoics/epictetus.jpg",
      alt: "Engraved imagined portrait of Epictetus with his crutch, writing at a desk — frontispiece to a 1715 edition of the Enchiridion",
      position: "center 22%",
      credit:
        "Imagined portrait of Epictetus — frontispiece to the Enchiridion (Oxford, 1715), engraving by Michael Burghers after William Sonmans. Public domain, via Wikimedia Commons",
      creditUrl: "https://commons.wikimedia.org/w/index.php?curid=130344084",
    },
    life: [
      "Epictetus was born a slave in Hierapolis, in what is now Turkey; even his name is not a name — epiktetos means 'acquired.' He was owned by Epaphroditus, a powerful freedman at Nero's court, and he was lame. One ancient story says his master twisted his leg until it broke while Epictetus calmly predicted the result; a drier source blames rheumatism. Either way he walked through life on a crutch, and treated the leg as his standing example of what is not up to us.",
      "While still enslaved he was permitted to study with Musonius Rufus, and after gaining his freedom he taught in Rome — until the emperor Domitian banished the philosophers. Epictetus moved to Nicopolis, on the western coast of Greece, and built the most famous school in the Roman world. He owned a mat, a lamp, and little else; when someone stole the iron lamp, he replaced it with a clay one. Late in life, unmarried and ascetic, he took in an infant who would otherwise have been abandoned, and raised the child with a woman's help.",
      "He wrote nothing. His student Arrian transcribed the classroom sessions that became the Discourses and distilled them into the Enchiridion — the 'handbook.' Its first sentence is the most consequential sorting rule in ancient philosophy: some things are within our power, and some are not. Half a century after his death, the most powerful man alive — Marcus Aurelius — was studying a copy of the Discourses and taking notes.",
    ],
    themes: [
      {
        title: "The dichotomy of control",
        text: "Your judgments, aims, and efforts are yours; your body, reputation, and fortune are not. Every Stoic exercise since is a footnote to sorting the first pile from the second.",
      },
      {
        title: "You are your judgments",
        text: "Men are disturbed not by things but by their views of things. The event is raw material; the verdict — catastrophe or assignment — is always yours.",
      },
      {
        title: "Freedom is internal",
        text: "A man who had been property redefined liberty: the person who craves what others control is a slave with extra steps. Want only what is yours, and no one can compel you.",
      },
    ],
    quote: {
      text: "Men are disturbed not by things, but by the views which they take of things.",
      source: "Enchiridion 5",
      work: "Enchiridion",
    },
  },
  {
    slug: "marcus-aurelius",
    name: "Marcus Aurelius",
    dates: "AD 121–180",
    era: "roman",
    epithet: "The emperor who wrote only to himself",
    corpusAuthor: "Marcus Aurelius",
    image: {
      src: "/stoics/marcus-aurelius.jpg",
      alt: "Marble bust of Marcus Aurelius, Glyptothek, Munich",
      position: "center 30%",
      credit:
        "Bust of Marcus Aurelius, Glyptothek, Munich. Photo: Bibi Saint-Pol, public domain, via Wikimedia Commons",
      creditUrl: "https://commons.wikimedia.org/w/index.php?curid=159822688",
    },
    life: [
      "Marcus was noticed early. The emperor Hadrian, charmed by the boy's earnestness, nicknamed him Verissimus — 'truest' — and arranged the adoption that set him on the path to the throne. He got the finest education in the empire and, at around age twenty-five, encountered the Discourses of Epictetus through his teacher Rusticus. The borrowed copy of a dead ex-slave's classroom notes did more to shape the most powerful man in the world than all his tutors in rhetoric combined.",
      "He became emperor in AD 161, and almost nothing went well. A war with Parthia; soldiers returning with a plague that killed millions across the empire; Germanic tribes breaking the Danube frontier, pulling Marcus north for years of grinding warfare; a flood; a famine; finally the revolt of a trusted general. He was a man built for the study who spent two decades in an army tent, and he governed, by the account of even hostile historians, with patience and without cruelty.",
      "In that tent, at night, he wrote Greek notes to himself that he never titled and never meant anyone to read — reminders to get out of bed, to forgive the obstructive colleague, to see the day's obstacle as the day's material, to hold his post like a soldier and die with a good grace when relieved. The notebooks survived him by accident and became the Meditations: the rarest document we have, the private voice of absolute power talking itself into being good. He died on campaign in AD 180, still writing, still unconvinced he had gotten there.",
    ],
    themes: [
      {
        title: "The obstacle becomes the way",
        text: "The mind converts every hindrance into material for action, he reminded himself in the middle of a war he never wanted. What blocks the plan becomes the plan.",
      },
      {
        title: "The inner citadel",
        text: "Retreat, he wrote, not to the seaside but into your own mind — the one fortress no plague, senate, or army can enter without your consent.",
      },
      {
        title: "Do the thing at hand",
        text: "His working method for impossible years: stop imagining the whole crushing future and perform the present action with care, as if it were your last.",
      },
      {
        title: "You could leave life right now",
        text: "Marcus kept death on his desk not as morbidity but as a lens: let it decide what deserves today, and how you treat the people in it.",
      },
    ],
    quote: {
      text: "That which is a hindrance is made a furtherance to an act; and that which is an obstacle on the road helps us on this road.",
      source: "Meditations 5.20",
      work: "Meditations",
    },
  },
];

export function findStoic(slug: string): Stoic | undefined {
  return STOICS.find((s) => s.slug === slug);
}
