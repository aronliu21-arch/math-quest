// Game catalog: shop items, achievements, real-life tips, encouragement.
const T = (en, zh) => ({ en, zh });

export const COSTUMES = {
  crown: { kind: 'hat', name: T('Royal crown', '皇家王冠'), price: { gems: 6 } },
  wizard: { kind: 'hat', name: T('Fraction wizard hat', '分數魔法帽'), price: { coins: 120 } },
  helmet: { kind: 'hat', name: T('Knight helmet', '騎士頭盔'), price: { coins: 100 } },
  cat: { kind: 'hat', name: T('Cat ears', '貓耳朵'), price: { coins: 60 } },
  pirate: { kind: 'hat', name: T('Pirate hat', '海盜帽'), price: { coins: 80 } },
  flowers: { kind: 'hat', name: T('Flower crown', '花圈'), price: { coins: 60 } },
  dino: { kind: 'hat', name: T('Dino spikes', '恐龍背刺帽'), price: { coins: 90 } },
  astro: { kind: 'hat', name: T('Space helmet', '太空頭盔'), price: { gems: 10 }, legendary: true },
  cap: { kind: 'hat', name: T('Sports cap', '棒球帽'), price: { coins: 30 } },
  beanie: { kind: 'hat', name: T('Pom-pom beanie', '毛線帽'), price: { coins: 30 } },
  headband: { kind: 'hat', name: T('Headband', '髮箍'), price: { coins: 30 } },
  bow: { kind: 'hat', name: T('Big bow', '大蝴蝶結'), price: { coins: 30 } },
  horns: { kind: 'hat', name: T('Dragon horns', '龍角'), price: { coins: 40 } },
  red: { kind: 'cape', name: T('Hero cape', '英雄披風'), price: { coins: 80 } },
  gold: { kind: 'cape', name: T('Golden cape', '黃金披風'), price: { gems: 8 } },
  star: { kind: 'cape', name: T('Starry cape', '星空披風'), price: { coins: 140 } },
  green: { kind: 'cape', name: T('Forest cloak', '森林斗篷'), price: { coins: 100 } },
};

export const EQUIPMENT = {
  wand: { name: T('Star wand', '星星魔杖'), price: { coins: 90 }, perk: T('+10% coins', '金幣 +10%'), coinBonus: 0.1 },
  sword: { name: T('Foam sword', '泡棉劍'), price: { coins: 90 }, perk: T('Bigger battle sparkles', '戰鬥特效更華麗') },
  shield: { name: T('Division shield', '除法盾牌'), price: { coins: 110 }, perk: T('+10% XP', '經驗值 +10%'), xpBonus: 0.1 },
  book: { name: T('Fraction book', '分數之書'), price: { coins: 70 }, perk: T('+1 free hint glow', '提示發光') },
  staff: { name: T('Crystal staff', '水晶法杖'), price: { gems: 8 }, perk: T('+10% pet XP', '寵物經驗 +10%'), petBonus: 0.1 },
};

export const DECOR_ITEMS = {
  tree: { name: T('Tree', '大樹'), price: { coins: 20 } },
  flower: { name: T('Flower', '花朵'), price: { coins: 10 } },
  fountain: { name: T('Fountain', '噴水池'), price: { coins: 80 } },
  bench: { name: T('Bench', '長椅'), price: { coins: 30 } },
  lamp: { name: T('Lamp', '路燈'), price: { coins: 25 } },
  tower: { name: T('Castle tower', '城堡塔'), price: { coins: 150 } },
  pond: { name: T('Pond', '池塘'), price: { coins: 60 } },
  statue: { name: T('Division statue', '除法雕像'), price: { gems: 4 } },
  rainbow: { name: T('Rainbow', '彩虹'), price: { gems: 5 } },
  tent: { name: T('Camp tent', '露營帳篷'), price: { coins: 50 } },
  pizza: { name: T('Giant pizza', '巨大披薩'), price: { coins: 40 } },
  crystal: { name: T('Magic crystal', '魔法水晶'), price: { gems: 6 } },
  house: { name: T('Little house', '小房子'), price: { coins: 100 } },
};

