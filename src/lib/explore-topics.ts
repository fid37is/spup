// src/lib/explore-topics.ts
// What each Explore topic looks for. A post belongs to a topic when it carries
// one of the topic's hashtags OR its text contains one of the topic's words.
// Matching on words as well as hashtags matters: most people never type the
// exact interest tag (#football), they write #SuperEagles or no hashtag at all.
//
// Tuning a topic = editing the lists below. No migration, no deploy of SQL.
// `words` are regex fragments matched case-insensitively on whole words
// (Postgres \y boundaries), so "hire" does not match "shire".

export interface ExploreTopic {
  /** hashtags (lowercase, no #) that put a post in this topic */
  tags: string[]
  /** regex fragments matched against the post text */
  words: string[]
}

// Keyed by NIGERIAN_INTERESTS ids (src/types) so a person's saved interests map straight onto these.
export const INTEREST_TOPICS: Record<string, ExploreTopic> = {
  football: {
    tags: ['football', 'soccer', 'supereagles', 'superfalcons', 'epl', 'afcon', 'npfl', 'ucl', 'worldcup', 'fifa'],
    words: ['football', 'soccer', 'super eagles', 'super falcons', 'premier league', 'epl', 'afcon', 'champions league',
      'world cup', 'la liga', 'transfer news', 'arsenal', 'chelsea', 'liverpool', 'man(chester)? (utd|united|city)',
      'barcelona', 'real madrid', 'npfl', 'osimhen', 'fifa'],
  },
  naija_music: {
    tags: ['afrobeats', 'afrobeat', 'naijamusic', 'naija_music', 'amapiano', 'newmusic', 'nigerianmusic'],
    words: ['afrobeats?', 'amapiano', 'new (music|song|album|ep|single)', 'burna boy', 'wizkid', 'davido', 'asake',
      'rema', 'tems', 'ayra starr', 'omah lay', 'music video', 'dropped (a |an |my )?(song|album|ep|single)'],
  },
  nollywood: {
    tags: ['nollywood', 'nigerianmovies', 'africanmovies', 'bbnaija'],
    words: ['nollywood', 'nigerian (movie|film)s?', 'new (movie|film)', 'box office', 'bbnaija', 'big brother naija',
      'netflix naija'],
  },
  politics: {
    tags: ['politics', 'nigeriapolitics', 'inec', 'tinubu', 'endbadgovernance'],
    words: ['politics?', 'politician', 'election', 'inec', 'tinubu', 'atiku', 'peter obi', 'senate', 'senator',
      'house of reps', 'national assembly', 'governor', 'apc', 'pdp', 'labour party', 'protest'],
  },
  business: {
    tags: ['business', 'entrepreneur', 'smallbusiness', 'startup', 'startups', 'investing', 'naira', 'sme'],
    words: ['business', 'entrepreneur(s|ship)?', 'startups?', 'investors?', 'investment', 'naira', 'dollar rate',
      'exchange rate', 'cbn', 'inflation', 'fuel price', 'stock market', 'ngx', 'sme'],
  },
  tech: {
    tags: ['tech', 'technology', 'ai', 'coding', 'programming', 'software', 'developer', 'techtwitter', 'nigeriatech'],
    words: ['tech', 'technology', 'software', 'developers?', 'coding', 'programming', 'javascript', 'python',
      'artificial intelligence', 'chatgpt', 'startup', 'fintech', 'app launch', 'github', 'ui/?ux', 'product manager'],
  },
  fashion: {
    tags: ['fashion', 'ootd', 'style', 'naijafashion', 'ankara', 'thrift'],
    words: ['fashion', 'ootd', 'outfits?', 'ankara', 'aso ebi', 'thrift', 'sneakers?', 'tailor', 'designer', 'stylist'],
  },
  food: {
    tags: ['food', 'nigerianfood', 'jollof', 'foodie', 'recipe', 'cooking'],
    words: ['jollof', 'suya', 'egusi', 'amala', 'pounded yam', 'fried rice', 'recipes?', 'cooking', 'restaurant',
      'nigerian food', 'foodie'],
  },
  comedy: {
    tags: ['comedy', 'skit', 'funny', 'humor', 'humour', 'memes', 'meme'],
    words: ['comedy', 'comedian', 'skits?', 'funny', 'memes?', 'laughing', 'jokes?'],
  },
  crypto: {
    tags: ['crypto', 'bitcoin', 'btc', 'ethereum', 'web3', 'blockchain', 'usdt'],
    words: ['crypto(currency)?', 'bitcoin', 'btc', 'ethereum', 'usdt', 'blockchain', 'web3', 'binance', 'airdrop',
      'p2p', 'nft'],
  },
  education: {
    tags: ['education', 'school', 'jamb', 'waec', 'university', 'scholarship', 'scholarships', 'students'],
    words: ['education', 'school', 'students?', 'jamb', 'waec', 'neco', 'university', 'scholarships?', 'lecturer',
      'exams?', 'admission', 'graduat(e|ion)', 'asuu', 'campus'],
  },
  health: {
    tags: ['health', 'fitness', 'workout', 'wellness', 'gym', 'mentalhealth', 'nutrition'],
    words: ['health', 'fitness', 'workout', 'gym', 'wellness', 'nutrition', 'exercise', 'diet', 'hospital', 'doctor',
      'malaria', 'weight loss'],
  },
  gaming: {
    tags: ['gaming', 'gamer', 'esports', 'fifa', 'cod', 'playstation', 'ps5', 'pubg', 'codm'],
    words: ['gaming', 'gamers?', 'esports', 'playstation', 'ps5', 'xbox', 'pubg', 'cod mobile', 'call of duty',
      'fortnite', 'minecraft', 'game ?pass', 'tournament'],
  },
  travel: {
    tags: ['travel', 'travelnigeria', 'wanderlust', 'vacation', 'tourism'],
    words: ['travel(l?ing)?', 'vacation', 'tourism', 'tourist', 'flight', 'airport', 'road trip', 'tourism'],
  },
  spirituality: {
    tags: ['spirituality', 'faith', 'prayer', 'bible', 'church', 'jesus', 'islam', 'jummah', 'godisgood'],
    words: ['pray(er|ers|ing)?', 'faith', 'bible', 'scripture', 'church', 'sermon', 'pastor', 'jesus', 'god is good',
      'jummah', 'quran', 'ramadan', 'worship'],
  },
  art: {
    tags: ['art', 'artist', 'photography', 'design', 'illustration', 'painting', 'graphicdesign', 'creative'],
    words: ['art', 'artists?', 'painting', 'illustration', 'photography', 'photographer', 'graphic design', 'sketch',
      'drawing', 'exhibition', 'gallery', 'sculpture'],
  },
}

