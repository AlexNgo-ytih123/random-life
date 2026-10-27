import { DECISION_CONTENT } from './decision-content.js';
import { newPersonName } from './demographics.js';

// Static browser-native effects; no PowerShell interpreter or dynamic code.
const EFFECTS = {
  "temper/curious": (state, ctx) => {
    state.stats.smarts += 5
          state.stats.happiness += 2
          return ctx.t({"ja":"身の回りの小さな不思議に夢中になり、静かに何時間も観察しました。","en":"You spent hours quietly fascinated by the small wonders of the world.","zh":"你静静地观察了好几个小时，沉醉于身边的小小奇迹。"});
  },
  "temper/active": (state, ctx) => {
    state.stats.health += 6
          return ctx.t({"ja":"軽やかな足で近所じゅうを元気に探検しました。","en":"Your quick legs carried you excitedly all around the neighborhood.","zh":"你迈着轻快的步子，兴奋地探索街坊的每个角落。"});
  },
  "temper/empathetic": (state, ctx) => {
    state.stats.social += 6
          state.stats.happiness += 4
          return ctx.t({"ja":"幼いころから周りの人に温かさと思いやりを示しました。","en":"You showed innate warmth and kindness to those around you from a tender age.","zh":"你从小就展现出对他人的温暖和体贴。"});
  },
  "temper/resilient": (state, ctx) => {
    state.stats.health += 3
          state.stats.smarts += 3
          return ctx.t({"ja":"くじけずに立ち直る力が、あなたの持ち味になりました。","en":"Undaunted resilience became a hallmark of your growing spirit.","zh":"不屈不挠的精神逐渐成为你的特点。"});
  },
  "school1/plea_school": (state, ctx) => {
    const successRate = state.q >= 2 ? 0.95 : 0.65;
          if (ctx.chance(successRate)) {
            state.stats.educationLevel = 1
            state.stats.smarts += 10
            state.job = 'Học sinh tiểu học'
            state.jobId = 'student_prim'
            return ctx.t({"ja":"両親が本代を切り詰めて用意し、胸を張って1年生になりました！","en":"Your parents scrimped and saved for books, and you started first grade with pride!","zh":"父母省吃俭用买齐课本，你自豪地成为一年级学生！"});
          } else {
            state.stats.social += 5
            state.job = 'Phụ giúp gia đình'
            return ctx.t({"ja":"学費を払えず家を手伝うことになりましたが、できる限り独学を続けました。","en":"School fees were out of reach; you stayed home helping the family while teaching yourself what you could.","zh":"家里负担不起学费，你留在家中帮忙，同时尽力自学。"});
          }
  },
  "school1/help_family": (state, ctx) => {
    state.stats.social += 6
          state.stats.wealth += 50
          state.job = 'Lao động phụ việc'
          return ctx.t({"ja":"苦しい家計を支える、頼りになる家族の一員になりました。","en":"You became a cherished extra pair of helping hands for your struggling family.","zh":"你成为家里可靠的帮手，为艰难的生活分担压力。"});
  },
  "school2/middle_school": (state, ctx) => {
    state.stats.educationLevel = 2
          state.stats.smarts += 12
          state.job = 'Học sinh cấp hai'
          state.jobId = 'student_sec'
          return ctx.t({"ja":"文学や数学、理科を学ぶことに胸をふくらませて中学校に入りました！","en":"You stepped into middle school, eager to explore literature, mathematics, and science!","zh":"你满怀期待地进入初中，探索文学、数学和科学！"});
  },
  "school2/apprenticeship": (state, ctx) => {
    state.stats.wealth += 200
          state.stats.social += 5
          state.job = 'Học nghề thợ sửa chữa'
          state.jobId = 'apprentice'
          return ctx.t({"ja":"熟練職人の弟子となり、一生役立つ技術を身につけました。","en":"You apprenticed under a master craftsman, gaining practical skills that will last a lifetime.","zh":"你跟随老师傅学艺，掌握了终身受用的实用技能。"});
  },
  "school3/high_school": (state, ctx) => {
    state.stats.educationLevel = 3
          state.stats.smarts += 15
          state.job = 'Học sinh cấp ba'
          state.jobId = 'student_high'
          return ctx.t({"ja":"大学入試を目指し、夜遅くまで勉強する高校生活を始めました。","en":"You embarked on demanding high school years, studying late into the evening for college exams.","zh":"你开始了紧张的高中生活，为大学入学考试学习到深夜。"});
  },
  "school3/vocational": (state, ctx) => {
    state.stats.educationLevel = 2.5
          state.stats.wealth += 400
          state.job = 'Kỹ thuật viên thực tập'
          state.jobId = 'technician_trainee'
          return ctx.t({"ja":"需要の高い技術を習得し、有望な実習先を見つけました。","en":"You mastered sought-after technical skills and secured a promising internship.","zh":"你掌握了市场需要的技术，获得了一份前景不错的实习。"});
  },
  "school3/workforce": (state, ctx) => {
    state.stats.wealth += 800
          state.job = 'Công nhân / Nhân viên bán hàng'
          state.jobId = 'worker'
          return ctx.t({"ja":"初めての給料を両親に渡し、家計を支えることに誇りを感じました。","en":"You took immense pride in handing your first monthly paycheck to help support your parents.","zh":"你把第一份工资交给父母，能为家庭出力让你十分自豪。"});
  },
  "college/go_uni": (state, ctx) => {
    state.stats.educationLevel = 4
          state.stats.smarts += 20
          state.job = 'Sinh viên Đại học'
          state.jobId = 'student_uni'
          return ctx.t({"ja":"合格通知を手に、希望と意欲に満ちて大学の門をくぐりました！","en":"With your acceptance letter in hand, you stepped onto campus full of ambition and hope!","zh":"你手握录取通知书，带着雄心与希望踏入校园！"});
  },
  "college/start_job": (state, ctx) => {
    state.stats.wealth += 1500
          state.job = 'Nhân viên văn phòng'
          state.jobId = 'office_worker'
          return ctx.t({"ja":"職場に素早くなじみ、経済的な安定を築き始めました。","en":"You adapted swiftly to workplace dynamics and began building financial stability.","zh":"你很快适应了职场，开始建立稳定的经济基础。"});
  },
  "college/travel_abroad": (state, ctx) => {
    state.stats.wealth += 2500
          state.stats.smarts += 10
          state.flags.abroad = true
          return ctx.t({"ja":"異国で働き、故郷の家族へ仕送りを送りました。","en":"You arrived in a foreign country, sending back generous remittances to your family back home.","zh":"你来到异国工作，将收入寄回家中，支持家人。"});
  },
  "love/marry": (state, ctx) => {
    state.family.partner = { name: newPersonName(ctx, state.country.id, state.sex === 'M' ? 'F' : 'M').full, alive: true }
          state.stats.happiness += 15
          return ctx.t({"ja":"晴れた結婚式の日、大切な人たちに囲まれて誓いを交わしました。","en":"Surrounded by loved ones, you exchanged heartfelt vows on a sunlit wedding day.","zh":"在阳光明媚的婚礼上，你们在亲友的见证下交换真挚的誓言。"});
  },
  "love/focus_career": (state, ctx) => {
    state.stats.wealth += 3000
          state.stats.smarts += 5
          return ctx.t({"ja":"努力が実り、昇進と経済的自立を手にしました。","en":"Your dedication yielded rapid promotions and financial independence.","zh":"专注与努力带来了迅速的晋升和经济独立。"});
  },
  "midlife/buy_home": (state, ctx) => {
    state.stats.happiness += 12
          state.flags.ownsHome = true
          return ctx.t({"ja":"自分の家の鍵を初めて回したとき、大きな達成感に包まれました。","en":"Turning the key to your own front door brought an overwhelming sense of accomplishment.","zh":"第一次转动自家大门的钥匙时，巨大的成就感涌上心头。"});
  },
  "midlife/start_biz": (state, ctx) => {
    if (ctx.chance(0.65)) {
            state.stats.wealth += 8000
            state.stats.happiness += 10
            state.job = 'Chủ doanh nghiệp'
            return ctx.t({"ja":"事業が市場の需要に合い、期待以上の成功を収めました！","en":"Your venture struck market demand and prospered beyond your fondest hopes!","zh":"你的事业恰好满足市场需求，取得了超出预期的成功！"});
          } else {
            state.stats.wealth = Math.max(0, state.stats.wealth - 2000)
            state.stats.happiness -= 5
            return ctx.t({"ja":"厳しい景気で事業は苦戦しましたが、粘り強さを学びました。","en":"A difficult economic climate tested your business, imparting invaluable resilience.","zh":"艰难的经济环境考验着你的生意，也让你学会了坚持。"});
          }
  },
  "mcrisis/reconnect": (state, ctx) => {
    state.stats.happiness += 10
          state.stats.social += 10
          return ctx.t({"ja":"率直な会話で距離が縮まり、家庭に温かさと理解が戻りました。","en":"Heartfelt talks dissolved the quiet distance; warmth and mutual understanding returned to your home.","zh":"坦诚的交谈消除了隔阂，温暖与理解重新回到家中。"});
  },
  "mcrisis/new_passion": (state, ctx) => {
    state.stats.smarts += 8
          state.stats.happiness += 8
          return ctx.t({"ja":"創作に打ち込み、生きる意欲がよみがえりました。","en":"Immersing yourself in a creative calling sparked a renewed zest for life.","zh":"沉浸于创作中，你重新燃起了生活的热情。"});
  },
  "mcrisis/focus_work": (state, ctx) => {
    state.stats.wealth += 3500
          state.stats.happiness = Math.max(10, state.stats.happiness - 3)
          return ctx.t({"ja":"仕事の収入は最高潮に達し、疲れながらも暮らしの安心を得ました。","en":"Your career peaked financially, providing security even through moments of fatigue.","zh":"职业收入达到高峰，虽然疲惫，却为生活提供了保障。"});
  },
  "retire/enjoy_leisure": (state, ctx) => {
    state.job = 'Nghỉ hưu an nhàn'
          state.stats.happiness += 15
          state.stats.health += 5
          return ctx.t({"ja":"目覚ましのない穏やかな朝と、家族の笑い声を楽しみました。","en":"You savored calm mornings without alarms and warm moments with loved ones.","zh":"你享受着没有闹钟的宁静清晨，以及家人温暖的笑声。"});
  },
  "retire/mentor_part": (state, ctx) => {
    state.stats.wealth += 1500
          state.stats.smarts += 5
          state.stats.social += 5
          return ctx.t({"ja":"長年の知恵と落ち着いた助言が、若い仲間に喜ばれました。","en":"Younger peers deeply valued your decades of wisdom and steady guidance.","zh":"年轻同事十分珍惜你多年的经验和沉稳的指导。"});
  },
  "oldhome/live_with_kids": (state, ctx) => {
    state.stats.happiness += 16
          state.stats.social += 12
          return ctx.t({"ja":"親しい人たちと助け合い、日々の暮らしに喜びを感じました。","en":"Living close to loved ones brought daily cheer and caring support.","zh":"与亲近的人相互照应，日常生活充满了喜悦与关怀。"});
  },
  "oldhome/own_home_stay": (state, ctx) => {
    state.stats.happiness += 8
          return ctx.t({"ja":"なじみの街で、穏やかないつもの暮らしを守りました。","en":"You kept your tranquil daily routine in the sanctuary of your familiar neighborhood.","zh":"你在熟悉的社区里，保持着宁静的日常生活。"});
  },
  "service/serve_proudly": (state, ctx) => {
    state.stats.health += 10
          state.stats.social += 8
          state.flags.served = true
          return ctx.t({"ja":"厳しい訓練で忍耐力が育ち、一生の仲間を得ました。","en":"Rigorous military training forged resilience and lifelong bonds of brotherhood.","zh":"严格的军事训练磨炼了韧性，也结下了终身的友谊。"});
  },
  "service/civil_service": (state, ctx) => {
    state.stats.smarts += 6
          state.stats.social += 8
          return ctx.t({"ja":"福祉の現場で働き、人々の苦労への理解を深めました。","en":"Serving at community welfare centers gave you profound empathy for human struggles.","zh":"社区福利中心的服务经历让你更理解人们的艰难处境。"});
  },
  "jobhunt/office_career": (state, ctx) => {
    state.job = 'Chuyên viên văn phòng'
          state.jobId = 'clerk'
          state.stats.smarts += 6
          state.stats.wealth += 200
          return ctx.t({"ja":"事務の仕事に就き、活気ある職場になじみました。","en":"You secured an office role and adapted quickly to the energetic pace of professional life.","zh":"你获得了一份办公室工作，很快适应了忙碌的职场节奏。"});
  },
  "jobhunt/skilled_craft": (state, ctx) => {
    state.job = 'Kỹ thuật viên lành nghề'
          state.jobId = 'mechanic'
          state.stats.health += 6
          state.stats.wealth += 250
          return ctx.t({"ja":"こつこつと腕を磨き、その仕事ぶりが信頼を集めました。","en":"Through tireless hands-on dedication, your craftsmanship won widespread trust.","zh":"凭着不懈的实践和努力，你的手艺赢得了大家的信任。"});
  },
  "migx/go_abroad": (state, ctx) => {
    state.stats.wealth += 1500
          state.stats.smarts += 8
          state.stats.happiness -= 4
          state.flags.workedAbroad = true
          return ctx.t({"ja":"初めのホームシックを乗り越え、家族の暮らしを変える仕送りを続けました。","en":"Overcoming early homesickness, you steadily sent life-changing savings back home.","zh":"你克服最初的思乡之苦，持续寄钱回家，改善了家人的生活。"});
  },
  "migx/stay_home": (state, ctx) => {
    state.stats.happiness += 10
          state.stats.social += 8
          return ctx.t({"ja":"家族との温かい夕食が、心の支えになりました。","en":"Warm dinners with family kept your spirit anchored and deeply comforted.","zh":"与家人共进的温暖晚餐，给了你深深的安慰。"});
  },
  "biz/start_business": (state, ctx) => {
    const success = ctx.chance(0.65);
          state.stats.smarts += 10
          if (success) {
            state.job = 'Chủ doanh nghiệp nhỏ'
            state.jobId = 'owner'
            state.stats.wealth += 1200
            state.stats.happiness += 8
            return ctx.t({"ja":"粘り強い努力が実り、店は地域に愛される存在になりました！","en":"Through tireless grit, your shop flourished into a thriving neighborhood staple!","zh":"凭着不懈的努力，你的小店成为街坊喜爱的店铺！"});
          } else {
            state.stats.wealth = Math.max(0, state.stats.wealth - 300)
            return ctx.t({"ja":"景気悪化で店は苦戦しましたが、商売を続ける力を学びました。","en":"Market downturns tested your shop, but the ordeal taught you invaluable business grit.","zh":"市场低迷考验着你的小店，也教会了你经营中的坚韧。"});
          }
  },
  "biz/keep_stable": (state, ctx) => {
    state.stats.happiness += 6
          state.stats.wealth += 400
          return ctx.t({"ja":"安定した給料が、自分と家族に安心をもたらしました。","en":"Steady salary brought dependable security for you and your loved ones.","zh":"稳定的工资为你和家人带来了可靠的保障。"});
  },
  "lifestyle/healthy_change": (state, ctx) => {
    state.stats.health = Math.min(100, state.stats.health + 12)
          state.stats.happiness += 6
          return ctx.t({"ja":"体が軽くなり、毎朝を前向きに迎えられるようになりました。","en":"Your body felt refreshed and light; newfound vitality fueled each morning with optimism.","zh":"身体轻松了许多，新的活力让你每天都充满期待。"});
  },
  "lifestyle/work_focus": (state, ctx) => {
    state.stats.wealth += 500
          state.stats.health = Math.max(10, state.stats.health - 6)
          return ctx.t({"ja":"収入は増えましたが、眠れない夜が続いて体に負担がかかりました。","en":"Earnings mounted, but weary sleepless nights began taking a noticeable toll on your body.","zh":"收入增加了，但疲惫和失眠开始明显损害你的身体。"});
  },
  "eldercare/care_at_home": (state, ctx) => {
    state.stats.happiness += 14
          state.stats.social += 12
          return ctx.t({"ja":"体は疲れても、両親の穏やかな笑顔が何よりの慰めになりました。","en":"Though physically wearying, seeing your parents' peaceful smiles brought boundless solace.","zh":"虽然身体劳累，父母安宁的笑容却带来无尽的慰藉。"});
  },
  "eldercare/medical_aid": (state, ctx) => {
    state.stats.wealth = Math.max(0, state.stats.wealth - 400)
          state.stats.social += 6
          return ctx.t({"ja":"専門家の支えで両親の苦痛が和らぎ、仕事も続けられました。","en":"Professional medical care alleviated their suffering while keeping your career afloat.","zh":"专业照护减轻了父母的痛苦，也让你能够继续工作。"});
  },
  "legacy/mentor_youth": (state, ctx) => {
    state.stats.happiness += 16
          state.stats.social += 14
          return ctx.t({"ja":"あなたの親切と穏やかな助言が、悩める若者たちを支えました。","en":"Neighbors cherished your kindness; your gentle counsel guided many struggling youths.","zh":"邻里珍惜你的善意，温和的建议帮助了许多迷茫的年轻人。"});
  },
  "legacy/leisure_travel": (state, ctx) => {
    state.stats.health = Math.min(100, state.stats.health + 8)
          state.stats.happiness += 12
          return ctx.t({"ja":"花の香りとゆったりした散歩が、心に安らぎをもたらしました。","en":"Fragrant flowerbeds and leisurely strolls bathed your spirit in tranquil joy.","zh":"芬芳的花园和悠闲的散步，让你的心灵充满宁静的喜悦。"});
  },
  "will/family_harmony": (state, ctx) => {
    state.stats.happiness += 20
          return ctx.t({"ja":"大切な人々の愛に包まれ、心からの安らぎを感じました。","en":"Surrounded by the love of people dear to you, you felt total peace in your heart.","zh":"被亲人的爱包围着，你的心中充满安宁。"});
  },
  "will/donate_cause": (state, ctx) => {
    state.stats.happiness += 22
          state.stats.social += 15
          return ctx.t({"ja":"あなたが学びの機会を与えた子どもたちの心に、その名が残りました。","en":"Your name lived on in the bright eyes of schoolchildren whose futures you illuminated.","zh":"你帮助照亮了孩子们的未来，他们会一直记得你的名字。"});
  }
};

export const DECISIONS = Object.fromEntries(Object.entries(DECISION_CONTENT).map(([id, decision]) => [id, {
  ...decision, choices: decision.choices.map(choice => ({...choice, apply: EFFECTS[id + '/' + choice.id]}))
}]));

// Scheduling flags are set by the simulation when the returned decision is queued.
export function getDecisionForAge(ctx, state, age) {
  return Object.values(DECISIONS).find(d => d.age === age && !state.flags?.['dec_' + d.id]) ?? null;
}
