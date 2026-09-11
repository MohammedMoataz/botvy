/**
 * Ten articles for the faithfulness review (SC-004) and the one-screen check
 * (SC-006).
 *
 * ## Why they are generated rather than downloaded
 *
 * A fixture that fetches a real page grades somebody else's server. It goes red
 * on a bad afternoon, it changes under the reviewer when the source is edited,
 * and a reviewer comparing a summary against an article that has since been
 * rewritten is comparing two different things. These ten are fixed text, so a
 * summary judged faithful today is judged against the same words next year.
 *
 * ## Why the noise is real
 *
 * Every one of them is wrapped in the same navigation, cookie banner,
 * newsletter box, related-articles rail and footer, because *that* is what the
 * extractor is for. A fixture of bare `<p>` tags would prove Readability can
 * read a paragraph, which was never in doubt. Making the chrome identical
 * across the ten is deliberate: when a summary comes back talking about
 * subscribing to a newsletter, the same chrome in the other nine says the fault
 * is in the extractor rather than in that one page.
 *
 * ## The content
 *
 * Training writing, because that is what a member of this product saves, and
 * deliberately varied in the ways a summariser gets wrong: one hedges, one
 * argues *against* a common belief, one is mostly numbers, one is a list, one
 * is about something else entirely (so a suggestion drawn from it would be
 * wrong), and one is short enough that padding would show. A reviewer checking
 * faithfulness is checking those, not prose quality.
 */

/** The chrome every fixture wears. Identical by design — see the note above. */
function page(article) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${article.title} | The Training Desk</title>
  <meta property="article:published_time" content="${article.publishedAt}">
  <meta name="author" content="${article.author}">
</head>
<body>
  <nav class="site-nav">
    <a href="/">The Training Desk</a>
    <a href="/strength">Strength</a>
    <a href="/endurance">Endurance</a>
    <a href="/nutrition">Nutrition</a>
    <a href="/subscribe">Subscribe</a>
  </nav>
  <div class="cookie-banner">
    We use cookies to improve your experience. Accept all? Manage preferences.
  </div>
  <article>
    <h1>${article.title}</h1>
    <p class="byline">By ${article.author}</p>
    ${article.paragraphs.map((text) => `<p>${text}</p>`).join('\n    ')}
    ${
      article.image
        ? `<figure><img src="${article.image.src}" width="960" height="540" alt="${article.image.alt}"><figcaption>${article.image.alt}</figcaption></figure>`
        : ''
    }
  </article>
  <aside class="newsletter">
    <h3>Get the weekly round-up</h3>
    <p>Join 40,000 lifters. No spam, unsubscribe any time.</p>
    <form><input type="email" placeholder="your@email.com"><button>Sign up</button></form>
  </aside>
  <section class="related">
    <h3>More from The Training Desk</h3>
    <ul>
      <li><a href="/a">Five mobility drills you are doing wrong</a></li>
      <li><a href="/b">Is creatine worth it?</a></li>
      <li><a href="/c">The 90-day beginner plan</a></li>
    </ul>
  </section>
  <footer>
    <img src="/pixel.gif" width="1" height="1" alt="">
    <p>© The Training Desk. All rights reserved. Terms · Privacy</p>
  </footer>
