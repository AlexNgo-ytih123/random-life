/**
 * ISO3 国家代码 → 中文名 / 英文名 / 所属大洲 的内置对照表。
 *
 * 说明：
 * - 区域划分沿用 OWID（Our World in Data）的 "World region" 口径：
 *   Africa / Asia / Europe / North America / South America / Oceania 六个大洲，
 *   加勒比海与中美洲归入 North America，太平洋岛屿归入 Oceania。
 * - 英文名优先取 OWID 原始 CSV 的 `Entity` 列（见 tools/build-world-data.mjs），
 *   本表作为兜底；中文名只有本表里有，缺失时由调用方回退到英文名。
 * - 未知代码一律返回 null，绝不抛异常（构建脚本不允许因为一个陌生代码而崩掉）。
 */

/** 六大洲常量（构建脚本与测试共用同一套口径） */
export const REGIONS = Object.freeze([
  'Africa',
  'Asia',
  'Europe',
  'North America',
  'South America',
  'Oceania',
]);

/**
 * ISO3 → [中文名, 英文名, 区域]
 * 覆盖 OWID 与 World Bank 原始数据里出现的全部国家/地区（约 240 个代码）。
 */
const TABLE = {
  ABW: ['阿鲁巴', 'Aruba', 'North America'],
  AFG: ['阿富汗', 'Afghanistan', 'Asia'],
  AGO: ['安哥拉', 'Angola', 'Africa'],
  AIA: ['安圭拉', 'Anguilla', 'North America'],
  ALA: ['奥兰群岛', 'Aland Islands', 'Europe'],
  ALB: ['阿尔巴尼亚', 'Albania', 'Europe'],
  AND: ['安道尔', 'Andorra', 'Europe'],
  ANT: ['荷属安的列斯', 'Netherlands Antilles', 'North America'],
  ARE: ['阿拉伯联合酋长国', 'United Arab Emirates', 'Asia'],
  ARG: ['阿根廷', 'Argentina', 'South America'],
  ARM: ['亚美尼亚', 'Armenia', 'Asia'],
  ASM: ['美属萨摩亚', 'American Samoa', 'Oceania'],
  ATG: ['安提瓜和巴布达', 'Antigua and Barbuda', 'North America'],
  AUS: ['澳大利亚', 'Australia', 'Oceania'],
  AUT: ['奥地利', 'Austria', 'Europe'],
  AZE: ['阿塞拜疆', 'Azerbaijan', 'Asia'],
  BDI: ['布隆迪', 'Burundi', 'Africa'],
  BEL: ['比利时', 'Belgium', 'Europe'],
  BEN: ['贝宁', 'Benin', 'Africa'],
  BES: ['博奈尔、圣尤斯特歇斯和萨巴', 'Bonaire Sint Eustatius and Saba', 'North America'],
  BFA: ['布基纳法索', 'Burkina Faso', 'Africa'],
  BGD: ['孟加拉国', 'Bangladesh', 'Asia'],
  BGR: ['保加利亚', 'Bulgaria', 'Europe'],
  BHR: ['巴林', 'Bahrain', 'Asia'],
  BHS: ['巴哈马', 'Bahamas', 'North America'],
  BIH: ['波斯尼亚和黑塞哥维那', 'Bosnia and Herzegovina', 'Europe'],
  BLM: ['圣巴泰勒米', 'Saint Barthelemy', 'North America'],
  BLR: ['白俄罗斯', 'Belarus', 'Europe'],
  BLZ: ['伯利兹', 'Belize', 'North America'],
  BMU: ['百慕大', 'Bermuda', 'North America'],
  BOL: ['玻利维亚', 'Bolivia', 'South America'],
  BRA: ['巴西', 'Brazil', 'South America'],
  BRB: ['巴巴多斯', 'Barbados', 'North America'],
  BRN: ['文莱', 'Brunei', 'Asia'],
  BTN: ['不丹', 'Bhutan', 'Asia'],
  BWA: ['博茨瓦纳', 'Botswana', 'Africa'],
  CAF: ['中非共和国', 'Central African Republic', 'Africa'],
  CAN: ['加拿大', 'Canada', 'North America'],
  CHE: ['瑞士', 'Switzerland', 'Europe'],
  CHL: ['智利', 'Chile', 'South America'],
  CHN: ['中国', 'China', 'Asia'],
  CIV: ['科特迪瓦', "Cote d'Ivoire", 'Africa'],
  CMR: ['喀麦隆', 'Cameroon', 'Africa'],
  COD: ['刚果民主共和国', 'Democratic Republic of Congo', 'Africa'],
  COG: ['刚果共和国', 'Congo', 'Africa'],
  COK: ['库克群岛', 'Cook Islands', 'Oceania'],
  COL: ['哥伦比亚', 'Colombia', 'South America'],
  COM: ['科摩罗', 'Comoros', 'Africa'],
  CPV: ['佛得角', 'Cape Verde', 'Africa'],
  CRI: ['哥斯达黎加', 'Costa Rica', 'North America'],
  CUB: ['古巴', 'Cuba', 'North America'],
  CUW: ['库拉索', 'Curacao', 'North America'],
  CYM: ['开曼群岛', 'Cayman Islands', 'North America'],
  CYP: ['塞浦路斯', 'Cyprus', 'Europe'],
  CZE: ['捷克', 'Czechia', 'Europe'],
  DEU: ['德国', 'Germany', 'Europe'],
  DJI: ['吉布提', 'Djibouti', 'Africa'],
  DMA: ['多米尼克', 'Dominica', 'North America'],
  DNK: ['丹麦', 'Denmark', 'Europe'],
  DOM: ['多米尼加', 'Dominican Republic', 'North America'],
  DZA: ['阿尔及利亚', 'Algeria', 'Africa'],
  ECU: ['厄瓜多尔', 'Ecuador', 'South America'],
  EGY: ['埃及', 'Egypt', 'Africa'],
  ERI: ['厄立特里亚', 'Eritrea', 'Africa'],
  ESH: ['西撒哈拉', 'Western Sahara', 'Africa'],
  ESP: ['西班牙', 'Spain', 'Europe'],
  EST: ['爱沙尼亚', 'Estonia', 'Europe'],
  ETH: ['埃塞俄比亚', 'Ethiopia', 'Africa'],
  FIN: ['芬兰', 'Finland', 'Europe'],
  FJI: ['斐济', 'Fiji', 'Oceania'],
  FLK: ['福克兰群岛（马尔维纳斯）', 'Falkland Islands', 'South America'],
  FRA: ['法国', 'France', 'Europe'],
  FRO: ['法罗群岛', 'Faroe Islands', 'Europe'],
  FSM: ['密克罗尼西亚', 'Micronesia (country)', 'Oceania'],
  GAB: ['加蓬', 'Gabon', 'Africa'],
  GBR: ['英国', 'United Kingdom', 'Europe'],
  GEO: ['格鲁吉亚', 'Georgia', 'Asia'],
  GGY: ['根西岛', 'Guernsey', 'Europe'],
  GHA: ['加纳', 'Ghana', 'Africa'],
  GIB: ['直布罗陀', 'Gibraltar', 'Europe'],
  GIN: ['几内亚', 'Guinea', 'Africa'],
  GLP: ['格勒普岛', 'Guadeloupe', 'North America'],
  GMB: ['冈比亚', 'Gambia', 'Africa'],
  GNB: ['几内亚比绍', 'Guinea-Bissau', 'Africa'],
  GNQ: ['赤道几内亚', 'Equatorial Guinea', 'Africa'],
  GRC: ['希腊', 'Greece', 'Europe'],
  GRD: ['格林纳达', 'Grenada', 'North America'],
  GRL: ['格陵兰', 'Greenland', 'North America'],
  GTM: ['危地马拉', 'Guatemala', 'North America'],
  GUF: ['法属圭亚那', 'French Guiana', 'South America'],
  GUM: ['关岛', 'Guam', 'Oceania'],
  GUY: ['圭亚那', 'Guyana', 'South America'],
  HKG: ['中国香港', 'Hong Kong', 'Asia'],
  HND: ['洪都拉斯', 'Honduras', 'North America'],
  HRV: ['克罗地亚', 'Croatia', 'Europe'],
  HTI: ['海地', 'Haiti', 'North America'],
  HUN: ['匈牙利', 'Hungary', 'Europe'],
  IDN: ['印度尼西亚', 'Indonesia', 'Asia'],
  IMN: ['马恩岛', 'Isle of Man', 'Europe'],
  IND: ['印度', 'India', 'Asia'],
  IRL: ['爱尔兰', 'Ireland', 'Europe'],
  IRN: ['伊朗', 'Iran', 'Asia'],
  IRQ: ['伊拉克', 'Iraq', 'Asia'],
  ISL: ['冰岛', 'Iceland', 'Europe'],
  ISR: ['以色列', 'Israel', 'Asia'],
  ITA: ['意大利', 'Italy', 'Europe'],
  JAM: ['牙买加', 'Jamaica', 'North America'],
  JEY: ['泽西岛', 'Jersey', 'Europe'],
  JOR: ['约旦', 'Jordan', 'Asia'],
  JPN: ['日本', 'Japan', 'Asia'],
  KAZ: ['哈萨克斯坦', 'Kazakhstan', 'Asia'],
  KEN: ['肯尼亚', 'Kenya', 'Africa'],
  KGZ: ['吉尔吉斯斯坦', 'Kyrgyzstan', 'Asia'],
  KHM: ['柬埔寨', 'Cambodia', 'Asia'],
  KIR: ['基里巴斯', 'Kiribati', 'Oceania'],
  KNA: ['圣基茨和尼维斯', 'Saint Kitts and Nevis', 'North America'],
  KOR: ['韩国', 'South Korea', 'Asia'],
  KWT: ['科威特', 'Kuwait', 'Asia'],
  LAO: ['老挝', 'Laos', 'Asia'],
  LBN: ['黎巴嫩', 'Lebanon', 'Asia'],
  LBR: ['利比里亚', 'Liberia', 'Africa'],
  LBY: ['利比亚', 'Libya', 'Africa'],
  LCA: ['圣卢西亚', 'Saint Lucia', 'North America'],
  LIE: ['列支敦士登', 'Liechtenstein', 'Europe'],
  LKA: ['斯里兰卡', 'Sri Lanka', 'Asia'],
  LSO: ['莱索托', 'Lesotho', 'Africa'],
  LTU: ['立陶宛', 'Lithuania', 'Europe'],
  LUX: ['卢森堡', 'Luxembourg', 'Europe'],
  LVA: ['拉脱维亚', 'Latvia', 'Europe'],
  MAC: ['中国澳门', 'Macao', 'Asia'],
  MAF: ['法属圣马丁', 'Saint Martin (French part)', 'North America'],
  MAR: ['摩洛哥', 'Morocco', 'Africa'],
  MCO: ['摩纳哥', 'Monaco', 'Europe'],
  MDA: ['摩尔多瓦', 'Moldova', 'Europe'],
  MDG: ['马达加斯加', 'Madagascar', 'Africa'],
  MDV: ['马尔代夫', 'Maldives', 'Asia'],
  MEX: ['墨西哥', 'Mexico', 'North America'],
  MHL: ['马绍尔群岛', 'Marshall Islands', 'Oceania'],
  MKD: ['北马其顿', 'North Macedonia', 'Europe'],
  MLI: ['马里', 'Mali', 'Africa'],
  MLT: ['马耳他', 'Malta', 'Europe'],
  MMR: ['缅甸', 'Myanmar', 'Asia'],
  MNE: ['黑山', 'Montenegro', 'Europe'],
  MNG: ['蒙古', 'Mongolia', 'Asia'],
  MNP: ['北马里亚纳群岛', 'Northern Mariana Islands', 'Oceania'],
  MOZ: ['莫桑比克', 'Mozambique', 'Africa'],
  MRT: ['毛里塔尼亚', 'Mauritania', 'Africa'],
  MSR: ['蒙特塞拉特', 'Montserrat', 'North America'],
  MTQ: ['马提尼克', 'Martinique', 'North America'],
  MUS: ['毛里求斯', 'Mauritius', 'Africa'],
  MWI: ['马拉维', 'Malawi', 'Africa'],
  MYS: ['马来西亚', 'Malaysia', 'Asia'],
  MYT: ['马约特', 'Mayotte', 'Africa'],
  NAM: ['纳米比亚', 'Namibia', 'Africa'],
  NCL: ['新喀里多尼亚', 'New Caledonia', 'Oceania'],
  NER: ['尼日尔', 'Niger', 'Africa'],
  NGA: ['尼日利亚', 'Nigeria', 'Africa'],
  NIC: ['尼加拉瓜', 'Nicaragua', 'North America'],
  NIU: ['纽埃', 'Niue', 'Oceania'],
  NLD: ['荷兰', 'Netherlands', 'Europe'],
  NOR: ['挪威', 'Norway', 'Europe'],
  NPL: ['尼泊尔', 'Nepal', 'Asia'],
  NRU: ['瑙鲁', 'Nauru', 'Oceania'],
  NZL: ['新西兰', 'New Zealand', 'Oceania'],
  OMN: ['阿曼', 'Oman', 'Asia'],
  PAK: ['巴基斯坦', 'Pakistan', 'Asia'],
  PAN: ['巴拿马', 'Panama', 'North America'],
  PER: ['秘鲁', 'Peru', 'South America'],
  PHL: ['菲律宾', 'Philippines', 'Asia'],
  PLW: ['帕劳', 'Palau', 'Oceania'],
  PNG: ['巴布亚新几内亚', 'Papua New Guinea', 'Oceania'],
  POL: ['波兰', 'Poland', 'Europe'],
  PRI: ['波多黎各', 'Puerto Rico', 'North America'],
  PRK: ['朝鲜', 'North Korea', 'Asia'],
  PRT: ['葡萄牙', 'Portugal', 'Europe'],
  PRY: ['巴拉圭', 'Paraguay', 'South America'],
  PSE: ['巴勒斯坦', 'Palestine', 'Asia'],
  PYF: ['法属波利尼西亚', 'French Polynesia', 'Oceania'],
  QAT: ['卡塔尔', 'Qatar', 'Asia'],
  REU: ['留尼汪', 'Reunion', 'Africa'],
  ROU: ['罗马尼亚', 'Romania', 'Europe'],
  RUS: ['俄罗斯', 'Russia', 'Europe'],
  RWA: ['卢旺达', 'Rwanda', 'Africa'],
  SAU: ['沙特阿拉伯', 'Saudi Arabia', 'Asia'],
  SDN: ['苏丹', 'Sudan', 'Africa'],
  SEN: ['塞内加尔', 'Senegal', 'Africa'],
  SGP: ['新加坡', 'Singapore', 'Asia'],
  SHN: ['圣赫勒拿', 'Saint Helena', 'Africa'],
  SJM: ['斯瓦尔巴和扬马延', 'Svalbard and Jan Mayen', 'Europe'],
  SLB: ['所罗门群岛', 'Solomon Islands', 'Oceania'],
  SLE: ['塞拉利昂', 'Sierra Leone', 'Africa'],
  SLV: ['萨尔瓦多', 'El Salvador', 'North America'],
  SMR: ['圣马力诺', 'San Marino', 'Europe'],
  SOM: ['索马里', 'Somalia', 'Africa'],
  SPM: ['圣皮埃尔和密克隆', 'Saint Pierre and Miquelon', 'North America'],
  SRB: ['塞尔维亚', 'Serbia', 'Europe'],
  SSD: ['南苏丹', 'South Sudan', 'Africa'],
  STP: ['圣多美和普林西比', 'Sao Tome and Principe', 'Africa'],
  SUR: ['苏里南', 'Suriname', 'South America'],
  SVK: ['斯洛伐克', 'Slovakia', 'Europe'],
  SVN: ['斯洛文尼亚', 'Slovenia', 'Europe'],
  SWE: ['瑞典', 'Sweden', 'Europe'],
  SWZ: ['斯威士兰', 'Eswatini', 'Africa'],
  SXM: ['荷属圣马丁', 'Sint Maarten (Dutch part)', 'North America'],
  SYC: ['塞舌尔', 'Seychelles', 'Africa'],
  SYR: ['叙利亚', 'Syria', 'Asia'],
  TCA: ['特克斯和凯科斯群岛', 'Turks and Caicos Islands', 'North America'],
  TCD: ['乍得', 'Chad', 'Africa'],
  TGO: ['多哥', 'Togo', 'Africa'],
  THA: ['泰国', 'Thailand', 'Asia'],
  TJK: ['塔吉克斯坦', 'Tajikistan', 'Asia'],
  TKL: ['托克劳', 'Tokelau', 'Oceania'],
  TKM: ['土库曼斯坦', 'Turkmenistan', 'Asia'],
  TLS: ['东帝汶', 'East Timor', 'Asia'],
  TON: ['汤加', 'Tonga', 'Oceania'],
  TTO: ['特立尼达和多巴哥', 'Trinidad and Tobago', 'North America'],
  TUN: ['突尼斯', 'Tunisia', 'Africa'],
  TUR: ['土耳其', 'Turkey', 'Asia'],
  TUV: ['图瓦卢', 'Tuvalu', 'Oceania'],
  TWN: ['台湾', 'Taiwan', 'Asia'],
  TZA: ['坦桑尼亚', 'Tanzania', 'Africa'],
  UGA: ['乌干达', 'Uganda', 'Africa'],
  UKR: ['乌克兰', 'Ukraine', 'Europe'],
  URY: ['乌拉圭', 'Uruguay', 'South America'],
  USA: ['美国', 'United States', 'North America'],
  UZB: ['乌兹别克斯坦', 'Uzbekistan', 'Asia'],
  VAT: ['梵蒂冈', 'Vatican', 'Europe'],
  VCT: ['圣文森特和格林纳丁斯', 'Saint Vincent and the Grenadines', 'North America'],
  VEN: ['委内瑞拉', 'Venezuela', 'South America'],
  VGB: ['英属维尔京群岛', 'British Virgin Islands', 'North America'],
  VIR: ['美属维尔京群岛', 'United States Virgin Islands', 'North America'],
  VNM: ['越南', 'Vietnam', 'Asia'],
  VUT: ['瓦努阿图', 'Vanuatu', 'Oceania'],
  WLF: ['瓦利斯和富图纳', 'Wallis and Futuna', 'Oceania'],
  WSM: ['萨摩亚', 'Samoa', 'Oceania'],
  YEM: ['也门', 'Yemen', 'Asia'],
  ZAF: ['南非', 'South Africa', 'Africa'],
  ZMB: ['赞比亚', 'Zambia', 'Africa'],
  ZWE: ['津巴布韦', 'Zimbabwe', 'Africa'],
};

