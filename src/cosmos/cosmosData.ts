// ---------------------------------------------------------------------------
// 大宇宙カタログ — Fable 5 が想像する宇宙
//
// 太陽系の外へ。実在の恒星・銀河・星雲に加え、Fable 5 が空想した銀河・異界を
// 収録する。距離は実在天体には実際の値（光年）、空想天体には物語上の値を置く。
// pos は探索マップ内のシーン座標（光年に比例しない、航行しやすい単位）。
// ---------------------------------------------------------------------------

export type CosmicKind =
  | 'home' // 天の川銀河（出発点）
  | 'starsystem' // 恒星系
  | 'nebula' // 星雲
  | 'galaxy-spiral' // 渦巻銀河
  | 'galaxy-elliptical' // 楕円銀河
  | 'galaxy-irregular' // 不規則銀河
  | 'cluster' // 星団
  | 'anomaly'; // 空想上の特異天体・異界

export type CosmicRegion =
  | 'solar' // 太陽近傍の恒星たち
  | 'milkyway' // 天の川銀河の中
  | 'localgroup' // 局所銀河群
  | 'deepfield' // 深宇宙
  | 'multiverse'; // 多元宇宙・異界（空想）

export const REGION_JA: Record<CosmicRegion, string> = {
  solar: '太陽近傍',
  milkyway: '天の川銀河',
  localgroup: '局所銀河群',
  deepfield: '深宇宙',
  multiverse: '多元宇宙・異界',
};

export const KIND_JA: Record<CosmicKind, string> = {
  home: '母なる銀河',
  starsystem: '恒星系',
  nebula: '星雲',
  'galaxy-spiral': '渦巻銀河',
  'galaxy-elliptical': '楕円銀河',
  'galaxy-irregular': '不規則銀河',
  cluster: '星団',
  anomaly: '特異天体',
};

/** 恒星系に付随する惑星（到着時に周囲を回る点として描画）。 */
export interface CosmicPlanet {
  color: number;
  /** 主星からの表示半径（シーン単位） */
  orbit: number;
  /** 惑星自体の表示サイズ */
  size: number;
  /** 環を持つか */
  ring?: boolean;
}

export interface CosmicBody {
  id: string;
  region: CosmicRegion;
  kind: CosmicKind;
  nameJa: string;
  /** 学名・ローマ字などの副題 */
  nameSub: string;
  /** 太陽からの距離（光年）。空想天体は物語上の値。 */
  distanceLy: number;
  /** マップ内のシーン座標 */
  pos: [number, number, number];
  /** 天体の表示スケール（シーン単位のおおよその半径） */
  scale: number;
  /** 主色 */
  color: number;
  /** 副色（渦の縁・星雲の差し色など） */
  color2: number;
  /** 実在（false）か Fable 5 の空想（true）か */
  fictional: boolean;
  /** リストに出す短い惹句 */
  tag: string;
  /** Fable 5 による解説 */
  lore: string;
  /** チャートに載せず、飛んで/スキャンして「発見」する天体か */
  discoverable?: boolean;
  /** 種別ごとの追加パラメータ */
  params?: {
    arms?: number; // 渦巻の腕の数
    spin?: number; // 渦の巻き具合
    planets?: CosmicPlanet[]; // 恒星系の惑星
    starColor?: number; // 主星の色
    rings?: boolean; // 環（特異天体・恒星系）
    twin?: boolean; // 連星／衝突銀河
  };
}

// 距離の表記を整える
export function distanceLabel(ly: number): string {
  if (ly < 0.1) return `${(ly * 63241).toFixed(0)} au`;
  if (ly < 1000) return `${ly.toLocaleString('ja-JP', { maximumFractionDigits: 2 })} 光年`;
  if (ly < 1_000_000) return `${(ly / 1000).toFixed(ly < 100_000 ? 1 : 0)} 千光年`;
  if (ly < 1_000_000_000)
    return `${(ly / 1_000_000).toLocaleString('ja-JP', { maximumFractionDigits: 2 })} 百万光年`;
  return `${(ly / 1_000_000_000).toFixed(2)} 十億光年`;
}

