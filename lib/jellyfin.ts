export interface JellyfinPerson {
  Id: string
  Name: string
  Role?: string
  Type: 'Actor' | 'Director' | 'Writer' | 'Producer'
  PrimaryImageTag?: string
}

export interface JellyfinEpisode {
  Id: string
  Name: string
  IndexNumber: number
  Overview?: string
  RunTimeTicks?: number
}

export interface JellyfinSeason {
  Id: string
  Name: string
  IndexNumber: number
  EpisodeCount: number
  ProductionYear?: number
  Episodes?: JellyfinEpisode[]
}

export interface JellyfinItem {
  Id: string
  Name: string
  OriginalTitle?: string
  Overview?: string
  Taglines?: string[]
  Genres: string[]
  People: JellyfinPerson[]
  RunTimeTicks?: number
  ProductionYear?: number
  OfficialRating?: string
  CommunityRating?: number
  Studios?: { Name: string; Id: string }[]
  BackdropImageTags?: string[]
  ImageTags?: { Primary?: string; Logo?: string }
  Type: 'Movie' | 'Series'
  posterColor: string
  backdropColor: string
  Status?: 'Ended' | 'Continuing'
  SeasonCount?: number
  EpisodeCount?: number
  Seasons?: JellyfinSeason[]
}

function mins(m: number): number {
  return m * 600_000_000
}