/** 去掉首尾空白并转大写，让 ' chn ' / 'chn' 都能查到 */
function normalize(iso3) {
  if (typeof iso3 !== 'string') return null;
  const key = iso3.trim().toUpperCase();
  return key === '' ? null : key;
}

/**
 * 查中文名；未知代码返回 null。
 * @param {string} iso3
 * @returns {string|null}
 */
export function nameOf(iso3) {
  const key = normalize(iso3);
  if (!key) return null;
  const row = TABLE[key];
  return row ? row[0] : null;
}

/**
 * 查英文名；未知代码返回 null。
 * @param {string} iso3
 * @returns {string|null}
 */
export function nameEnOf(iso3) {
  const key = normalize(iso3);
  if (!key) return null;
  const row = TABLE[key];
  return row ? row[1] : null;
}

/**
 * 查所属大洲；未知代码返回 null（构建脚本不会因为陌生代码崩溃）。
 * @param {string} iso3
 * @returns {'Africa'|'Asia'|'Europe'|'North America'|'South America'|'Oceania'|null}
 */
export function regionOf(iso3) {
  const key = normalize(iso3);
  if (!key) return null;
  const row = TABLE[key];
  return row ? row[2] : null;
}

/** 表里一共收录了多少个 ISO3 代码（自检用） */
export const NAME_COUNT = Object.keys(TABLE).length;