export const ACHIEVEMENTS = [
  { id: 'first_mission', name: T('First steps', '第一步'), desc: T('Finish your first mission', '完成第一個任務'), test: (p) => p.stats.missions >= 1 },
  { id: 'ten_missions', name: T('Adventurer', '冒險家'), desc: T('Finish 10 missions', '完成 10 個任務'), test: (p) => p.stats.missions >= 10 },
  { id: 'fifty_missions', name: T('Hero of the realm', '王國英雄'), desc: T('Finish 50 missions', '完成 50 個任務'), test: (p) => p.stats.missions >= 50 },
  { id: 'q100', name: T('100 questions', '答題 100'), desc: T('Answer 100 questions', '回答 100 題'), test: (p) => p.stats.answered >= 100 },
  { id: 'q500', name: T('500 questions', '答題 500'), desc: T('Answer 500 questions', '回答 500 題'), test: (p) => p.stats.answered >= 500 },
  { id: 'persist', name: T('Never give up', '永不放棄'), desc: T('Get 10 answers right after a first mistake', '答錯後再答對 10 次'), test: (p) => p.stats.secondTry >= 10 },
  { id: 'streak5', name: T('On fire', '火力全開'), desc: T('5 first-try answers in a row', '連續 5 題一次答對'), test: (p) => p.stats.bestStreak >= 5 },
  { id: 'streak15', name: T('Unstoppable', '勢不可擋'), desc: T('15 first-try answers in a row', '連續 15 題一次答對'), test: (p) => p.stats.bestStreak >= 15 },
  { id: 'boss1', name: T('Boss tamer', '頭目馴服者'), desc: T('Calm your first boss', '馴服第一個頭目'), test: (p) => p.stats.bosses >= 1 },
  { id: 'boss_all', name: T('World saver', '世界守護者'), desc: T('Calm a boss in all four worlds', '在四個世界都馴服頭目'), test: (p) => ['village', 'forest', 'kingdom', 'legend'].every((w) => p.stats.bossWorlds?.[w]) },
  { id: 'pets3', name: T('Pet pal', '寵物好朋友'), desc: T('Collect 3 pets', '收集 3 隻寵物'), test: (p) => Object.keys(p.pets).length >= 3 },
  { id: 'pets_rare', name: T('Rare finder', '稀有發現者'), desc: T('Find a rare pet', '找到稀有寵物'), test: (p, PETS) => Object.keys(p.pets).some((k) => PETS[k]?.rarity === 'rare') },
  { id: 'pets_legend', name: T('Legend keeper', '傳說守護者'), desc: T('Find a legendary pet', '找到傳說寵物'), test: (p, PETS) => Object.keys(p.pets).some((k) => PETS[k]?.rarity === 'legendary') },
  { id: 'evolve', name: T('Evolution!', '進化了！'), desc: T('Evolve a pet', '讓寵物進化'), test: (p) => Object.values(p.pets).some((x) => x.stage >= 1) },
  { id: 'builder', name: T('Builder', '小小建築師'), desc: T('Place 10 decorations at home', '在家裡放 10 個裝飾'), test: (p) => (p.home.tiles || []).filter(Boolean).length >= 10 },
  { id: 'daily3', name: T('Mystery solver', '解謎高手'), desc: T('Finish daily missions on 3 days', '完成 3 天的每日任務'), test: (p) => Object.keys(p.daily.done || {}).length >= 3 },
  { id: 'secret', name: T('Secret seeker', '秘密探索者'), desc: T('Find a secret level', '找到秘密關卡'), test: (p) => p.stats.secrets >= 1 },
  { id: 'egg', name: T('Easter egg!', '彩蛋！'), desc: T('Find a hidden surprise', '發現隱藏的驚喜'), test: (p) => p.stats.eggs >= 1 },
  { id: 'div_inter', name: T('Division explorer', '除法探險家'), desc: T('Reach Intermediate in division', '除法達到中級'), test: (p) => p.learning.skill.div.r >= 100 },
  { id: 'div_adv', name: T('Division master', '除法大師'), desc: T('Reach Advanced in division', '除法達到高級'), test: (p) => p.learning.skill.div.r >= 200 },
  { id: 'frac_inter', name: T('Fraction explorer', '分數探險家'), desc: T('Reach Intermediate in fractions', '分數達到中級'), test: (p) => p.learning.skill.frac.r >= 100 },
  { id: 'frac_adv', name: T('Fraction master', '分數大師'), desc: T('Reach Advanced in fractions', '分數達到高級'), test: (p) => p.learning.skill.frac.r >= 200 },
  { id: 'team', name: T('Team player', '團隊合作'), desc: T('Win a team adventure', '贏得一場組隊冒險'), test: (p) => p.stats.teamWins >= 1 },
  { id: 'curious', name: T('Curious mind', '好奇寶寶'), desc: T('Use "Show me how" 5 times', '使用「教我怎麼做」5 次'), test: (p) => p.stats.showMe >= 5 },
];