// ---------------------------------------------------------------------------
// カタログ本体
// ---------------------------------------------------------------------------
export const COSMOS: CosmicBody[] = [
  // === 出発点：天の川銀河 =====================================================
  {
    id: 'milkyway',
    region: 'milkyway',
    kind: 'home',
    nameJa: '天の川銀河',
    nameSub: 'The Milky Way',
    distanceLy: 0,
    pos: [0, 0, 0],
    scale: 230,
    color: 0xfff2cc,
    color2: 0x88aaff,
    fictional: false,
    tag: 'わたしたちの母なる銀河',
    lore: '太陽系をふくむ、直径およそ10万光年の棒渦巻銀河。2000億をこえる恒星がひしめき、その中心には太陽の約400万倍の質量をもつ超大質量ブラックホール「いて座A*」が眠っている。あなたはいま、この銀河の片隅、中心から約2万6千光年はなれたオリオン腕の内側に立っている。',
    params: { arms: 4, spin: 2.6 },
  },

  // === 太陽近傍の恒星たち（実在）=============================================
  {
    id: 'sol',
    region: 'solar',
    kind: 'starsystem',
    nameJa: '太陽系',
    nameSub: 'Sol System — 現在地',
    distanceLy: 0,
    pos: [150, 3, 44],
    scale: 3,
    color: 0xffd766,
    color2: 0x66aaff,
    fictional: false,
    tag: 'あなたの故郷',
    lore: 'いま出発してきた場所。黄色い主系列星「太陽」と8つの惑星、無数の小天体からなる。ここへ戻れば、いつでも惑星たちの精密な軌道シミュレーションに帰還できる。',
    params: {
      starColor: 0xffd766,
      planets: [
        { color: 0xb0a090, orbit: 2.2, size: 0.1 },
        { color: 0xd8b98a, orbit: 3.0, size: 0.16 },
        { color: 0x5b8fd6, orbit: 3.9, size: 0.17 },
        { color: 0xc1653a, orbit: 4.8, size: 0.13 },
        { color: 0xd8a878, orbit: 6.6, size: 0.4 },
        { color: 0xe6cd8f, orbit: 8.4, size: 0.35, ring: true },
      ],
    },
  },
  {
    id: 'alphacen',
    region: 'solar',
    kind: 'starsystem',
    nameJa: 'アルファ・ケンタウリ',
    nameSub: 'α Centauri / Proxima b',
    distanceLy: 4.24,
    pos: [178, 10, 60],
    scale: 2.6,
    color: 0xfff0d0,
    color2: 0xff7755,
    fictional: false,
    tag: '太陽系にもっとも近い恒星系',
    lore: '太陽にいちばん近い恒星系。2つの太陽に似た星が回りあい、そのそばを赤い小さな星プロキシマが巡る。プロキシマのハビタブルゾーンには岩石惑星「プロキシマb」が確認されている——人類が最初に目指すであろう、隣の岸辺。',
    params: {
      starColor: 0xfff0d0,
      twin: true,
      planets: [{ color: 0xcc7755, orbit: 2.4, size: 0.16 }],
    },
  },
  {
    id: 'sirius',
    region: 'solar',
    kind: 'starsystem',
    nameJa: 'シリウス',
    nameSub: 'Sirius A/B — おおいぬ座',
    distanceLy: 8.6,
    pos: [120, -14, 78],
    scale: 3.4,
    color: 0xbfd8ff,
    color2: 0xffffff,
    fictional: false,
    tag: '地球の夜空でもっとも明るい恒星',
    lore: '夜空で最も明るく輝く青白い星。実は連星で、太陽ほどの質量を地球サイズに押し込めた白色矮星シリウスBを従えている。古代エジプトでは、この星の日の出前の出現がナイル川の氾濫とともに新年を告げた。',
    params: { starColor: 0xbfd8ff, twin: true },
  },
  {
    id: 'trappist',
    region: 'solar',
    kind: 'starsystem',
    nameJa: 'トラピスト1',
    nameSub: 'TRAPPIST-1 — みずがめ座',
    distanceLy: 40.7,
    pos: [95, 26, 15],
    scale: 2.2,
    color: 0xff8844,
    color2: 0x66ccff,
    fictional: false,
    tag: '7つの地球型惑星をもつ赤色矮星',
    lore: 'ちいさな赤い星のまわりを、7つの地球サイズの岩石惑星が身を寄せあって回る。うち3つはハビタブルゾーンにあり、液体の水をたたえているかもしれない。惑星どうしの距離が近く、それぞれの空には隣の惑星が月よりも大きく浮かんで見えるはずだ。',
    params: {
      starColor: 0xff8844,
      planets: [
        { color: 0x9a8877, orbit: 1.6, size: 0.12 },
        { color: 0x7fa0c0, orbit: 2.1, size: 0.13 },
        { color: 0x6fb0a0, orbit: 2.7, size: 0.13 },
        { color: 0x88bcff, orbit: 3.3, size: 0.14 },
        { color: 0x7fa0c0, orbit: 4.0, size: 0.13 },
        { color: 0xa0aab8, orbit: 4.8, size: 0.12 },
        { color: 0xc8d4e0, orbit: 5.6, size: 0.11 },
      ],
    },
  },
  {
    id: 'betelgeuse',
    region: 'solar',
    kind: 'starsystem',
    nameJa: 'ベテルギウス',
    nameSub: 'Betelgeuse — オリオン座α',
    distanceLy: 642,
    pos: [70, 40, 120],
    scale: 7,
    color: 0xff5a2a,
    color2: 0xffcc66,
    fictional: false,
    tag: 'いつ爆発してもおかしくない赤色超巨星',
    lore: 'オリオン座の肩に燃える、太陽の直径の約900倍という赤色超巨星。もし太陽の位置に置けば木星の軌道すら呑みこむ。星としての寿命の最終盤にあり、天文学的なスケールでは「いつ」超新星爆発を起こしてもおかしくない。その日、地球の空には満月ほどの明るさの星が数週間ともり続けるだろう。',
    params: { starColor: 0xff5a2a },
  },
  {
    id: 'pleiades',
    region: 'solar',
    kind: 'cluster',
    nameJa: 'プレアデス星団（すばる）',
    nameSub: 'Pleiades / M45 — おうし座',
    distanceLy: 444,
    pos: [40, -30, 95],
    scale: 14,
    color: 0x9fc4ff,
    color2: 0xffffff,
    fictional: false,
    tag: '青く若い星々の集い',
    lore: '生まれてまだ1億年ほどの、青く熱い若い星々のあつまり。日本では「すばる」と呼ばれ、肉眼でも6〜7個の星がひしめいて見える。星々はいまも、自分たちが生まれた星雲のガスの名残を青くまとっている。',
  },

  {
    id: 'sgr-a',
    region: 'milkyway',
    kind: 'anomaly',
    nameJa: 'いて座A*',
    nameSub: 'Sagittarius A* — 銀河中心の超大質量ブラックホール',
    distanceLy: 26000,
    pos: [3, 1, 5],
    scale: 8,
    color: 0xffa050,
    color2: 0x6688cc,
    fictional: false,
    tag: '天の川のすべてが回る、見えない心臓',
    lore: '天の川銀河の2000億の星々すべてが、その周りを回る中心点。太陽の約430万倍の質量が、水星の軌道より小さな領域に押し込められている。2022年、イベント・ホライズン・テレスコープが人類史上はじめてその「影」を撮影した。すぐそばの恒星S2は、この見えない何かのまわりを秒速7,000km以上で振り回されている。ここから先へ降りてみたい人は——「ブラックホールに飛び込む」を。',
  },

  // === 天の川銀河の中の星雲（実在）===========================================
  {
    id: 'orion',
    region: 'milkyway',
    kind: 'nebula',
    nameJa: 'オリオン大星雲',
    nameSub: 'Orion Nebula / M42',
    distanceLy: 1344,
    pos: [30, 55, 150],
    scale: 26,
    color: 0xff6688,
    color2: 0x66ccff,
    fictional: false,
    tag: '星が生まれる巨大な揺りかご',
    lore: 'オリオン座の三つ星の下、剣の位置にぼんやりと光る、肉眼でも見える星のゆりかご。ガスと塵の雲が自らの重みで崩れ、いままさに新しい太陽たちが産声をあげている。中心では生まれたての巨星がまわりのガスを紅とすみれ色に照らしている。',
  },
  {
    id: 'catseye',
    region: 'milkyway',
    kind: 'nebula',
    nameJa: '猫の目星雲',
    nameSub: "Cat's Eye Nebula / NGC 6543",
    distanceLy: 3300,
    pos: [-60, 70, 90],
    scale: 16,
    color: 0x33ddbb,
    color2: 0x3388ff,
    fictional: false,
    tag: '死にゆく星が吐いた宝石のような殻',
    lore: '太陽のような星が寿命の果てに外層を静かに脱ぎ捨てた姿——惑星状星雲。幾重にも重なった同心円の殻は、星が数百年ごとに息をつくように放出したガスの記録だ。数十億年後、わたしたちの太陽もこんな美しい亡骸を残すのかもしれない。',
  },

  // === 天の川銀河内の空想恒星系（Fable 5）===================================
  {
    id: 'amber-ring',
    region: 'milkyway',
    kind: 'starsystem',
    nameJa: '琥珀の環世界 アンバー・リング',
    nameSub: 'Amber Ring — Fable 5 空想',
    distanceLy: 1120,
    pos: [-40, -18, 130],
    scale: 3,
    color: 0xffb347,
    color2: 0xffe0a0,
    fictional: true,
    tag: '恒星をまるごと囲む黄金の輪',
    lore: 'ある文明が、母なる星をまるごと囲む幅百万キロの巨大な環をつくりあげた——と Fable 5 は想像する。環の内側には海と森と都市がびっしりと敷きつめられ、恒星の光は決して沈まない。夜がほしい者は、環の「日陰側」へ列車で旅をするのだという。',
    params: { starColor: 0xffb347, rings: true },
  },
  {
    id: 'vesper',
    region: 'milkyway',
    kind: 'starsystem',
    nameJa: '二重らせん星系 ヴェスペル',
    nameSub: 'Vesper Binary — Fable 5 空想',
    distanceLy: 780,
    pos: [10, -45, 60],
    scale: 3.2,
    color: 0x66ccff,
    color2: 0xff77bb,
    fictional: true,
    tag: '青と紅、ふたつの太陽をもつ世界',
    lore: '青い太陽と紅い太陽が手をつなぐように回りあう星系。その間を巡る惑星ヴェスペルには、影が二重にのび、朝は青くまた夕は紅く、一日に二度たそがれが訪れる。住む者たちは「青の刻」に働き「紅の刻」に眠るのだと Fable 5 は綴る。',
    params: {
      starColor: 0x66ccff,
      twin: true,
      planets: [
        { color: 0x88ddbb, orbit: 3.6, size: 0.2 },
        { color: 0xcc88aa, orbit: 5.2, size: 0.16 },
      ],
    },
  },
  {
    id: 'beacon',
    region: 'milkyway',
    kind: 'anomaly',
    nameJa: '静寂の灯台 サイレント・ビーコン',
    nameSub: 'Silent Beacon (Pulsar) — Fable 5 空想',
    distanceLy: 2400,
    pos: [-110, 22, 20],
    scale: 4,
    color: 0xccf0ff,
    color2: 0x3366ff,
    fictional: true,
    tag: '1秒に700回転する、水晶の惑星を従えた灯台',
    lore: '中性子星が1秒間に700回まわり、二条の電波のビームで宇宙を照らし続けている。そのまわりを回るのは、放射線で結晶化した「水晶の惑星」たち。灯台は誰に向けて光るのでもなく、ただ静かに、宇宙の時を刻む時計として回り続ける——と Fable 5 は想う。',
    params: { rings: true },
  },
  {
    id: 'greenhouse',
    region: 'milkyway',
    kind: 'starsystem',
    nameJa: '常春の庭 エヴァーグリーン',
    nameSub: 'Evergreen — Fable 5 空想',
    distanceLy: 300,
    pos: [128, 30, 5],
    scale: 2.8,
    color: 0xffe6a0,
    color2: 0x66dd88,
    fictional: true,
    tag: '銀河系じゅうの植物が根づいた緑の惑星',
    lore: 'おだやかな橙色の星のまわりに、一年じゅう春がつづく惑星がある。Fable 5 の空想では、いつかの旅する文明が銀河のあちこちで採取した種子をここに蒔き、いまでは何万もの世界の植物がひとつの生態系を織りなす「宇宙の植物園」になっている。',
    params: {
      starColor: 0xffe6a0,
      planets: [{ color: 0x55cc77, orbit: 3.2, size: 0.24 }],
    },
  },
  {
    id: 'lantern-nebula',
    region: 'milkyway',
    kind: 'nebula',
    nameJa: '胎動星雲 スタークレイドル',
    nameSub: "Star Cradle — Fable 5 空想",
    distanceLy: 5200,
    pos: [-30, -70, -60],
    scale: 30,
    color: 0xff99cc,
    color2: 0xaa66ff,
    fictional: true,
    tag: 'いま千の太陽が同時に生まれつつある雲',
    lore: '天の川でもっとも活発な星のゆりかご——と Fable 5 は名づけた。桃色とすみれ色の霧のなかで、千をこえる原始星がまるで心臓のように脈打ちながら灯りはじめている。数百万年後、ここは若く青い大星団になっているだろう。',
  },

  // === 局所銀河群（実在）=====================================================
  {
    id: 'andromeda',
    region: 'localgroup',
    kind: 'galaxy-spiral',
    nameJa: 'アンドロメダ銀河',
    nameSub: 'Andromeda / M31',
    distanceLy: 2_537_000,
    pos: [-900, 120, -700],
    scale: 300,
    color: 0xfff0d8,
    color2: 0x88bbff,
    fictional: false,
    tag: '天の川に迫りくる隣の大渦巻',
    lore: '天の川銀河のいちばん近くにある大きな渦巻銀河。1兆もの星をかかえ、天の川よりもひとまわり大きい。いまも秒速110kmでこちらへ近づいており、約45億年後には天の川と衝突・合体して、ひとつの巨大な楕円銀河「ミルコメダ」になると考えられている。',
    params: { arms: 2, spin: 3.0 },
  },
  {
    id: 'lmc',
    region: 'localgroup',
    kind: 'galaxy-irregular',
    nameJa: '大マゼラン雲',
    nameSub: 'Large Magellanic Cloud',
    distanceLy: 163_000,
    pos: [420, -180, -520],
    scale: 120,
    color: 0xcfe0ff,
    color2: 0xff88aa,
    fictional: false,
    tag: '天の川に寄りそう小さな伴銀河',
    lore: '南半球の夜空にぼんやりと浮かぶ、天の川の衛星銀河。かたちの崩れた不規則銀河で、内部には「タランチュラ星雲」という宇宙屈指の巨大な星形成領域をかかえている。マゼランの航海の記録に残されたことからこの名がある。',
  },
  {
    id: 'triangulum',
    region: 'localgroup',
    kind: 'galaxy-spiral',
    nameJa: 'さんかく座銀河',
    nameSub: 'Triangulum / M33',
    distanceLy: 2_730_000,
    pos: [-1100, -60, -420],
    scale: 190,
    color: 0xe8eeff,
    color2: 0x66aaff,
    fictional: false,
    tag: '局所銀河群で3番目に大きい渦巻',
    lore: '天の川、アンドロメダに次ぐ、局所銀河群で3番目に大きな渦巻銀河。腕にそって桃色の星形成領域が数珠のようにつらなり、若い星が盛んに生まれている。空の条件がよければ、肉眼で見える最も遠い天体のひとつだ。',
    params: { arms: 3, spin: 2.4 },
  },

  // === 深宇宙の実在銀河 =======================================================
  {
    id: 'whirlpool',
    region: 'deepfield',
    kind: 'galaxy-spiral',
    nameJa: '子持ち銀河',
    nameSub: 'Whirlpool / M51',
    distanceLy: 23_000_000,
    pos: [-2600, 400, 1800],
    scale: 260,
    color: 0xfff2e0,
    color2: 0x99bbff,
    fictional: false,
    tag: '伴銀河を連れた、教科書のような渦巻',
    lore: 'まるで描いたように整った腕をもつ、渦巻銀河の代表格。小さな伴銀河 NGC 5195 と重力でつながっており、この「連れ子」との相互作用が、みごとな渦の腕をいっそう強く際立たせている。',
    params: { arms: 2, spin: 3.4, twin: true },
  },
  {
    id: 'sombrero',
    region: 'deepfield',
    kind: 'galaxy-elliptical',
    nameJa: 'ソンブレロ銀河',
    nameSub: 'Sombrero / M104',
    distanceLy: 29_300_000,
    pos: [3000, -500, 1200],
    scale: 240,
    color: 0xffe8c8,
    color2: 0x223344,
    fictional: false,
    tag: 'つばの広い帽子のような横向きの銀河',
    lore: '真横から見た円盤に、くっきりとした暗い塵の帯が走り、メキシコの帽子ソンブレロのように見える。中心には太陽の約10億倍という途方もない質量のブラックホールが潜むと考えられている。',
  },

  // === 深宇宙の空想銀河（Fable 5）===========================================
  {
    id: 'aurelia',
    region: 'deepfield',
    kind: 'galaxy-spiral',
    nameJa: '螺旋の楽園 アウレリア',
    nameSub: 'Aurelia — Fable 5 空想',
    distanceLy: 41_000_000,
    pos: [-3600, -300, -2400],
    scale: 320,
    color: 0xffd47a,
    color2: 0x66ffdd,
    fictional: true,
    tag: '黄金と翡翠に輝く、生命あふれる渦',
    lore: 'Fable 5 が夢みた、いのちに満ちた渦巻銀河。黄金色の古い星々が芯をつくり、翡翠色にかがやく腕には水の惑星が数えきれぬほど散らばる。この銀河のどの星に降り立っても、空を見あげれば必ず誰かが手を振りかえしてくれる——そんな宇宙。',
    params: { arms: 5, spin: 2.8 },
  },
  {
    id: 'suminagashi',
    region: 'deepfield',
    kind: 'galaxy-irregular',
    nameJa: '墨流し銀河 スミナガシ',
    nameSub: 'Suminagashi — Fable 5 空想',
    distanceLy: 88_000_000,
    pos: [2200, 900, -3400],
    scale: 280,
    color: 0x5566cc,
    color2: 0xdd66aa,
    fictional: true,
    tag: '水面に落とした墨のように渦巻く銀河',
    lore: '二つの銀河が衝突し、その星々とガスが、水に落とした一滴の墨のようにたおやかに混ざりあっている。藍と臙脂の渦は数億年をかけてゆっくりと形を変え、二度と同じ模様にはならない。宇宙で最も大きな、そして最もゆっくりとした一枚の絵。',
    params: { twin: true },
  },
  {
    id: 'corona-magna',
    region: 'deepfield',
    kind: 'galaxy-elliptical',
    nameJa: '王冠銀河 コロナ・マグナ',
    nameSub: 'Corona Magna — Fable 5 空想',
    distanceLy: 210_000_000,
    pos: [-1800, 1400, 3600],
    scale: 420,
    color: 0xffe1a8,
    color2: 0xffffff,
    fictional: true,
    tag: '兆をこえる老いた星が集う巨大楕円銀河',
    lore: '一兆をこえる年老いた金色の星があつまってできた、巨大な楕円銀河。もう新しい星はほとんど生まれず、宇宙の時間の重みそのもののように、静かに黄金色にかがやいている。まわりには数百の小さな銀河が、王に従う諸侯のように付き従う。',
  },

  // === 多元宇宙・異界（純粋な空想 / Fable 5）================================
  {
    id: 'iris',
    region: 'multiverse',
    kind: 'nebula',
    nameJa: '虹泳ぐ星雲 イリス',
    nameSub: 'Iris — Fable 5 空想',
    distanceLy: 1_300_000_000,
    pos: [6200, -800, -5200],
    scale: 360,
    color: 0xff66aa,
    color2: 0x33ccff,
    fictional: true,
    tag: '七色の光が魚のように泳ぐ星雲',
    lore: '既知の物理からは少し外れた場所。ここでは光が粒子でも波でもなく、群れをなす魚のように振る舞う——と Fable 5 は想像する。虹のすべての色が、星雲のなかを行き交い、からみあい、ときおり集まってひとつの巨大な光の生き物になる。見る者の心のいろによって、見える色が変わるのだという。',
  },
  {
    id: 'retroverse',
    region: 'multiverse',
    kind: 'anomaly',
    nameJa: '逆行宇宙 レトロヴァース',
    nameSub: 'Retroverse — Fable 5 空想',
    distanceLy: 4_600_000_000,
    pos: [-7000, 1600, 4200],
    scale: 300,
    color: 0x99aaff,
    color2: 0xffaa66,
    fictional: true,
    tag: '時間が未来から過去へ流れる宇宙',
    lore: 'Fable 5 が想う、時のさかさまな宇宙。ここでは割れた器がひとりでに継ぎあわさり、散った星の灰があつまって恒星がよみがえる。生き物は老いた姿で生まれ、若返りながら生き、やがて母の胎へと帰っていく。この宇宙の住人にとって、あなたの故郷こそが「時の逆さまな異界」なのだ。',
    params: { rings: true },
  },
  {
    id: 'prisma',
    region: 'multiverse',
    kind: 'anomaly',
    nameJa: '万色の泡宇宙 プリズマ',
    nameSub: 'Prisma — Fable 5 空想',
    distanceLy: 13_800_000_000,
    pos: [8800, 2400, 3000],
    scale: 480,
    color: 0xff55cc,
    color2: 0x55ffdd,
    fictional: true,
    tag: '無数の泡宇宙が寄せあつまる多元宇宙の岸辺',
    lore: 'ここは宇宙そのものが泡のように無数に浮かぶ「多元宇宙の海」の岸辺。ひとつひとつの泡が、それぞれ別の物理法則と別の歴史をもつ、まるごとひとつの宇宙だ。ある泡では重力が斥力で、ある泡では時間が二本流れる。泡どうしがそっと触れあうとき、ごくまれに、こちらの星のひかりが向こうの空に流れ星として現れる——と Fable 5 は綴る。',
    params: { rings: true },
  },
  {
    id: 'origin',
    region: 'multiverse',
    kind: 'anomaly',
    nameJa: 'はじまりの一点 オリジン',
    nameSub: 'The Origin — Fable 5 空想',
    distanceLy: 13_800_000_000,
    pos: [0, 3200, -9000],
    scale: 200,
    color: 0xffffff,
    color2: 0xffcc44,
    fictional: true,
    tag: 'すべての宇宙が生まれた最初のひかり',
    lore: 'あらゆる方向へ138億年さかのぼった、時間と空間のはじまりの点。すべての銀河、すべての星、あなたをかたちづくる原子のひとつひとつが、かつてここにあった。Fable 5 はここを、宇宙で最初に灯った、そしていまも消えることのない一点の光として想い描く。この光の残響を、わたしたちはいまも「宇宙マイクロ波背景放射」として全天から受けとっている。',
    params: { rings: true },
  },
];

