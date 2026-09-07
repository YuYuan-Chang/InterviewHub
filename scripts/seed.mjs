#!/usr/bin/env node
/**
 * Seeds demo users/posts/comments through the public API:
 *   BASE_URL=http://localhost:8080 node scripts/seed.mjs
 *
 * Re-runnable: users are register-or-login, posts are matched by (author, title)
 * and comments by (author, body), so a second run tops up whatever is missing
 * instead of duplicating the whole dataset.
 */
import zlib from 'node:zlib';

const BASE = process.env.BASE_URL ?? 'http://localhost:8080';

async function api(path, { method = 'GET', token, body, formData } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: formData ?? (body !== undefined ? JSON.stringify(body) : undefined),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

// ---------------------------------------------------------------- attachments

/** A tiny but valid single-page PDF, so attachment tiles have something to preview. */
function makePdf(text) {
  const stream = `BT /F1 18 Tf 50 720 Td (${text}) Tj ET`;
  const objs = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj',
    `4 0 obj << /Length ${stream.length} >> stream\n${stream}\nendstream endobj`,
    '5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [];
  for (const o of objs) {
    offsets.push(pdf.length);
    pdf += o + '\n';
  }
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += `${String(off).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer << /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, 'latin1');
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function pngChunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  let crc = -1;
  for (const byte of out.subarray(4, 8 + data.length)) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  out.writeUInt32BE((crc ^ -1) >>> 0, 8 + data.length);
  return out;
}

/** Solid-colour 64x64 PNG — gives every seeded profile a distinguishable avatar. */
function makePng(hex) {
  const size = 64;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const stride = size * 3 + 1;
  const raw = Buffer.alloc(size * stride);
  for (let y = 0; y < size; y++) {
    const row = y * stride; // raw[row] === 0 → filter type "none"
    for (let x = 0; x < size; x++) {
      raw[row + 1 + x * 3] = r;
      raw[row + 2 + x * 3] = g;
      raw[row + 3 + x * 3] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

async function upload(token, buffer, name, mime) {
  const fd = new FormData();
  fd.append('file', new Blob([buffer], { type: mime }), name);
  return api('/api/files', { method: 'POST', token, formData: fd });
}

// ---------------------------------------------------------------------- data

const USERS = [
  {
    username: 'mchen',
    displayName: 'Maya Chen',
    school: 'UC Berkeley',
    targetRoles: ['SWE intern'],
    color: '#4f46e5',
    bio: 'CS + stats @ Berkeley. Interned at a fintech last summer, chasing big-tech SWE this cycle. I write up every loop I go through.',
  },
  {
    username: 'dpatel',
    displayName: 'Dev Patel',
    school: 'Georgia Tech',
    targetRoles: ['ML engineer', 'SWE intern'],
    color: '#0ea5e9',
    bio: 'ML masters student. Recovering Kaggle addict. Happy to swap mock interviews — DM me.',
  },
  {
    username: 'slee',
    displayName: 'Sarah Lee',
    school: 'UW',
    targetRoles: ['PM intern'],
    color: '#ec4899',
    bio: 'Informatics @ UW, PM intern hopeful. Obsessed with product sense frameworks that survive contact with a real interviewer.',
  },
  {
    username: 'jrivera',
    displayName: 'Jordan Rivera',
    school: 'UIUC',
    targetRoles: ['SWE intern', 'Infra engineer'],
    color: '#16a34a',
    bio: 'Distributed systems TA. I like boring technology and well-indexed databases.',
  },
  {
    username: 'akhan',
    displayName: 'Amina Khan',
    school: 'University of Michigan',
    targetRoles: ['Data scientist', 'ML engineer'],
    color: '#f59e0b',
    bio: 'Stats PhD student. Most of my interview prep is just remembering that variance exists.',
  },
  {
    username: 'tokafor',
    displayName: 'Tobi Okafor',
    school: 'Carnegie Mellon',
    targetRoles: ['SWE new grad'],
    color: '#7c3aed',
    bio: 'New grad 2026. Three internships, zero return offers, one very long spreadsheet of lessons learned.',
  },
  {
    username: 'lnguyen',
    displayName: 'Linh Nguyen',
    school: 'UT Austin',
    targetRoles: ['Security engineer'],
    color: '#dc2626',
    bio: 'AppSec-focused. CTF on weekends. I will absolutely ask about your threat model.',
  },
  {
    username: 'rgomez',
    displayName: 'Rafa Gomez',
    school: 'NYU',
    targetRoles: ['Quant researcher', 'SWE intern'],
    color: '#0d9488',
    bio: 'Math undergrad prepping for trading firms. Probability puzzles, mental math drills, and too much coffee.',
  },
  {
    username: 'ehoffman',
    displayName: 'Elena Hoffman',
    school: 'University of Waterloo',
    targetRoles: ['PM intern', 'APM'],
    color: '#d946ef',
    bio: 'Waterloo co-op, 4 terms in. Collecting APM loop notes so the next cohort has it easier than I did.',
  },
  {
    username: 'kmori',
    displayName: 'Kenji Mori',
    school: 'UC San Diego',
    targetRoles: ['iOS engineer', 'SWE new grad'],
    color: '#2563eb',
    bio: 'Shipped two apps to the App Store. Take-homes are my favourite format and I will die on that hill.',
  },
];

/** [followerIndex, followeeIndex] — dense enough that every Following feed has content. */
const FOLLOWS = [
  [1, 0], [2, 0], [3, 0], [5, 0], [8, 0],
  [0, 1], [4, 1], [5, 1], [9, 1], [3, 1],
  [0, 2], [8, 2], [9, 2],
  [0, 3], [5, 3], [6, 3],
  [1, 4], [7, 4], [2, 4],
  [0, 5], [3, 5], [9, 5],
  [3, 6], [4, 6],
  [4, 7], [1, 7],
  [2, 8], [5, 8], [0, 8],
  [6, 9], [7, 9], [0, 9],
];

const PDF = 'pdf';
const MD = 'md';

const POSTS = [
  {
    by: 0,
    title: 'My Google SWE intern interview notes (2026)',
    description: 'Phone screen + onsite breakdown, with the exact LeetCode list I used.',
    tags: ['swe intern', 'google', 'coding'],
    upvotes: 8,
    attach: { kind: PDF, name: 'google-swe-intern-notes.pdf', label: 'Google SWE intern - loop notes' },
  },
  {
    by: 1,
    title: 'System design primer for interns',
    description: 'You do NOT need to know Paxos. Here is what they actually ask.',
    tags: ['system design', 'swe intern'],
    upvotes: 7,
  },
  {
    by: 1,
    title: 'Meta ML engineer loop — full debrief',
    description: 'ML depth round was 80% of the decision. Prep accordingly.',
    tags: ['ml engineer', 'meta', 'behavioral'],
    upvotes: 6,
  },
  {
    by: 2,
    title: 'Behavioral answers that actually worked',
    description: 'My STAR bank for "tell me about a conflict" and friends.',
    tags: ['behavioral'],
    upvotes: 5,
  },
  {
    by: 3,
    title: 'Amazon OA 2026: the two questions I got',
    description:
      'Both were medium-difficulty and both were about grouping things. The workstyle survey at the end matters more than people say — answer it consistently, not aspirationally.',
    tags: ['amazon', 'coding', 'online assessment'],
    upvotes: 6,
  },
  {
    by: 3,
    title: 'How I structured 6 weeks of LeetCode',
    description:
      'Weeks 1-2 arrays/hashing, week 3 two pointers + sliding window, week 4 trees/graphs, week 5 DP, week 6 mixed timed sets. 3 problems a day, 45 minutes hard cap, review notes on Sunday.',
    tags: ['coding', 'study plan', 'leetcode'],
    upvotes: 9,
    attach: { kind: MD, name: 'six-week-plan.md', label: '# Six-week LeetCode plan\n\nDay-by-day breakdown with problem links and a Sunday review checklist.\n' },
  },
  {
    by: 4,
    title: 'Databricks data scientist onsite — stats round breakdown',
    description:
      'Two hours of applied stats: sampling bias, confidence intervals from scratch, and a "your metric moved 3%, is it real" case. No LeetCode at all.',
    tags: ['databricks', 'data scientist', 'statistics'],
    upvotes: 5,
  },
  {
    by: 4,
    title: 'SQL questions that show up in every DS loop',
    description:
      'Window functions, self-joins for funnels, and one gnarly "median without a median function" question. Ten queries with answers attached.',
    tags: ['sql', 'data scientist', 'coding'],
    upvotes: 7,
    attach: { kind: MD, name: 'sql-drills.md', label: '# SQL drills\n\n10 questions, 10 answers, ordered by how often I was asked them.\n' },
  },
  {
    by: 5,
    title: 'Stripe integration round: what "build a real thing" means',
    description:
      'You get a stubbed API and 90 minutes. They are watching how you handle pagination, retries, and error paths — not whether you finish.',
    tags: ['stripe', 'swe new grad', 'coding'],
    upvotes: 8,
  },
  {
    by: 5,
    title: 'New grad resume rewrite that tripled my callbacks',
    description:
      'Before/after attached. The change that mattered: every bullet became "did X using Y, measured by Z" and the projects section lost two entries.',
    tags: ['resume', 'swe new grad'],
    upvotes: 9,
    attach: { kind: PDF, name: 'resume-before-after.pdf', label: 'Resume: before and after' },
  },
  {
    by: 6,
    title: 'Security engineer loop at Cloudflare — threat modeling round',
    description:
      'Given a photo-sharing app, enumerate trust boundaries and abuse cases in 45 minutes. STRIDE is enough scaffolding; what they want is prioritisation.',
    tags: ['cloudflare', 'security', 'system design'],
    upvotes: 4,
  },
  {
    by: 6,
    title: 'Reading CVEs as interview prep',
    description:
      'Fifteen minutes a day on recent advisories gave me concrete examples for every "tell me about a vulnerability class" question. Here is my reading list.',
    tags: ['security', 'study plan'],
    upvotes: 3,
  },
  {
    by: 7,
    title: 'Jane Street first round: mental math and probability',
    description:
      'Eight minutes of arithmetic under time pressure, then three probability questions that were really conditional-expectation questions in a trench coat.',
    tags: ['jane street', 'quant', 'probability'],
    upvotes: 6,
  },
  {
    by: 7,
    title: 'Probability puzzles I bombed (and the fixes)',
    description:
      'Gambler ruin, the two-envelope trap, and expected number of rolls to see all six faces. My mistake every time: not writing down the state space first.',
    tags: ['quant', 'probability'],
    upvotes: 5,
  },
  {
    by: 8,
    title: 'APM interviews: the product sense rubric nobody tells you',
    description:
      'They score on user empathy, structure, prioritisation, and metrics. If you name your metric before your solution you are already ahead of half the pool.',
    tags: ['pm intern', 'apm', 'product sense'],
    upvotes: 8,
  },
  {
    by: 8,
    title: 'Estimation questions — my whiteboard template',
    description:
      'Population, penetration, frequency, then a sanity check against something you actually know. The template is attached; it has never let me down.',
    tags: ['pm intern', 'estimation'],
    upvotes: 6,
    attach: { kind: MD, name: 'estimation-template.md', label: '# Estimation template\n\nPopulation -> penetration -> frequency -> sanity check.\n' },
  },
  {
    by: 9,
    title: 'iOS take-home at Airbnb: scope it down',
    description:
      'Two days, one spec, way too many optional requirements. I shipped three screens with tests instead of six without, and that was the right call.',
    tags: ['airbnb', 'ios', 'take home'],
    upvotes: 7,
  },
  {
    by: 9,
    title: 'Swift concurrency questions I got asked 3 times',
    description:
      'Actor reentrancy, why @MainActor is not a mutex, and structured concurrency vs detached tasks. Same three, three different companies.',
    tags: ['ios', 'coding'],
    upvotes: 4,
  },
  {
    by: 0,
    title: 'Nvidia infra intern: the CUDA questions were softer than expected',
    description:
      'Mostly memory hierarchy intuition and one profiling walkthrough. If you can explain coalesced access clearly you are fine.',
    tags: ['nvidia', 'infra', 'swe intern'],
    upvotes: 5,
  },
  {
    by: 0,
    title: 'Recruiter screens: 12 questions to ask back',
    description:
      'Team allocation, intern-to-return conversion rate, and what the loop actually contains. Asking about the loop early changed how I prepped for two companies.',
    tags: ['recruiting', 'behavioral'],
    upvotes: 6,
  },
  {
    by: 1,
    title: 'OpenAI research engineer screen — what they actually probe',
    description:
      'Less "implement attention from scratch" than expected, more "here is a training curve, tell me what went wrong". Debugging intuition over recall.',
    tags: ['openai', 'ml engineer', 'research'],
    upvotes: 9,
  },
  {
    by: 2,
    title: 'PM intern take-home: Figma prototype expectations',
    description:
      'Nobody expects production polish. They expect one flow, annotated decisions, and an explicit list of what you cut. Sample deck attached.',
    tags: ['pm intern', 'take home', 'product sense'],
    upvotes: 5,
    attach: { kind: PDF, name: 'pm-takehome-sample.pdf', label: 'PM take-home - sample submission' },
  },
  {
    by: 3,
    title: 'Netflix senior loop debrief (from a mentor)',
    description:
      'Shared with permission. The system design round went two levels deeper on failure modes than any intern loop I have seen — useful as a stretch target.',
    tags: ['netflix', 'system design', 'behavioral'],
    upvotes: 7,
  },
  {
    by: 4,
    title: 'A/B test design questions, ranked by frequency',
    description:
      'Sample size and power came up in every single loop. Novelty effects and peeking came up in half. Switchback tests only at the marketplace companies.',
    tags: ['statistics', 'data scientist', 'a/b testing'],
    upvotes: 8,
  },
  {
    by: 5,
    title: 'Datadog on-site: debugging a live service',
    description:
      'They hand you a dashboard with a real-looking incident and watch you form hypotheses. Narrate everything — silence reads as being stuck.',
    tags: ['datadog', 'infra', 'debugging'],
    upvotes: 6,
  },
  {
    by: 6,
    title: 'Offer negotiation: the email that got me +12%',
    description:
      'Three sentences, one competing offer, no ultimatum. Full text inside, including the part where I asked for the sign-on instead of base.',
    tags: ['negotiation', 'offers'],
    upvotes: 9,
  },
  {
    by: 7,
    title: 'Market-making game walkthrough',
    description:
      'You quote a two-sided market on a dice sum, they trade against you, and your spread tells them how you think about risk. Widen when you are uncertain.',
    tags: ['quant', 'jane street', 'probability'],
    upvotes: 4,
  },
  {
    by: 8,
    title: 'Interview scheduling logistics that saved my finals week',
    description:
      'Batch onsites into one week, never take a loop the day after a midterm, and always ask for the afternoon slot if you are not a morning person.',
    tags: ['recruiting', 'pm intern'],
    upvotes: 3,
  },
];

/** Comment trees. `by` indexes USERS; replies nest arbitrarily deep. */
const THREADS = [
  {
    post: 0,
    comments: [
      {
        by: 1,
        body: 'Which round was the hardest?',
        upvotes: 2,
        replies: [
          {
            by: 0,
            body: 'The onsite coding round — two mediums in 45 min.',
            upvotes: 4,
            replies: [
              { by: 3, body: 'Two mediums in 45 is brutal. Did they let you skip the optimal follow-up?', upvotes: 1 },
              { by: 1, body: 'Same experience at my loop. Speed was the whole test.', upvotes: 2 },
            ],
          },
        ],
      },
      { by: 5, body: 'Saving this. The LeetCode list alone is worth it.', upvotes: 3 },
      {
        by: 8,
        body: 'Did they ask anything behavioral in the phone screen?',
        upvotes: 1,
        replies: [{ by: 0, body: 'Five minutes at the start, nothing scored as far as I could tell.', upvotes: 2 }],
      },
    ],
  },
  {
    post: 1,
    comments: [
      {
        by: 4,
        body: 'Would you still skip consensus algorithms for a new-grad loop, or only for interns?',
        upvotes: 2,
        replies: [
          {
            by: 1,
            body: 'New grad too. Know that consensus exists and when you would reach for it — that is the whole bar.',
            upvotes: 5,
          },
        ],
      },
      { by: 3, body: 'Counterpoint: the infra-flavoured loops do go deeper. Depends on the team.', upvotes: 3 },
    ],
  },
  {
    post: 5,
    comments: [
      {
        by: 0,
        body: 'Did the 45 minute cap ever feel too short?',
        upvotes: 2,
        replies: [
          {
            by: 3,
            body: 'Constantly, and that was the point. Stopping at 45 and reading the editorial taught me more than grinding to 90.',
            upvotes: 6,
          },
          { by: 9, body: 'Adopting this. My "one more try" habit was eating entire evenings.', upvotes: 2 },
        ],
      },
      { by: 6, body: 'The Sunday review is the part everyone skips and it is the part that works.', upvotes: 4 },
    ],
  },
  {
    post: 8,
    comments: [
      {
        by: 9,
        body: 'How much of the stub API did you actually finish?',
        upvotes: 1,
        replies: [
          { by: 5, body: 'Maybe 70%. I spent the last 15 minutes on retry handling and they called it out as the reason I passed.', upvotes: 5 },
        ],
      },
      { by: 2, body: 'Do they let you use your own editor and libraries?', upvotes: 1, replies: [{ by: 5, body: 'Own editor yes, and any library you can install in two minutes.', upvotes: 2 }] },
    ],
  },
  {
    post: 14,
    comments: [
      { by: 2, body: 'Naming the metric before the solution is such a small change and it completely reframes the answer.', upvotes: 5 },
      {
        by: 9,
        body: 'Does this hold for the "design a feature for X" prompts too?',
        upvotes: 1,
        replies: [
          { by: 8, body: 'Especially there. Metric first, then two or three options, then pick one and say why.', upvotes: 3 },
        ],
      },
    ],
  },
  {
    post: 20,
    comments: [
      {
        by: 4,
        body: 'What did the training curve question look like exactly?',
        upvotes: 3,
        replies: [
          {
            by: 1,
            body: 'Loss flat for 2k steps then a clean drop. They wanted "warmup too long / LR too low" and a way to test it.',
            upvotes: 6,
            replies: [{ by: 0, body: 'That is a genuinely good question. Testable, not trivia.', upvotes: 2 }],
          },
        ],
      },
    ],
  },
  {
    post: 23,
    comments: [
      { by: 1, body: 'Peeking came up in three of my four loops. Worth over-preparing.', upvotes: 4 },
      {
        by: 5,
        body: 'Any recommended reading for switchback designs?',
        upvotes: 1,
        replies: [{ by: 4, body: 'The marketplace experimentation posts from the ride-share engineering blogs are the accessible version.', upvotes: 3 }],
      },
    ],
  },
  {
    post: 25,
    comments: [
      {
        by: 3,
        body: 'Did asking for sign-on instead of base cause any pushback?',
        upvotes: 2,
        replies: [
          { by: 6, body: 'None. Sign-on comes out of a different budget, which is exactly why it is the easier ask.', upvotes: 7 },
        ],
      },
      { by: 7, body: 'The no-ultimatum part is underrated. Every horror story I have heard started with a deadline.', upvotes: 4 },
    ],
  },
];

// ------------------------------------------------------------------- seeding

/** Deterministic, author-excluding voter picks — keeps `sort=popular` stable between runs. */
function votersFor(salt, authorIdx, count) {
  const out = [];
  for (let i = 0; out.length < count && i < USERS.length * 2; i++) {
    const idx = (salt * 3 + i) % USERS.length;
    if (idx !== authorIdx && !out.includes(idx)) out.push(idx);
  }
  return out;
}

/** Public reading lists, so a fresh demo has collections to browse. */
const COLLECTIONS = [
  {
    by: 0,
    name: 'Big tech SWE loop',
    description: 'Everything I reread the week before an onsite.',
    isPrivate: false,
    posts: [0, 1, 2],
  },
  {
    by: 3,
    name: 'Behavioral prep',
    description: 'STAR stories and the questions that keep coming back.',
    isPrivate: false,
    posts: [4, 5],
  },
  {
    by: 1,
    name: 'Read later',
    description: '',
    isPrivate: true,
    posts: [6, 7],
  },
];

const stats = { users: 0, posts: 0, comments: 0, files: 0, collections: 0 };
const tokens = [];

async function seedUsers() {
  for (const u of USERS) {
    const email = `${u.username}@example.com`;
    let t;
    try {
      t = await api('/api/auth/register', {
        method: 'POST',
        body: { email, password: 'password123', username: u.username, displayName: u.displayName, school: u.school, targetRoles: u.targetRoles },
      });
      stats.users++;
      console.log(`registered @${u.username}`);
    } catch {
      t = await api('/api/auth/login', { method: 'POST', body: { email, password: 'password123' } });
      console.log(`logged in @${u.username}`);
    }
    tokens.push(t);

    const me = await api('/api/users/me', { token: t.accessToken });
    const patch = { bio: u.bio };
    if (!me.avatarFileId) {
      const avatar = await upload(t.accessToken, makePng(u.color), `${u.username}-avatar.png`, 'image/png');
      patch.avatarFileId = avatar.id;
      stats.files++;
    }
    await api('/api/users/me', { method: 'PATCH', token: t.accessToken, body: patch });
  }
}

async function seedFollows() {
  for (const [follower, followee] of FOLLOWS) {
    await api(`/api/users/${tokens[followee].user.id}/follow`, {
      method: 'POST',
      token: tokens[follower].accessToken,
      body: {},
    });
  }
  console.log(`follow graph: ${FOLLOWS.length} edges`);
}

/** Every post this author already has, keyed by title — the re-run guard. */
async function existingPostsOf(userId) {
  const byTitle = new Map();
  let cursor = null;
  do {
    const qs = `authorId=${userId}&limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
    const page = await api(`/api/posts/feed/explore?${qs}`);
    for (const p of page.items) byTitle.set(p.title, p);
    cursor = page.nextCursor;
  } while (cursor);
  return byTitle;
}

