import type { PlanetKey } from './planetElements';

/** Encyclopedic per-planet facts for the info panel (values ≈ NASA factsheet). */
export interface PlanetInfo {
  diameterKm: number;
  /** mass, Earth = 1 */
  massEarths: number;
  /** sidereal rotation, human-readable */
  rotationJa: string;
  moons: number;
  /** representative temperature */
  tempJa: string;
  descJa: string;
  funFactJa: string;
}

export const PLANET_INFO: Record<PlanetKey, PlanetInfo> = {
  mercury: {
    diameterKm: 4879,
    massEarths: 0.055,
    rotationJa: '58.6日',
    moons: 0,
    tempJa: '-173〜427°C',
    descJa:
      '太陽に最も近い、太陽系最小の惑星。大気がほとんどないため昼と夜の温度差は600°C近くに達します。表面はクレーターに覆われ、月とよく似た姿をしています。',
    funFactJa: '公転2周する間に3回しか自転しないため、水星の「1日」は水星の「2年」より長い。',
  },
  venus: {
    diameterKm: 12104,
    massEarths: 0.815,
    rotationJa: '243日（逆回転）',
    moons: 0,
    tempJa: '約464°C',
    descJa:
      '大きさは地球とほぼ同じ「双子星」ですが、環境は正反対。厚い二酸化炭素の大気と硫酸の雲による強烈な温室効果で、表面は鉛も溶ける灼熱の世界です。',
    funFactJa: '自転が逆向きなので、金星では太陽が西から昇る。',
  },
  earth: {
    diameterKm: 12742,
    massEarths: 1,
    rotationJa: '23.9時間',
    moons: 1,
    tempJa: '平均15°C',
    descJa:
      '生命が確認されている唯一の惑星。表面の約7割を液体の水が覆い、酸素を含む大気と磁場が生命を守っています。私たちはいま、この星に乗って秒速約30kmで太陽を回っています。',
    funFactJa: '地球は完全な球ではなく、自転の遠心力で赤道方向に約43kmふくらんでいる。',
  },
  mars: {
    diameterKm: 6779,
    massEarths: 0.107,
    rotationJa: '24.6時間',
    moons: 2,
    tempJa: '平均-63°C',
    descJa:
      '酸化鉄の砂に覆われた「赤い惑星」。かつて液体の水が流れた跡が残り、生命探査の最前線です。太陽系最大の火山オリンポス山（高さ約22km）と大峡谷マリネリスがあります。',
    funFactJa: '1日の長さが地球とほぼ同じ（24時間37分）で、四季もある。',
  },
  jupiter: {
    diameterKm: 139820,
    massEarths: 317.8,
    rotationJa: '9.9時間',
    moons: 95,
    tempJa: '雲頂 約-108°C',
    descJa:
      '太陽系最大のガス惑星。他の全惑星を合わせた2.5倍の質量を持ち、その強大な重力は彗星や小惑星を引き寄せて内惑星の「盾」の役割も果たしています。大赤斑は300年以上続く巨大な嵐です。',
    funFactJa: '大赤斑には地球が2〜3個すっぽり入る。',
  },
  saturn: {
    diameterKm: 116460,
    massEarths: 95.2,
    rotationJa: '10.7時間',
    moons: 146,
    tempJa: '雲頂 約-139°C',
    descJa:
      '無数の氷の粒でできた壮大な環を持つ惑星。環の直径は約28万kmに及ぶ一方、厚さは平均わずか10m程度しかありません。衛星タイタンには濃い大気とメタンの海があります。',
    funFactJa: '平均密度が水より小さいため、巨大なプールがあれば土星は浮く。',
  },
  uranus: {
    diameterKm: 50724,
    massEarths: 14.5,
    rotationJa: '17.2時間（逆回転）',
    moons: 28,
    tempJa: '約-197°C',
    descJa:
      '自転軸が98°も傾き、ほぼ「横倒し」で公転する氷の巨星。メタンの大気が赤い光を吸収するため青緑色に見えます。1986年にボイジャー2号が唯一接近観測しました。',
    funFactJa: '横倒しのため、極では昼が42年続いたあと夜が42年続く。',
  },
  neptune: {
    diameterKm: 49244,
    massEarths: 17.1,
    rotationJa: '16.1時間',
    moons: 16,
    tempJa: '約-201°C',
    descJa:
      '太陽系の最も外側を回る、深い青色の氷の巨星。太陽から遠いにもかかわらず、風速は太陽系最速の秒速600mに達します。位置が計算で予言されてから発見された最初の惑星です。',
    funFactJa: '発見（1846年）から2011年にようやく「発見後1周目」の公転を終えた。',
  },
};