// ---------------------------------------------------------------------------
// 未知の深宇宙銀河（手続き生成）
//
// curated な26天体の外側に、発見できる名もなき銀河をばらまく。宇宙が広く、
// まだ見ぬ場所がいくらでもあることを体感させるための「探索の余白」。
// 決定論的な擬似乱数で生成するので、毎回おなじ宇宙が再現される。
// ---------------------------------------------------------------------------
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s ^ (s >>> 15), 2246822507) + 0x9e3779b9) >>> 0;
    return (s >>> 8) / 0xffffff;
  };
}

const NAME_ADJ = [
  '銀の', '琥珀の', '蒼き', '紅の', '翠の', '黄昏の', '暁の', '孤高の',
  '眠れる', '囁く', '燃える', '氷の', '真珠の', '菫の', '緋色の', '無音の',
  '遠雷の', '双つの', '流離う', '始原の',
];
const NAME_NOUN = [
  '渦', '灯', '王冠', '車輪', '螺旋', '花', '眼', '砂時計', '海', '焔',
  '硝子', '羽根', '波', '鏡', '環', '巣', '幟', '嵐', '種子', '調べ',
];
const KINDS: CosmicKind[] = ['galaxy-spiral', 'galaxy-elliptical', 'galaxy-irregular'];
const PALETTE: [number, number][] = [
  [0xfff0d8, 0x88bbff], [0xffd47a, 0x66ffdd], [0x9fc4ff, 0xffffff],
  [0xff99cc, 0xaa66ff], [0xffe1a8, 0xffffff], [0x66ddbb, 0x3388ff],
  [0xffb0d0, 0x66ccff], [0xc8d0ff, 0xff9966], [0xa0ffcc, 0xffee88],
];
const LORE_A = [
  'まだ誰も名づけていない、深宇宙にひっそりと浮かぶ銀河。',
  '観測記録のはざまから見つかった、名もなき銀河。',
  '光がここへ届くのに何千万年もかかった、遠い遠い銀河。',
  '星図の余白にぽつんと灯る、忘れられた銀河。',
];
const LORE_B = [
  'その腕には数百億の太陽が渦を巻き、',
  '古い赤い星々が静かに芯をかため、',
  'ガスと若い青い星がまだらに散らばり、',
  'かたちの崩れた光の塊がいくつも寄り集まり、',
];
const LORE_C = [
  'いつか誰かが訪れる日を待っている——と Fable 5 は想う。',
  'あなたが最初の訪問者かもしれない。',
  'そこにも、見上げれば星空を数える誰かがいるのだろうか。',
  'この光のなかにも、無数の物語が眠っている。',
];