async function seedPosts() {
  const existing = new Map();
  for (const t of tokens) existing.set(t.user.id, await existingPostsOf(t.user.id));

  const created = [];
  for (const [i, p] of POSTS.entries()) {
    const token = tokens[p.by].accessToken;
    let post = existing.get(tokens[p.by].user.id).get(p.title);
    if (post) {
      console.log(`post exists: ${post.title}`);
    } else {
      const fileIds = [];
      if (p.attach) {
        const file =
          p.attach.kind === PDF
            ? await upload(token, makePdf(p.attach.label), p.attach.name, 'application/pdf')
            : await upload(token, Buffer.from(p.attach.label, 'utf8'), p.attach.name, 'text/markdown');
        fileIds.push(file.id);
        stats.files++;
      }
      post = await api('/api/posts', {
        method: 'POST',
        token,
        body: { title: p.title, description: p.description, tags: p.tags, fileIds },
      });
      stats.posts++;
      console.log(`post: ${post.title}`);
    }
    created.push(post);

    for (const voter of votersFor(i, p.by, p.upvotes)) {
      await api(`/api/posts/${post.id}/upvote`, { method: 'PUT', token: tokens[voter].accessToken });
    }
  }
  return created;
}

/** Flatten the comment tree so existing (author, body) pairs can be matched. */
function flattenComments(nodes, out = new Map()) {
  for (const c of nodes) {
    out.set(`${c.authorId}::${c.body}`, c);
    flattenComments(c.replies ?? [], out);
  }
  return out;
}