export const TIPS = {
  share: T('Next snack time, share the snacks equally with your family. Does everyone get the same?', '下次吃點心時，和家人平分點心。每個人分到的一樣多嗎？'),
  facts: T('Count stairs by 2s, 3s or 5s as you climb. Division is the same jumps backwards!', '爬樓梯時 2 個 2 個、5 個 5 個數，除法就是倒著跳回去！'),
  group: T('Put your toy cars or crayons into groups of 3. How many groups can you make?', '把玩具車或蠟筆每 3 個分一組，可以分成幾組？'),
  remainder: T('Share a pack of crackers with friends. Are any left over? That is the remainder!', '和朋友分一包餅乾，有沒有剩下的？那就是餘數！'),
  long: T('Ask a grown-up how much each person pays if a bill is split. Try it with long division!', '問問大人：帳單平分的話每人付多少？用直式除法算算看！'),
  multistep: T('Plan a party: how many cookies do you need if each guest gets 3?', '規劃派對：如果每位客人要 3 片餅乾，一共要準備幾片？'),
  fraction: T('Cut a sandwich into 4 equal parts. Eat one — you ate one fourth!', '把三明治切成 4 等份，吃掉一份——你吃了四分之一！'),
  equiv: T('Fold a paper in half, then in half again. Is 2/4 the same as 1/2?', '把紙對摺，再對摺一次。四分之二和二分之一一樣大嗎？'),
  compare: T('Would you rather have 1/3 or 1/8 of a pizza? Ask your family which is bigger!', '你想要三分之一還是八分之一個披薩？問問家人哪個比較多！'),
  addfrac: T('Measuring cups in the kitchen use fractions. Add 1/4 cup and 1/4 cup — what do you get?', '廚房的量杯也有分數。四分之一杯加四分之一杯是多少？'),
  line: T('A ruler is a number line! Find 1/2 inch or 1/2 cm on a ruler.', '尺就是一條數線！在尺上找找看二分之一公分在哪裡。'),
  simplify: T('8/16 of an egg carton is the same as 1/2. Check with real eggs (carefully)!', '蛋盒的十六分之八就等於二分之一，用真的蛋盒看看吧（小心喔）！'),
  mixed: T('If you eat 1 whole orange and half of another, you ate 1 1/2 oranges!', '吃了一整顆橘子再加半顆，就是一又二分之一顆！'),
  fracof: T('If 1/4 of your 12 crayons are blue, how many are blue? Sort them to check!', '12 枝蠟筆中有四分之一是藍色，有幾枝？分一分來檢查！'),
  pizza: T('When you share pizzas, dividing and fractions work together!', '分披薩的時候，除法和分數會一起合作！'),
};

export const NAME_IDEAS = [
  T('Star Knight', '星星騎士'), T('Pizza Wizard', '披薩巫師'), T('Dragon Rider', '飛龍騎士'), T('Math Ninja', '數學忍者'),
  T('Captain Comet', '彗星隊長'), T('Super Sharer', '平分超人'), T('Thunder Fox', '雷電狐狸'), T('Moon Explorer', '月亮探險家'),
];

export const XP_FOR_LEVEL = (lv) => 60 + (lv - 1) * 40;
export const PET_XP_FOR_LEVEL = (lv) => 40 + (lv - 1) * 25;
export const EVOLVE_AT = [5, 12]; // pet levels where stage 1 and 2 are reached