/** 未知の銀河を count 個、決定論的に生成する。 */
function generateUnknownGalaxies(count: number): CosmicBody[] {
  const out: CosmicBody[] = [];
  for (let i = 0; i < count; i++) {
    const r = seeded(1000 + i * 2654435761);
    const kind = KINDS[Math.floor(r() * KINDS.length)];
    const [color, color2] = PALETTE[Math.floor(r() * PALETTE.length)];
    // 深宇宙〜多元宇宙のあいだの大きな殻に配置
    const u = r() * 2 - 1;
    const theta = r() * Math.PI * 2;
    const radius = 3200 + r() * 8600;
    const s = Math.sqrt(1 - u * u);
    const pos: [number, number, number] = [
      radius * s * Math.cos(theta),
      u * radius * 0.55,
      radius * s * Math.sin(theta),
    ];
    const adj = NAME_ADJ[Math.floor(r() * NAME_ADJ.length)];
    const noun = NAME_NOUN[Math.floor(r() * NAME_NOUN.length)];
    const designation = 1000 + Math.floor(r() * 8999);
    const distanceLy = (5 + r() * 900) * 1_000_000; // 数百万〜約10億光年
    const lore =
      LORE_A[Math.floor(r() * LORE_A.length)] +
      LORE_B[Math.floor(r() * LORE_B.length)] +
      LORE_C[Math.floor(r() * LORE_C.length)];
    out.push({
      id: `udg-${i}`,
      region: 'deepfield',
      kind,
      nameJa: `${adj}${noun}銀河`,
      nameSub: `UDG-${designation}（未確認深宇宙銀河）`,
      distanceLy,
      pos,
      scale: 130 + r() * 220,
      color,
      color2,
      fictional: true,
      discoverable: true,
      tag: '未知の銀河',
      lore,
      params: { arms: 2 + Math.floor(r() * 4), spin: 2 + r() * 2 },
    });
  }
  return out;
}

/** 発見可能な未知の銀河群（チャートには載らない）。 */
export const UNKNOWN_GALAXIES: CosmicBody[] = generateUnknownGalaxies(48);

/** シーンに配置する全天体（curated ＋ 未知の銀河）。 */
export const ALL_BODIES: CosmicBody[] = [...COSMOS, ...UNKNOWN_GALAXIES];

/** ID から天体を引く。 */
export const COSMOS_BY_ID: Record<string, CosmicBody> = Object.fromEntries(
  ALL_BODIES.map((b) => [b.id, b]),
);