async function seedThread(postId, nodes, parentId, existing, salt) {
  let n = salt;
  for (const node of nodes) {
    const key = `${tokens[node.by].user.id}::${node.body}`;
    let comment = existing.get(key);
    if (!comment) {
      comment = await api(`/api/comments/post/${postId}`, {
        method: 'POST',
        token: tokens[node.by].accessToken,
        body: { body: node.body, ...(parentId ? { parentId } : {}) },
      });
      stats.comments++;
    }
    for (const voter of votersFor(n, node.by, node.upvotes ?? 0)) {
      await api(`/api/comments/${comment.id}/upvote`, { method: 'PUT', token: tokens[voter].accessToken });
    }
    n += 1;
    if (node.replies?.length) n = await seedThread(postId, node.replies, comment.id, existing, n);
  }
  return n;
}

async function seedComments(posts) {
  for (const [i, thread] of THREADS.entries()) {
    const post = posts[thread.post];
    const { items } = await api(`/api/comments/post/${post.id}`);
    await seedThread(post.id, thread.comments, null, flattenComments(items), i * 7);
  }
  console.log(`comment threads: ${THREADS.length}`);
}

/** Idempotent: collections are keyed by (owner, name), and filing a post twice is a no-op. */
async function seedCollections(posts) {
  for (const spec of COLLECTIONS) {
    const token = tokens[spec.by].accessToken;
    const { items } = await api('/api/collections', { token });
    let collection = items.find((c) => c.name === spec.name);
    if (!collection) {
      collection = await api('/api/collections', {
        method: 'POST',
        token,
        body: { name: spec.name, description: spec.description, isPrivate: spec.isPrivate },
      });
      stats.collections++;
    }
    for (const index of spec.posts) {
      const post = posts[index];
      if (!post) continue;
      await api(`/api/collections/${collection.id}/posts`, { method: 'POST', token, body: { postId: post.id } });
    }
  }
  console.log(`collections: ${COLLECTIONS.length}`);
}

async function main() {
  await seedUsers();
  await seedFollows();
  const posts = await seedPosts();
  await seedComments(posts);
  await seedCollections(posts);

  console.log(
    `\nSeed complete — ${stats.users} new users (${USERS.length} total), ` +
      `${stats.posts} new posts (${POSTS.length} total), ${stats.comments} new comments, ` +
      `${stats.collections} new collections (${COLLECTIONS.length} total), ${stats.files} files uploaded.`,
  );
  console.log('Log in as mchen@example.com / password123 (every seeded user shares that password).');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