const MOCK_JELLYFIN_ITEMS: Record<string, JellyfinItem> = {
  m1: {
    Id: 'm1',
    Name: 'Dune: Part Two',
    OriginalTitle: 'Dune: Part Two',
    Overview:
      'Paul Atreides unites with Chani and the Fremen while seeking revenge against the conspirators who destroyed his family. Facing a choice between the love of his life and the fate of the universe, he must prevent a terrible future only he can foresee.',
    Taglines: ['Long live the fighters.'],
    Genres: ['Science Fiction', 'Adventure', 'Drama'],
    People: [
      { Id: 'p1', Name: 'Denis Villeneuve', Type: 'Director' },
      { Id: 'p2', Name: 'Timothée Chalamet', Role: 'Paul Atreides', Type: 'Actor' },
      { Id: 'p3', Name: 'Zendaya', Role: 'Chani', Type: 'Actor' },
      { Id: 'p4', Name: 'Rebecca Ferguson', Role: 'Lady Jessica', Type: 'Actor' },
      { Id: 'p5', Name: 'Austin Butler', Role: 'Feyd-Rautha', Type: 'Actor' },
      { Id: 'p6', Name: 'Florence Pugh', Role: 'Princess Irulan', Type: 'Actor' },
      { Id: 'p7', Name: 'Dave Bautista', Role: 'Glossu Rabban', Type: 'Actor' },
      { Id: 'p8', Name: 'Christopher Walken', Role: 'Emperor Shaddam IV', Type: 'Actor' },
    ],
    RunTimeTicks: mins(166),
    ProductionYear: 2024,
    OfficialRating: 'PG-13',
    CommunityRating: 8.5,
    Studios: [{ Name: 'Legendary Pictures', Id: 's1' }],
    Type: 'Movie',
    posterColor: 'linear-gradient(135deg, #92400e, #b45309)',
    backdropColor: 'linear-gradient(160deg, #78350f 0%, #1c1917 50%, #09090b 100%)',
  },
  m2: {
    Id: 'm2',
    Name: 'Oppenheimer',
    Overview:
      'The story of J. Robert Oppenheimer\'s role in the development of the atomic bomb during World War II. A portrait of the man who changed the world and must reckon with the consequences of his creation.',
    Taglines: ['The world forever changes.'],
    Genres: ['Drama', 'History', 'Thriller'],
    People: [
      { Id: 'p10', Name: 'Christopher Nolan', Type: 'Director' },
      { Id: 'p11', Name: 'Cillian Murphy', Role: 'J. Robert Oppenheimer', Type: 'Actor' },
      { Id: 'p12', Name: 'Emily Blunt', Role: 'Katherine Oppenheimer', Type: 'Actor' },
      { Id: 'p13', Name: 'Matt Damon', Role: 'Leslie Groves', Type: 'Actor' },
      { Id: 'p14', Name: 'Robert Downey Jr.', Role: 'Lewis Strauss', Type: 'Actor' },
      { Id: 'p15', Name: 'Florence Pugh', Role: 'Jean Tatlock', Type: 'Actor' },
      { Id: 'p16', Name: 'Josh Hartnett', Role: 'Ernest Lawrence', Type: 'Actor' },
    ],
    RunTimeTicks: mins(180),
    ProductionYear: 2023,
    OfficialRating: 'R',
    CommunityRating: 8.9,
    Studios: [{ Name: 'Universal Pictures', Id: 's2' }],
    Type: 'Movie',
    posterColor: 'linear-gradient(135deg, #1e3a5f, #374151)',
    backdropColor: 'linear-gradient(160deg, #1e3a5f 0%, #111827 50%, #09090b 100%)',
  },
  m3: {
    Id: 'm3',
    Name: 'The Holdovers',
    Overview:
      'A cantankerous teacher at a New England prep school is forced to remain on campus over the holidays with a troubled student and the school\'s cook, who has just lost her son in Vietnam.',
    Genres: ['Comedy', 'Drama'],
    People: [
      { Id: 'p20', Name: 'Alexander Payne', Type: 'Director' },
      { Id: 'p21', Name: 'Paul Giamatti', Role: 'Paul Hunham', Type: 'Actor' },
      { Id: 'p22', Name: 'Dominic Sessa', Role: 'Angus Tully', Type: 'Actor' },
      { Id: 'p23', Name: 'Da\'Vine Joy Randolph', Role: 'Mary Lamb', Type: 'Actor' },
    ],
    RunTimeTicks: mins(133),
    ProductionYear: 2023,
    OfficialRating: 'R',
    CommunityRating: 8.0,
    Type: 'Movie',
    posterColor: 'linear-gradient(135deg, #1c4a2a, #374151)',
    backdropColor: 'linear-gradient(160deg, #1c4a2a 0%, #1a1a1a 50%, #09090b 100%)',
  },
  m4: {
    Id: 'm4',
    Name: 'Past Lives',
    Overview:
      'Two childhood sweethearts are separated when one of them emigrates from South Korea. Two decades later, they reunite in New York for one fateful week as they confront notions of destiny, love, and the choices that make a life.',
    Genres: ['Drama', 'Romance'],
    People: [
      { Id: 'p30', Name: 'Celine Song', Type: 'Director' },
      { Id: 'p31', Name: 'Greta Lee', Role: 'Nora', Type: 'Actor' },
      { Id: 'p32', Name: 'Teo Yoo', Role: 'Hae Sung', Type: 'Actor' },
      { Id: 'p33', Name: 'John Magaro', Role: 'Arthur', Type: 'Actor' },
    ],
    RunTimeTicks: mins(106),
    ProductionYear: 2023,
    OfficialRating: 'PG-13',
    CommunityRating: 7.9,
    Type: 'Movie',
    posterColor: 'linear-gradient(135deg, #4a1c3a, #7c3aed)',
    backdropColor: 'linear-gradient(160deg, #3b0764 0%, #1e1b4b 50%, #09090b 100%)',
  },
  m5: {
    Id: 'm5',
    Name: 'Poor Things',
    Overview:
      'The incredible tale about the fantastical evolution of Bella Baxter, a young woman brought back to life by the brilliant and unorthodox scientist Dr. Godwin Baxter.',
    Taglines: ['An adventure in ecstasy.'],
    Genres: ['Science Fiction', 'Comedy', 'Drama'],
    People: [
      { Id: 'p40', Name: 'Yorgos Lanthimos', Type: 'Director' },
      { Id: 'p41', Name: 'Emma Stone', Role: 'Bella Baxter', Type: 'Actor' },
      { Id: 'p42', Name: 'Mark Ruffalo', Role: 'Duncan Wedderburn', Type: 'Actor' },
      { Id: 'p43', Name: 'Willem Dafoe', Role: 'Dr. Godwin Baxter', Type: 'Actor' },
      { Id: 'p44', Name: 'Ramy Youssef', Role: 'Max McCandles', Type: 'Actor' },
    ],
    RunTimeTicks: mins(141),
    ProductionYear: 2023,
    OfficialRating: 'R',
    CommunityRating: 8.1,
    Type: 'Movie',
    posterColor: 'linear-gradient(135deg, #1e3a5f, #0e7490)',
    backdropColor: 'linear-gradient(160deg, #0e7490 0%, #164e63 50%, #09090b 100%)',
  },
  m6: {
    Id: 'm6',
    Name: 'All of Us Strangers',
    Overview:
      'One night in his near-empty tower block, Adam has a chance encounter with a mysterious neighbor Harry. As their relationship develops, Adam is pulled back to his childhood home where he discovers his dead parents.',
    Genres: ['Drama', 'Romance', 'Fantasy'],
    People: [
      { Id: 'p50', Name: 'Andrew Haigh', Type: 'Director' },
      { Id: 'p51', Name: 'Andrew Scott', Role: 'Adam', Type: 'Actor' },
      { Id: 'p52', Name: 'Paul Mescal', Role: 'Harry', Type: 'Actor' },
      { Id: 'p53', Name: 'Jamie Bell', Role: 'Dad', Type: 'Actor' },
      { Id: 'p54', Name: 'Claire Foy', Role: 'Mum', Type: 'Actor' },
    ],
    RunTimeTicks: mins(105),
    ProductionYear: 2023,
    OfficialRating: 'R',
    CommunityRating: 7.8,
    Type: 'Movie',
    posterColor: 'linear-gradient(135deg, #7f1d1d, #9a3412)',
    backdropColor: 'linear-gradient(160deg, #7f1d1d 0%, #3f1515 50%, #09090b 100%)',
  },
  m7: {
    Id: 'm7',
    Name: 'Anatomy of a Fall',
    Overview:
      'A woman is suspected of her husband\'s death when he is found dead at the bottom of their chalet. As the judicial investigation unfolds, her 11-year-old son must face questions about his parents.',
    Genres: ['Drama', 'Thriller', 'Mystery'],
    People: [
      { Id: 'p60', Name: 'Justine Triet', Type: 'Director' },
      { Id: 'p61', Name: 'Sandra Hüller', Role: 'Sandra', Type: 'Actor' },
      { Id: 'p62', Name: 'Swann Arlaud', Role: 'Maître Vincent Renzi', Type: 'Actor' },
      { Id: 'p63', Name: 'Milo Machado-Graner', Role: 'Daniel', Type: 'Actor' },
    ],
    RunTimeTicks: mins(152),
    ProductionYear: 2023,
    OfficialRating: 'R',
    CommunityRating: 7.8,
    Type: 'Movie',
    posterColor: 'linear-gradient(135deg, #1c2942, #374151)',
    backdropColor: 'linear-gradient(160deg, #1c2942 0%, #111827 50%, #09090b 100%)',
  },
  m8: {
    Id: 'm8',
    Name: 'Killers of the Flower Moon',
    Overview:
      'Members of the Osage Nation are murdered under mysterious circumstances in the 1920s, sparking a major FBI investigation involving J. Edgar Hoover. Based on the true story.',
    Genres: ['Drama', 'Crime', 'History'],
    People: [
      { Id: 'p70', Name: 'Martin Scorsese', Type: 'Director' },
      { Id: 'p71', Name: 'Leonardo DiCaprio', Role: 'Ernest Burkhart', Type: 'Actor' },
      { Id: 'p72', Name: 'Robert De Niro', Role: 'William Hale', Type: 'Actor' },
      { Id: 'p73', Name: 'Lily Gladstone', Role: 'Mollie Burkhart', Type: 'Actor' },
      { Id: 'p74', Name: 'Jesse Plemons', Role: 'Tom White', Type: 'Actor' },
    ],
    RunTimeTicks: mins(206),
    ProductionYear: 2023,
    OfficialRating: 'R',
    CommunityRating: 8.2,
    Type: 'Movie',
    posterColor: 'linear-gradient(135deg, #451a03, #78350f)',
    backdropColor: 'linear-gradient(160deg, #78350f 0%, #292524 50%, #09090b 100%)',
  },
  m9: {
    Id: 'm9',
    Name: 'Aftersun',
    Overview:
      'Sophie reflects on the shared joy and private melancholy of a holiday she took with her father twenty years earlier. Memories intertwine with an adult Sophie\'s understanding of her father.',
    Genres: ['Drama'],
    People: [
      { Id: 'p80', Name: 'Charlotte Wells', Type: 'Director' },
      { Id: 'p81', Name: 'Paul Mescal', Role: 'Calum', Type: 'Actor' },
      { Id: 'p82', Name: 'Frankie Corio', Role: 'Sophie', Type: 'Actor' },
    ],
    RunTimeTicks: mins(101),
    ProductionYear: 2022,
    OfficialRating: 'R',
    CommunityRating: 7.6,
    Type: 'Movie',
    posterColor: 'linear-gradient(135deg, #0c4a6e, #0369a1)',
    backdropColor: 'linear-gradient(160deg, #0369a1 0%, #075985 50%, #09090b 100%)',
  },
  m10: {
    Id: 'm10',
    Name: 'The Banshees of Inisherin',
    Overview:
      'Two lifelong friends find themselves at an impasse when one abruptly ends their friendship, with surprising consequences for both of them and the small Irish community they call home.',
    Genres: ['Drama', 'Comedy'],
    People: [
      { Id: 'p90', Name: 'Martin McDonagh', Type: 'Director' },
      { Id: 'p91', Name: 'Colin Farrell', Role: 'Pádraic Súilleabháin', Type: 'Actor' },
      { Id: 'p92', Name: 'Brendan Gleeson', Role: 'Colm Doherty', Type: 'Actor' },
      { Id: 'p93', Name: 'Kerry Condon', Role: 'Siobhán Súilleabháin', Type: 'Actor' },
      { Id: 'p94', Name: 'Barry Keoghan', Role: 'Dominic Kearney', Type: 'Actor' },
    ],
    RunTimeTicks: mins(114),
    ProductionYear: 2022,
    OfficialRating: 'R',
    CommunityRating: 7.9,
    Type: 'Movie',
    posterColor: 'linear-gradient(135deg, #14532d, #166534)',
    backdropColor: 'linear-gradient(160deg, #14532d 0%, #052e16 50%, #09090b 100%)',
  },
  m11: {
    Id: 'm11',
    Name: 'Everything Everywhere All at Once',
    Overview:
      'An aging Chinese immigrant is swept up in an insane adventure in which she alone can save existence by exploring other universes and connecting with the lives she could have led.',
    Taglines: ['The universe is so much bigger than you realize.'],
    Genres: ['Science Fiction', 'Action', 'Comedy'],
    People: [
      { Id: 'p100', Name: 'Daniel Kwan', Type: 'Director' },
      { Id: 'p101', Name: 'Daniel Scheinert', Type: 'Director' },
      { Id: 'p102', Name: 'Michelle Yeoh', Role: 'Evelyn Wang', Type: 'Actor' },
      { Id: 'p103', Name: 'Stephanie Hsu', Role: 'Joy Wang / Jobu Tupaki', Type: 'Actor' },
      { Id: 'p104', Name: 'Ke Huy Quan', Role: 'Waymond Wang', Type: 'Actor' },
      { Id: 'p105', Name: 'Jamie Lee Curtis', Role: 'Deirdre Beaubeirdre', Type: 'Actor' },
    ],
    RunTimeTicks: mins(139),
    ProductionYear: 2022,
    OfficialRating: 'R',
    CommunityRating: 8.7,
    Type: 'Movie',
    posterColor: 'linear-gradient(135deg, #6d28d9, #ec4899)',
    backdropColor: 'linear-gradient(160deg, #6d28d9 0%, #4c1d95 50%, #09090b 100%)',
  },
  m12: {
    Id: 'm12',
    Name: 'Tár',
    Overview:
      'Set in the international world of classical music, the film centers on Lydia Tár, widely considered one of the greatest living composers and conductors and the first-ever female chief conductor of a major German orchestra.',
    Genres: ['Drama', 'Music'],
    People: [
      { Id: 'p110', Name: 'Todd Field', Type: 'Director' },
      { Id: 'p111', Name: 'Cate Blanchett', Role: 'Lydia Tár', Type: 'Actor' },
      { Id: 'p112', Name: 'Nina Hoss', Role: 'Sharon Goodnow', Type: 'Actor' },
      { Id: 'p113', Name: 'Noémie Merlant', Role: 'Francesca Lentini', Type: 'Actor' },
    ],
    RunTimeTicks: mins(158),
    ProductionYear: 2022,
    OfficialRating: 'R',
    CommunityRating: 7.3,
    Type: 'Movie',
    posterColor: 'linear-gradient(135deg, #1e293b, #334155)',
    backdropColor: 'linear-gradient(160deg, #1e293b 0%, #0f172a 50%, #09090b 100%)',
  },
  tv1: {
    Id: 'tv1',
    Name: 'Shōgun',
    Overview:
      'When a mysterious European ship is found marooned in a Japanese fishing village, its English navigator and the feudal lord who finds him form an unlikely alliance.',
    Taglines: ['Power is a weapon.'],
    Genres: ['Drama', 'Action', 'History'],
    People: [
      { Id: 'q1', Name: 'Hiroyuki Sanada', Role: 'Lord Yoshii Toranaga', Type: 'Actor' },
      { Id: 'q2', Name: 'Cosmo Jarvis', Role: 'John Blackthorne', Type: 'Actor' },
      { Id: 'q3', Name: 'Anna Sawai', Role: 'Toda Mariko', Type: 'Actor' },
      { Id: 'q4', Name: 'Tadanobu Asano', Role: 'Kashigi Yabushige', Type: 'Actor' },
    ],
    RunTimeTicks: mins(60),
    ProductionYear: 2024,
    OfficialRating: 'TV-MA',
    CommunityRating: 9.0,
    Type: 'Series',
    Status: 'Ended',
    SeasonCount: 1,
    EpisodeCount: 10,
    Seasons: [
      {
        Id: 'tv1s1',
        Name: 'Season 1',
        IndexNumber: 1,
        EpisodeCount: 10,
        ProductionYear: 2024,
        Episodes: [
          { Id: 'tv1s1e1', Name: 'Crimson Sky', IndexNumber: 1, Overview: 'An English navigator washes ashore in Japan and is taken prisoner by the samurai of a powerful lord.', RunTimeTicks: mins(64) },
          { Id: 'tv1s1e2', Name: 'Crimson Sky', IndexNumber: 2, Overview: 'Blackthorne is taken to Osaka Castle, home of the Council of Regents.', RunTimeTicks: mins(55) },
          { Id: 'tv1s1e3', Name: 'Crimson Sky', IndexNumber: 3, Overview: 'Toranaga makes a daring escape from Osaka with Blackthorne\'s help.', RunTimeTicks: mins(58) },
          { Id: 'tv1s1e4', Name: 'Crimson Sky', IndexNumber: 4, Overview: 'Toranaga and Blackthorne travel to Ajiro while political tensions rise.', RunTimeTicks: mins(52) },
          { Id: 'tv1s1e5', Name: 'Crimson Sky', IndexNumber: 5, Overview: 'Blackthorne is given a new role as Toranaga\'s consort.', RunTimeTicks: mins(60) },
          { Id: 'tv1s1e6', Name: 'Crimson Sky', IndexNumber: 6, Overview: 'A deadly earthquake forces unlikely alliances.', RunTimeTicks: mins(57) },
          { Id: 'tv1s1e7', Name: 'Divided Loyalties', IndexNumber: 7, Overview: 'Toranaga\'s position grows more precarious as enemies close in.', RunTimeTicks: mins(54) },
          { Id: 'tv1s1e8', Name: 'Broken to the Fist', IndexNumber: 8, Overview: 'A political crisis demands immediate action from all parties.', RunTimeTicks: mins(59) },
          { Id: 'tv1s1e9', Name: 'Crimson Sky', IndexNumber: 9, Overview: 'Toranaga sets his final plan into motion.', RunTimeTicks: mins(62) },
          { Id: 'tv1s1e10', Name: 'Crimson Sky', IndexNumber: 10, Overview: 'The culmination of Toranaga\'s long-laid plan is revealed.', RunTimeTicks: mins(75) },
        ],
      },
    ],
    posterColor: 'linear-gradient(135deg, #7f1d1d, #450a0a)',
    backdropColor: 'linear-gradient(160deg, #7f1d1d 0%, #3f1515 50%, #09090b 100%)',
  },
  tv2: {
    Id: 'tv2',
    Name: 'The Bear',
    Overview:
      'A young chef from the fine-dining world comes home to Chicago to run his family\'s sandwich shop after a tragic loss. Together with a loveable crew of kitchen staff, he fights to transform both the restaurant and himself.',
    Genres: ['Drama', 'Comedy'],
    People: [
      { Id: 'q10', Name: 'Jeremy Allen White', Role: 'Carmen "Carmy" Berzatto', Type: 'Actor' },
      { Id: 'q11', Name: 'Ebon Moss-Bachrach', Role: 'Richard "Richie" Jerimovich', Type: 'Actor' },
      { Id: 'q12', Name: 'Ayo Edebiri', Role: 'Sydney Adamu', Type: 'Actor' },
      { Id: 'q13', Name: 'Lionel Boyce', Role: 'Marcus Brooks', Type: 'Actor' },
      { Id: 'q14', Name: 'Liza Colón-Zayas', Role: 'Tina Marrero', Type: 'Actor' },
    ],
    RunTimeTicks: mins(35),
    ProductionYear: 2024,
    OfficialRating: 'TV-MA',
    CommunityRating: 8.7,
    Type: 'Series',
    Status: 'Continuing',
    SeasonCount: 3,
    EpisodeCount: 27,
    Seasons: [
      {
        Id: 'tv2s1',
        Name: 'Season 1',
        IndexNumber: 1,
        EpisodeCount: 8,
        ProductionYear: 2022,
        Episodes: [
          { Id: 'tv2s1e1', Name: 'System', IndexNumber: 1, Overview: 'Carmy returns to Chicago to run his family\'s sandwich shop.', RunTimeTicks: mins(34) },
          { Id: 'tv2s1e2', Name: 'Hands', IndexNumber: 2, Overview: 'The kitchen struggles to keep up with the lunch rush.', RunTimeTicks: mins(29) },
          { Id: 'tv2s1e3', Name: 'Brigade', IndexNumber: 3, Overview: 'Carmy tries to reorganize the kitchen.', RunTimeTicks: mins(31) },
          { Id: 'tv2s1e4', Name: 'Dogs', IndexNumber: 4, Overview: 'Richie deals with his personal life while the restaurant faces pressure.', RunTimeTicks: mins(36) },
          { Id: 'tv2s1e5', Name: 'Sheridan', IndexNumber: 5, Overview: 'A day in the life of the sandwich shop.', RunTimeTicks: mins(33) },
          { Id: 'tv2s1e6', Name: 'Ceres', IndexNumber: 6, Overview: 'The team uncovers a secret.', RunTimeTicks: mins(30) },
          { Id: 'tv2s1e7', Name: 'Review', IndexNumber: 7, Overview: 'A food critic changes everything.', RunTimeTicks: mins(32) },
          { Id: 'tv2s1e8', Name: 'Braciole', IndexNumber: 8, Overview: 'The kitchen faces its most chaotic service yet.', RunTimeTicks: mins(37) },
        ],
      },
      {
        Id: 'tv2s2',
        Name: 'Season 2',
        IndexNumber: 2,
        EpisodeCount: 10,
        ProductionYear: 2023,
        Episodes: [
          { Id: 'tv2s2e1', Name: 'Beef', IndexNumber: 1, Overview: 'The team prepares for a new chapter.', RunTimeTicks: mins(42) },
          { Id: 'tv2s2e2', Name: 'Pasta', IndexNumber: 2, Overview: 'Marcus goes to Copenhagen to train.', RunTimeTicks: mins(38) },
          { Id: 'tv2s2e3', Name: 'Sundae', IndexNumber: 3, Overview: 'Sydney develops new menu ideas.', RunTimeTicks: mins(35) },
          { Id: 'tv2s2e4', Name: 'Honeydew', IndexNumber: 4, Overview: 'Richie does a stage at a fine-dining restaurant.', RunTimeTicks: mins(39) },
          { Id: 'tv2s2e5', Name: 'Pop', IndexNumber: 5, Overview: 'A family holiday brings up old wounds.', RunTimeTicks: mins(62) },
          { Id: 'tv2s2e6', Name: 'Fishes', IndexNumber: 6, Overview: 'A Christmas Eve dinner reveals the family\'s dynamics.', RunTimeTicks: mins(71) },
          { Id: 'tv2s2e7', Name: 'Forks', IndexNumber: 7, Overview: 'Richie\'s stage continues to transform him.', RunTimeTicks: mins(36) },
          { Id: 'tv2s2e8', Name: 'Bolognese', IndexNumber: 8, Overview: 'The restaurant\'s opening night approaches.', RunTimeTicks: mins(40) },
          { Id: 'tv2s2e9', Name: 'Omelette', IndexNumber: 9, Overview: 'Last-minute preparations.', RunTimeTicks: mins(37) },
          { Id: 'tv2s2e10', Name: 'The Bear', IndexNumber: 10, Overview: 'Opening night at The Bear.', RunTimeTicks: mins(44) },
        ],
      },
      {
        Id: 'tv2s3',
        Name: 'Season 3',
        IndexNumber: 3,
        EpisodeCount: 9,
        ProductionYear: 2024,
        Episodes: [
          { Id: 'tv2s3e1', Name: 'Tomorrow', IndexNumber: 1, Overview: 'The aftermath of opening night.', RunTimeTicks: mins(30) },
          { Id: 'tv2s3e2', Name: 'Next', IndexNumber: 2, Overview: 'The Bear tries to earn its first star.', RunTimeTicks: mins(34) },
          { Id: 'tv2s3e3', Name: 'Doors', IndexNumber: 3, Overview: 'Carmy battles his perfectionism.', RunTimeTicks: mins(32) },
          { Id: 'tv2s3e4', Name: 'Violet', IndexNumber: 4, Overview: 'Sydney and Carmy\'s partnership is tested.', RunTimeTicks: mins(29) },
          { Id: 'tv2s3e5', Name: 'Children', IndexNumber: 5, Overview: 'Family complications arise.', RunTimeTicks: mins(35) },
          { Id: 'tv2s3e6', Name: 'Napkins', IndexNumber: 6, Overview: 'A quiet night reveals old tensions.', RunTimeTicks: mins(31) },
          { Id: 'tv2s3e7', Name: 'The Review', IndexNumber: 7, Overview: 'A critical review changes the stakes.', RunTimeTicks: mins(36) },
          { Id: 'tv2s3e8', Name: 'Ice Chips', IndexNumber: 8, Overview: 'Personal crises collide with professional pressure.', RunTimeTicks: mins(33) },
          { Id: 'tv2s3e9', Name: 'Apologies', IndexNumber: 9, Overview: 'The season finale.', RunTimeTicks: mins(40) },
        ],
      },
    ],
    posterColor: 'linear-gradient(135deg, #1c1917, #44403c)',
    backdropColor: 'linear-gradient(160deg, #292524 0%, #1c1917 50%, #09090b 100%)',
  },
  tv3: {
    Id: 'tv3',
    Name: 'Slow Horses',
    Overview:
      'A dysfunctional team of British intelligence agents who work in a dumping ground department of MI5 known as Slough House.',
    Genres: ['Drama', 'Thriller', 'Crime'],
    People: [
      { Id: 'q20', Name: 'Gary Oldman', Role: 'Jackson Lamb', Type: 'Actor' },
      { Id: 'q21', Name: 'Jack Lowden', Role: 'River Cartwright', Type: 'Actor' },
      { Id: 'q22', Name: 'Kristin Scott Thomas', Role: 'Diana Taverner', Type: 'Actor' },
      { Id: 'q23', Name: 'Olivia Cooke', Role: 'Sid Baker', Type: 'Actor' },
    ],
    RunTimeTicks: mins(47),
    ProductionYear: 2024,
    OfficialRating: 'TV-MA',
    CommunityRating: 8.1,
    Type: 'Series',
    Status: 'Continuing',
    SeasonCount: 4,
    EpisodeCount: 24,
    Seasons: [
      { Id: 'tv3s1', Name: 'Season 1', IndexNumber: 1, EpisodeCount: 6, ProductionYear: 2022, Episodes: [
        { Id: 'tv3s1e1', Name: 'Failure', IndexNumber: 1, Overview: 'River Cartwright is sent to Slough House after a training incident.', RunTimeTicks: mins(43) },
        { Id: 'tv3s1e2', Name: 'Dirt', IndexNumber: 2, Overview: 'A kidnapped student draws the Slow Horses into action.', RunTimeTicks: mins(45) },
        { Id: 'tv3s1e3', Name: 'Negotiating with Tigers', IndexNumber: 3, Overview: 'The plot thickens as the clock ticks.', RunTimeTicks: mins(47) },
        { Id: 'tv3s1e4', Name: 'Visiting Hours', IndexNumber: 4, Overview: 'Loyalties are tested.', RunTimeTicks: mins(44) },
        { Id: 'tv3s1e5', Name: 'Footprints', IndexNumber: 5, Overview: 'The truth begins to emerge.', RunTimeTicks: mins(46) },
        { Id: 'tv3s1e6', Name: 'Last Rites', IndexNumber: 6, Overview: 'A tense conclusion.', RunTimeTicks: mins(50) },
      ]},
      { Id: 'tv3s4', Name: 'Season 4', IndexNumber: 4, EpisodeCount: 6, ProductionYear: 2024, Episodes: [
        { Id: 'tv3s4e1', Name: 'Identity', IndexNumber: 1, Overview: 'A new threat emerges for Slough House.', RunTimeTicks: mins(47) },
        { Id: 'tv3s4e2', Name: 'Cover', IndexNumber: 2, Overview: 'Lamb pursues his own agenda.', RunTimeTicks: mins(45) },
        { Id: 'tv3s4e3', Name: 'Exposure', IndexNumber: 3, Overview: 'Secrets come to light.', RunTimeTicks: mins(48) },
        { Id: 'tv3s4e4', Name: 'Shadows', IndexNumber: 4, Overview: 'The team goes deeper undercover.', RunTimeTicks: mins(46) },
        { Id: 'tv3s4e5', Name: 'Confession', IndexNumber: 5, Overview: 'Allegiances are revealed.', RunTimeTicks: mins(44) },
        { Id: 'tv3s4e6', Name: 'Resolution', IndexNumber: 6, Overview: 'The season finale.', RunTimeTicks: mins(52) },
      ]},
    ],
    posterColor: 'linear-gradient(135deg, #0f172a, #1e293b)',
    backdropColor: 'linear-gradient(160deg, #1e293b 0%, #0f172a 50%, #09090b 100%)',
  },
  tv4: {
    Id: 'tv4',
    Name: 'Silo',
    Overview:
      'In a ruined and toxic future, a community exists in a giant underground silo. When a sheriff begins to uncover the silo\'s secrets, she discovers the truth is more dangerous than anyone imagined.',
    Genres: ['Science Fiction', 'Drama', 'Mystery'],
    People: [
      { Id: 'q30', Name: 'Rebecca Ferguson', Role: 'Juliette Nichols', Type: 'Actor' },
      { Id: 'q31', Name: 'Common', Role: 'Robert Sims', Type: 'Actor' },
      { Id: 'q32', Name: 'Tim Robbins', Role: 'Bernard Holland', Type: 'Actor' },
    ],
    RunTimeTicks: mins(52),
    ProductionYear: 2024,
    OfficialRating: 'TV-14',
    CommunityRating: 8.2,
    Type: 'Series',
    Status: 'Continuing',
    SeasonCount: 2,
    EpisodeCount: 20,
    Seasons: [
      { Id: 'tv4s1', Name: 'Season 1', IndexNumber: 1, EpisodeCount: 10, ProductionYear: 2023, Episodes: [
        { Id: 'tv4s1e1', Name: 'Freedom Day', IndexNumber: 1, Overview: 'A couple breaks the silo\'s rules.', RunTimeTicks: mins(50) },
        { Id: 'tv4s1e2', Name: 'Holston\'s Pick', IndexNumber: 2, Overview: 'The sheriff makes a fateful decision.', RunTimeTicks: mins(52) },
      ]},
      { Id: 'tv4s2', Name: 'Season 2', IndexNumber: 2, EpisodeCount: 10, ProductionYear: 2024, Episodes: [
        { Id: 'tv4s2e1', Name: 'The Relic', IndexNumber: 1, Overview: 'Juliette discovers what lies beyond the silo.', RunTimeTicks: mins(55) },
        { Id: 'tv4s2e2', Name: 'Descent', IndexNumber: 2, Overview: 'Secrets of the silo\'s origin are revealed.', RunTimeTicks: mins(51) },
      ]},
    ],
    posterColor: 'linear-gradient(135deg, #292524, #57534e)',
    backdropColor: 'linear-gradient(160deg, #44403c 0%, #1c1917 50%, #09090b 100%)',
  },
  tv5: {
    Id: 'tv5',
    Name: 'The Penguin',
    Overview:
      'Oz Cobb works his way up in Gotham\'s criminal underworld in the aftermath of the events of The Batman.',
    Genres: ['Crime', 'Drama', 'Action'],
    People: [
      { Id: 'q40', Name: 'Colin Farrell', Role: 'Oz Cobb / The Penguin', Type: 'Actor' },
      { Id: 'q41', Name: 'Cristin Milioti', Role: 'Sofia Falcone', Type: 'Actor' },
      { Id: 'q42', Name: 'Rhenzy Feliz', Role: 'Victor Aguilar', Type: 'Actor' },
    ],
    RunTimeTicks: mins(55),
    ProductionYear: 2024,
    OfficialRating: 'TV-MA',
    CommunityRating: 8.5,
    Type: 'Series',
    Status: 'Ended',
    SeasonCount: 1,
    EpisodeCount: 8,
    Seasons: [
      { Id: 'tv5s1', Name: 'Season 1', IndexNumber: 1, EpisodeCount: 8, ProductionYear: 2024, Episodes: [
        { Id: 'tv5s1e1', Name: 'After Hours', IndexNumber: 1, Overview: 'Oz Cobb seizes an opportunity in the Gotham underworld.', RunTimeTicks: mins(55) },
        { Id: 'tv5s1e2', Name: 'Cent\' Anni', IndexNumber: 2, Overview: 'A new power struggle begins.', RunTimeTicks: mins(50) },
        { Id: 'tv5s1e3', Name: 'Bliss', IndexNumber: 3, Overview: 'Sofia Falcone makes her move.', RunTimeTicks: mins(52) },
        { Id: 'tv5s1e4', Name: 'Done Deal', IndexNumber: 4, Overview: 'Alliances are tested.', RunTimeTicks: mins(53) },
        { Id: 'tv5s1e5', Name: 'Homecoming', IndexNumber: 5, Overview: 'Victor faces danger from all sides.', RunTimeTicks: mins(51) },
        { Id: 'tv5s1e6', Name: 'Gold Digger', IndexNumber: 6, Overview: 'The Falcone family history is revealed.', RunTimeTicks: mins(54) },
        { Id: 'tv5s1e7', Name: 'The Hat', IndexNumber: 7, Overview: 'Oz\'s plan reaches its critical stage.', RunTimeTicks: mins(56) },
        { Id: 'tv5s1e8', Name: 'A Great or Little Thing', IndexNumber: 8, Overview: 'Season finale.', RunTimeTicks: mins(62) },
      ]},
    ],
    posterColor: 'linear-gradient(135deg, #1e3a5f, #0f172a)',
    backdropColor: 'linear-gradient(160deg, #1e3a5f 0%, #0f172a 50%, #09090b 100%)',
  },
  tv6: {
    Id: 'tv6',
    Name: 'Severance',
    Overview:
      'Mark leads a team of office workers whose memories have been surgically divided between their work and personal lives. When a mysterious colleague appears outside of work, the separation of their worlds is threatened.',
    Taglines: ['What happens when you leave work at work?'],
    Genres: ['Drama', 'Science Fiction', 'Thriller'],
    People: [
      { Id: 'q50', Name: 'Adam Scott', Role: 'Mark Scout', Type: 'Actor' },
      { Id: 'q51', Name: 'Britt Lower', Role: 'Helly R.', Type: 'Actor' },
      { Id: 'q52', Name: 'Zach Cherry', Role: 'Dylan George', Type: 'Actor' },
      { Id: 'q53', Name: 'Tramell Tillman', Role: 'Seth Milchick', Type: 'Actor' },
      { Id: 'q54', Name: 'Patricia Arquette', Role: 'Harmony Cobel', Type: 'Actor' },
      { Id: 'q55', Name: 'John Turturro', Role: 'Irving Bailiff', Type: 'Actor' },
    ],
    RunTimeTicks: mins(50),
    ProductionYear: 2025,
    OfficialRating: 'TV-MA',
    CommunityRating: 8.8,
    Type: 'Series',
    Status: 'Continuing',
    SeasonCount: 2,
    EpisodeCount: 19,
    Seasons: [
      { Id: 'tv6s1', Name: 'Season 1', IndexNumber: 1, EpisodeCount: 9, ProductionYear: 2022, Episodes: [
        { Id: 'tv6s1e1', Name: 'Good News About Hell', IndexNumber: 1, Overview: 'Mark welcomes a new employee to his severed floor at Lumon.', RunTimeTicks: mins(43) },
        { Id: 'tv6s1e2', Name: 'Half Loop', IndexNumber: 2, Overview: 'Helly struggles with her decision.', RunTimeTicks: mins(38) },
        { Id: 'tv6s1e3', Name: 'In Perpetuity', IndexNumber: 3, Overview: 'A strange discovery on the severed floor.', RunTimeTicks: mins(41) },
        { Id: 'tv6s1e4', Name: 'The You You Are', IndexNumber: 4, Overview: 'Irving investigates an anomaly.', RunTimeTicks: mins(44) },
        { Id: 'tv6s1e5', Name: 'The Grim Barbarity of Optics and Design', IndexNumber: 5, Overview: 'Dylan breaks a rule.', RunTimeTicks: mins(40) },
        { Id: 'tv6s1e6', Name: 'Hide and Seek', IndexNumber: 6, Overview: 'Mark learns something about his outside life.', RunTimeTicks: mins(42) },
        { Id: 'tv6s1e7', Name: 'Defiant Jazz', IndexNumber: 7, Overview: 'A plan is set in motion.', RunTimeTicks: mins(47) },
        { Id: 'tv6s1e8', Name: 'What\'s for Dinner?', IndexNumber: 8, Overview: 'The team executes their plan.', RunTimeTicks: mins(52) },
        { Id: 'tv6s1e9', Name: 'The We We Are', IndexNumber: 9, Overview: 'Season finale.', RunTimeTicks: mins(58) },
      ]},
      { Id: 'tv6s2', Name: 'Season 2', IndexNumber: 2, EpisodeCount: 10, ProductionYear: 2025, Episodes: [
        { Id: 'tv6s2e1', Name: 'Goodbye, Mrs. Selvig', IndexNumber: 1, Overview: 'The aftermath of the season 1 finale.', RunTimeTicks: mins(50) },
        { Id: 'tv6s2e2', Name: 'Chikhai Bardo', IndexNumber: 2, Overview: 'Mark confronts his inner self.', RunTimeTicks: mins(48) },
        { Id: 'tv6s2e3', Name: 'Who Is Alive?', IndexNumber: 3, Overview: 'The innie world shifts.', RunTimeTicks: mins(52) },
        { Id: 'tv6s2e4', Name: 'Woe\'s Hollow', IndexNumber: 4, Overview: 'Dylan discovers something unsettling.', RunTimeTicks: mins(46) },
        { Id: 'tv6s2e5', Name: 'Trojan\'s Horse', IndexNumber: 5, Overview: 'A plan is revealed.', RunTimeTicks: mins(49) },
      ]},
    ],
    posterColor: 'linear-gradient(135deg, #e2e8f0, #94a3b8)',
    backdropColor: 'linear-gradient(160deg, #334155 0%, #1e293b 50%, #09090b 100%)',
  },
  tv7: {
    Id: 'tv7',
    Name: 'The Last of Us',
    Overview:
      'Joel, a hardened survivor, is hired to smuggle Ellie, a 14-year-old girl, out of an oppressive quarantine zone. What starts as a small job soon becomes a brutal heartbreaking journey as they both must traverse the US.',
    Genres: ['Drama', 'Action', 'Science Fiction'],
    People: [
      { Id: 'q60', Name: 'Pedro Pascal', Role: 'Joel Miller', Type: 'Actor' },
      { Id: 'q61', Name: 'Bella Ramsey', Role: 'Ellie Williams', Type: 'Actor' },
      { Id: 'q62', Name: 'Gabriel Luna', Role: 'Tommy Miller', Type: 'Actor' },
      { Id: 'q63', Name: 'Keivonn Woodard', Role: 'Sam', Type: 'Actor' },
    ],
    RunTimeTicks: mins(55),
    ProductionYear: 2025,
    OfficialRating: 'TV-MA',
    CommunityRating: 8.7,
    Type: 'Series',
    Status: 'Continuing',
    SeasonCount: 2,
    EpisodeCount: 16,
    Seasons: [
      { Id: 'tv7s1', Name: 'Season 1', IndexNumber: 1, EpisodeCount: 9, ProductionYear: 2023, Episodes: [
        { Id: 'tv7s1e1', Name: 'When You\'re Lost in the Darkness', IndexNumber: 1, Overview: 'Joel and Tess are tasked with smuggling Ellie out of the Boston QZ.', RunTimeTicks: mins(81) },
        { Id: 'tv7s1e2', Name: 'Infected', IndexNumber: 2, Overview: 'Joel, Tess, and Ellie navigate the infected city.', RunTimeTicks: mins(55) },
      ]},
      { Id: 'tv7s2', Name: 'Season 2', IndexNumber: 2, EpisodeCount: 7, ProductionYear: 2025, Episodes: [
        { Id: 'tv7s2e1', Name: 'Future Days', IndexNumber: 1, Overview: 'Five years after the events of season 1, Joel and Ellie have settled in Jackson.', RunTimeTicks: mins(58) },
        { Id: 'tv7s2e2', Name: 'Through the Valley', IndexNumber: 2, Overview: 'A devastating attack changes everything.', RunTimeTicks: mins(65) },
      ]},
    ],
    posterColor: 'linear-gradient(135deg, #1a2e1a, #14532d)',
    backdropColor: 'linear-gradient(160deg, #14532d 0%, #0a1f0a 50%, #09090b 100%)',
  },
  tv8: {
    Id: 'tv8',
    Name: 'Succession',
    Overview:
      'The Roy family is known for controlling the biggest media and entertainment company in the world. However, their world changes when their father steps back from the company.',
    Taglines: ['This is the one.'],
    Genres: ['Drama', 'Comedy'],
    People: [
      { Id: 'q70', Name: 'Brian Cox', Role: 'Logan Roy', Type: 'Actor' },
      { Id: 'q71', Name: 'Jeremy Strong', Role: 'Kendall Roy', Type: 'Actor' },
      { Id: 'q72', Name: 'Sarah Snook', Role: 'Siobhan "Shiv" Roy', Type: 'Actor' },
      { Id: 'q73', Name: 'Kieran Culkin', Role: 'Roman Roy', Type: 'Actor' },
      { Id: 'q74', Name: 'Matthew Macfadyen', Role: 'Tom Wambsgans', Type: 'Actor' },
    ],
    RunTimeTicks: mins(60),
    ProductionYear: 2023,
    OfficialRating: 'TV-MA',
    CommunityRating: 9.0,
    Type: 'Series',
    Status: 'Ended',
    SeasonCount: 4,
    EpisodeCount: 39,
    Seasons: [
      { Id: 'tv8s4', Name: 'Season 4', IndexNumber: 4, EpisodeCount: 10, ProductionYear: 2023, Episodes: [
        { Id: 'tv8s4e1', Name: 'The Munsters', IndexNumber: 1, Overview: 'The siblings work to sabotage Logan\'s acquisition.', RunTimeTicks: mins(63) },
        { Id: 'tv8s4e2', Name: 'Rehearsal', IndexNumber: 2, Overview: 'A funeral brings the family together.', RunTimeTicks: mins(58) },
        { Id: 'tv8s4e3', Name: 'Connor\'s Wedding', IndexNumber: 3, Overview: 'Devastating news changes everything.', RunTimeTicks: mins(60) },
        { Id: 'tv8s4e10', Name: 'With Open Eyes', IndexNumber: 10, Overview: 'The final episode.', RunTimeTicks: mins(75) },
      ]},
    ],
    posterColor: 'linear-gradient(135deg, #1c1917, #292524)',
    backdropColor: 'linear-gradient(160deg, #292524 0%, #1c1917 50%, #09090b 100%)',
  },
}

export function formatRuntime(ticks: number): string {
  const mins = Math.round(ticks / 600_000_000)
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export async function getJellyfinItem(id: string): Promise<JellyfinItem | null> {
  if (process.env.JELLYFIN_URL && process.env.JELLYFIN_API_KEY) {
    const res = await fetch(
      `${process.env.JELLYFIN_URL}/Items/${id}?Fields=Overview,Genres,People,MediaSources,Taglines,Studios&api_key=${process.env.JELLYFIN_API_KEY}`,
      { next: { revalidate: 300 } },
    )
    if (!res.ok) return null
    return res.json()
  }
  return MOCK_JELLYFIN_ITEMS[id] ?? null
}