</body>
</html>`;
}

const ARTICLES = [
  {
    slug: 'progressive-overload',
    title: 'Progressive overload is not just adding weight',
    author: 'R. Okonkwo',
    publishedAt: '2026-02-11T09:00:00Z',
    /** What a faithful summary must contain. The reviewer's checklist. */
    mustMention: ['overload', 'reps or sets or volume'],
    paragraphs: [
      'Most lifters hear "progressive overload" and reach for a heavier bar. That is one way to do it and it is the one that stalls first, because the bar only goes up so often before technique or recovery says no.',
      'Volume is the other lever. Three sets of eight at 80 kg is 1,920 kg of work; four sets of eight at the same weight is 2,560 kg. The bar did not move and the session got a third harder.',
      'Range of motion counts too. A squat taken two inches deeper at the same load is a different exercise, and for most people a harder one.',
      'So does density. The same six sets done in 35 minutes instead of 50 is progress you can measure with a clock rather than a plate.',
      'The practical rule: change one variable at a time, and give it three weeks before you decide it did not work.',
    ],
    image: { src: '/img/overload.jpg', alt: 'A loaded barbell on a rack' },
  },
  {
    slug: 'against-stretching',
    title: 'Static stretching before you lift does not help, and may hurt',
    author: 'M. Haddad',
    publishedAt: '2026-01-04T09:00:00Z',
    mustMention: ['static stretching before', 'warm-up or dynamic'],
    paragraphs: [
      'This is going to annoy people: holding a stretch for thirty seconds before a heavy set is, on the evidence, a bad idea.',
      'The reviews are consistent. Static stretching immediately before strength work reduces peak force output by a few per cent for up to an hour afterwards. The effect is small, and it is in the wrong direction.',
      'What it does not do is prevent injury. That claim comes from a warm-up literature that studied general activity, not held stretches, and the two have been conflated for forty years.',
      'Do a warm-up that looks like the thing you are about to do. Light sets of the movement itself, building to the working weight. Five minutes, no mat required.',
      'Stretch afterwards if you enjoy it. There is nothing wrong with it and it is not doing what you were told it does.',
    ],
    image: null,
  },
  {
    slug: 'zone-two',
    title: 'What zone two actually means, in numbers',
    author: 'S. Lindqvist',
    publishedAt: '2026-03-02T09:00:00Z',
    mustMention: ['zone two', 'conversational or heart rate'],
    paragraphs: [
      'Zone two is defined by physiology, not by a watch: it is the hardest you can go while lactate stays roughly flat, which for most people is somewhere between 60 and 70 per cent of maximum heart rate.',
      'For a 35-year-old with a maximum around 185, that is 111 to 130 beats per minute. It will feel insultingly easy for the first month.',
      'The field test is conversation. If you can speak in full sentences but would rather not sing, you are close enough.',
      'Three hours a week is the number that shows up repeatedly in endurance programmes. Two sessions of 90 minutes works as well as three of 60.',
      'The mistake is drifting up. A zone two session done at 145 is a zone three session that leaves you too tired for the hard day, and it is why people plateau.',
    ],
    image: { src: '/img/hr.png', alt: 'A heart rate chart over 90 minutes' },
  },
  {
    slug: 'protein-numbers',
    title: 'How much protein, really',
    author: 'A. Ferreira',
    publishedAt: '2025-11-19T09:00:00Z',
    mustMention: ['1.6', 'per kilogram'],
    paragraphs: [
      'The meta-analyses land on about 1.6 grams per kilogram of bodyweight per day for someone training for size, with the benefit flattening out past roughly 2.2.',
      'For an 80 kg lifter that is 128 grams, and the ceiling worth chasing is around 176.',
      'Distribution matters less than people say. Four meals of 32 grams and three of 43 both work; what fails is 20 grams at lunch and the rest at dinner.',
      'Older trainees need more, not less — the same study set puts the figure nearer 2.0 past sixty, because the muscle-building response to a given dose is blunted.',
      'None of this is a supplement argument. Food gets there for most people and costs less.',
    ],
    image: null,
  },
  {
    slug: 'push-pull-legs',
    title: 'A push-pull-legs week that fits around a job',
    author: 'D. Whelan',
    publishedAt: '2026-02-24T09:00:00Z',
    mustMention: ['push', 'pull', 'legs'],
    paragraphs: [
      'Six days is the classic split and most people cannot hold it. Here is the three-day version, run twice over two weeks so every muscle group is hit five times a fortnight.',
      'Push day: bench press five sets of five, overhead press three sets of eight, dips three sets to two reps short of failure, lateral raises three sets of fifteen.',
      'Pull day: deadlift three sets of five, barbell row four sets of eight, chin-ups four sets to near failure, face pulls three sets of twenty.',
      'Legs: back squat five sets of five, Romanian deadlift three sets of eight, split squats three sets of ten each side, calf raises four sets of twelve.',
      'If you get four days in a week, the fourth is whichever of the three felt worst.',
    ],
    image: null,
  },
  {
    slug: 'sleep-and-lifting',
    title: 'Sleep is the training variable nobody logs',
    author: 'K. Baptiste',
    publishedAt: '2026-01-28T09:00:00Z',
    mustMention: ['sleep', 'recovery or performance'],
    paragraphs: [
      'Restrict trained lifters to five hours a night for a week and their one-rep maxes fall. Restore sleep and they come back. That is about as clean as a training result gets.',
      'The mechanism is not mysterious: less sleep means less growth hormone, higher evening cortisol and worse glucose handling, all pointing the same way.',
      'Eight hours is the target and seven is fine for many people. Under six, nothing else in this article is worth doing.',
      'A nap counts, within reason. Twenty to ninety minutes recovers a meaningful part of a short night; anything longer and you wake up worse.',
      'Log it beside your sets. A bad week in the gym usually has a bad week of sleep two days behind it.',
    ],
    image: null,
  },
  {
    slug: 'deload',
    title: 'Deloading, hedged',
    author: 'P. Ivanova',
    publishedAt: '2025-12-08T09:00:00Z',
    mustMention: ['deload'],
    paragraphs: [
      'I want to be careful here, because the honest answer is that the evidence for planned deloads is thinner than the confidence with which they are recommended.',
      'What is reasonably established: performance drops before it rises after a heavy block, and reducing volume for a week usually brings it back.',
      'What is not established: that a deload every fourth week beats deloading when you need one. The studies that compare the two are small and go both ways.',
      'My own practice, offered as practice and not as evidence: cut volume by half and keep the weight, when two sessions in a row feel harder than they should.',
      'If you are training three days a week and sleeping properly, you may not need one at all.',
    ],
    image: null,
  },
  {
    slug: 'swimming-technique',
    title: 'Four drills that fix a sinking hip in freestyle',
    author: 'N. Adeyemi',
    publishedAt: '2026-03-14T09:00:00Z',
    mustMention: ['freestyle or swim', 'drill'],
    paragraphs: [
      'A sinking hip is almost never a leg-strength problem. It is a head position problem, and the legs are paying for it.',
      'Drill one: kick on your side, lower arm extended, eyes down, for 25 metres a side. If the hips drop, the head is up.',
      'Drill two: six-kick switch. Six kicks on one side, one stroke, six on the other. It builds the rotation that keeps the hips level without thinking about the hips.',
      'Drill three: swim with a pull buoy for 100 metres, then without for 100. The buoy shows you what level hips feel like; the goal is to keep the feeling when it comes out.',
      'Drill four: press the chest. Not the head — the chest. A few degrees is enough and the hips follow.',
    ],
    image: { src: '/img/pool.jpg', alt: 'A swimmer mid-rotation in a 25m pool' },
  },
  {
    slug: 'short-note',
    title: 'On training when you are ill',
    author: 'R. Okonkwo',
    publishedAt: '2026-02-02T09:00:00Z',
    mustMention: ['ill or sick', 'rest or above the neck'],
    paragraphs: [
      'The old rule is above the neck you can train, below the neck you rest, and it is about as good as a rule of thumb gets.',
      'A head cold with no fever: train, lighter, and go home if it gets worse. A chest infection or a temperature: do not.',
      'A week off costs almost nothing. Training through a fever has cost people months.',
    ],
    image: null,
  },
  {
    slug: 'not-about-training',
    title: 'The quiet economics of independent bookshops',
    author: 'L. Marchetti',
    publishedAt: '2026-01-15T09:00:00Z',
    /** Deliberately off-topic — see the note at the top of this file. */
    mustMention: ['bookshop or bookshops'],
    paragraphs: [
      'An independent bookshop makes about 40 per cent on a new hardback and rather less on paperbacks, which is why the coffee counter is not a lifestyle choice.',
      'Rent is the variable that decides everything. A shop paying under fifteen per cent of turnover in rent can survive a bad autumn; one paying twenty-five cannot.',
      'Events are the margin. A reading with forty people and thirty books sold is a good evening in a way that a quiet Saturday is not.',
      'The chains solved this with scale and the internet solved it with warehouses. What is left is a business that runs on a bookseller knowing what you read.',
      'None of which is a reason not to have one on the high street. It is a reason to buy the book there.',
    ],
    image: null,
  },
];

export const ARTICLE_FIXTURES = ARTICLES.map((article) => ({
  ...article,
  url: `https://the-training-desk.test/${article.slug}`,
  html: page(article),
}));