// Extra terms for a whole tab, on top of the interests it already covers.
export const TAB_EXTRAS: Record<string, ExploreTopic> = {
  news: {
    tags: ['news', 'breakingnews', 'breaking', 'nigeriannews'],
    words: ['breaking( news)?', 'just in', 'news'],
  },
  sports: {
    tags: ['sports', 'sport', 'basketball', 'boxing', 'ufc', 'nba', 'athletics', 'tennis', 'wwe'],
    words: ['sports?', 'basketball', 'boxing', 'boxer', 'ufc', 'nba', 'athletics', 'tennis', 'wrestling', 'olympics?',
      'obstacle course', 'ninja warrior'],
  },
}

// Jobs tab: vacancies first, then people talking about work opportunities.
export const JOBS_TOPIC: ExploreTopic = {
  tags: ['jobs', 'job', 'hiring', 'wearehiring', 'nowhiring', 'vacancy', 'vacancies', 'jobalert', 'jobopening',
    'jobsinnigeria', 'jobsnigeria', 'nigeriajobs', 'jobsinlagos', 'jobsinabuja', 'careers', 'recruitment',
    'internship', 'internships', 'remotejobs', 'remotework', 'opentowork', 'jobseeker', 'jobhunt', 'employment'],
  words: [
    "we.?re hiring", 'we are hiring', '(now|currently|still) hiring', 'hiring', 'vacanc(y|ies)',
    'job (opening|opportunit(y|ies)|alert|vacanc(y|ies)|available|offer|listing)s?', 'jobs? (in|at|for)',
    'recruit(ing|ment|er)', 'internships?', 'employment', 'employ(ing|ees?)', 'entry.?level', 'graduate trainee',
    'open to work', 'job ?seekers?', 'job ?hunt(ing)?', 'looking for (a )?(new )?(job|role|work)',
    '(send|submit|email|forward) (your |ur )?(cv|resume|application)', 'application deadline',
    'walk.?in interview', 'full.?time (role|position|job)', 'part.?time (role|position|job)',
    '(remote|hybrid) (role|position|job)s?', 'positions? (open|available)', 'career opportunit(y|ies)',
  ],
}

/** Merge several topics into one tag list + one regex (empty string when there are no words). */
export function mergeTopics(topics: ExploreTopic[]): { tags: string[]; pattern: string } {
  const tags = Array.from(new Set(topics.flatMap(t => t.tags)))
  const words = Array.from(new Set(topics.flatMap(t => t.words)))
  const pattern = words.length ? `\\y(${words.join('|')})\\y` : ''
  return { tags, pattern }
}