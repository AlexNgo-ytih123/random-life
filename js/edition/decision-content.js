// Original localized content from the MIT-licensed PowerShell edition.
export const DECISION_CONTENT = {
  "temper": {
    "fact": {
      "ja": "気質には遺伝と幼少期の経験が影響します。双生児研究では性格の違いの約40%が遺伝によるとされています（Vukasović・Bratko 2015）。",
      "zh": "气质受遗传和早期经历共同影响。双胞胎研究显示，性格差异约有40%来自遗传（Vukasović、Bratko，2015）。",
      "en": "Temperament is shaped both by genetics and early experience. Twin studies show about 40% of personality variance is hereditary (Vukasović & Bratko 2015)."
    },
    "id": "temper",
    "choices": [
      {
        "label": {
          "ja": "小石や葉、小さな虫をじっと観察する",
          "zh": "好奇地观察石子、树叶和小虫",
          "en": "Sit and examine pebbles, leaves, and tiny insects with intense curiosity"
        },
        "id": "curious",
        "sub": {
          "ja": "知性 +5、幸福 +2",
          "zh": "智力 +5，幸福 +2",
          "en": "Smarts +5, Happiness +2"
        }
      },
      {
        "label": {
          "ja": "音や動物、動くものに向かって走る",
          "zh": "全力奔向声音、动物和会动的东西",
          "en": "Run with all your might toward sounds, animals, and moving things"
        },
        "id": "active",
        "sub": {
          "ja": "健康 +6、活発な気質",
          "zh": "健康 +6，充满活力",
          "en": "Health +6, Energetic"
        }
      },
      {
        "label": {
          "ja": "泣いている子に近づき、そっと手を差し出す",
          "zh": "走近哭泣的孩子，轻轻伸出手安慰",
          "en": "Walk over and gently reach out a hand to another crying toddler"
        },
        "id": "empathetic",
        "sub": {
          "ja": "社交 +6、幸福 +4",
          "zh": "社交 +6，幸福 +4",
          "en": "Social +6, Happiness +4"
        }
      },
      {
        "label": {
          "ja": "転んでも泣かずに立ち上がる",
          "zh": "跌倒后不哭，立刻自己站起来",
          "en": "Get straight back up after tumbling down without shedding a tear"
        },
        "id": "resilient",
        "sub": {
          "ja": "忍耐力 +5、健康 +3",
          "zh": "韧性 +5，健康 +3",
          "en": "Resilience +5, Health +3"
        }
      }
    ],
    "title": {
      "ja": "2歳：外の世界へ",
      "zh": "2岁：外面的世界",
      "en": "Two years old, the world outside"
    },
    "age": 2,
    "body": {
      "ja": "しっかり歩けるようになり、音や景色であふれる世界へ踏み出しました。まず何に心をひかれますか？",
      "zh": "你迈着逐渐稳健的步子走向外面，世界充满新奇的声音和景象。什么最先吸引你？",
      "en": "You take your first steady steps outside into a vast world full of sights and sounds. What draws your attention first?"
    }
  },
  "school1": {
    "fact": {
      "ja": "世界の就学予想年数は約13年に伸びましたが（UNDP）、貧困で学べない子は今も数千万人います。",
      "zh": "全球预期受教育年限已接近13年（UNDP），但仍有数千万儿童因贫困失学。",
      "en": "Expected years of schooling globally has risen to nearly 13 years (UNDP), yet tens of millions of children still miss out due to poverty."
    },
    "id": "school1",
    "choices": [
      {
        "label": {
          "ja": "学校に行き、読み書きを学びたいと頼む",
          "zh": "认真请求去学校学习读写",
          "en": "Ask earnestly to go to school and learn to read"
        },
        "id": "plea_school",
        "sub": {
          "ja": "知性 +10、小学校へ",
          "zh": "智力 +10，进入小学",
          "en": "Smarts +10, Enters Primary"
        }
      },
      {
        "label": {
          "ja": "家事、農作業、家業を手伝う",
          "zh": "留在家里帮忙做家务、务农或经营",
          "en": "Stay home to help with chores, farm work, or family trade"
        },
        "id": "help_family",
        "sub": {
          "ja": "社交 +6、家計に少し貢献",
          "zh": "社交 +6，少量家庭收入",
          "en": "Social +6, Small family income"
        }
      }
    ],
    "title": {
      "ja": "6歳：学校への道",
      "zh": "6岁：上学之路",
      "en": "Age 6: The path to school"
    },
    "age": 6,
    "body": {
      "ja": "小学校に入る年です。多くの子が通学を始めますが、貧しい地域では学費や家の仕事が壁になります。",
      "zh": "到了读一年级的年纪。许多同龄人开始上学，但在贫困地区，学费和家务会占去孩子的一天。",
      "en": "It is time for first grade. Many children your age start school, but in poorer communities, school fees and family chores compete for a child's day."
    }
  },
  "school2": {
    "fact": {
      "ja": "前期中等教育の修了率は、低所得国では約40%、高所得国では95%以上です（UNESCO）。",
      "zh": "低收入国家的初中完成率约为40%，高收入国家则超过95%（UNESCO）。",
      "en": "In low-income nations, lower-secondary completion rates hover around 40%, compared to 95%+ in high-income countries (UNESCO)."
    },
    "id": "school2",
    "choices": [
      {
        "label": {
          "ja": "中学校に進み、勉学に励む",
          "zh": "继续读初中，勤奋学习",
          "en": "Continue onto middle school with diligence"
        },
        "id": "middle_school",
        "sub": {
          "ja": "知性 +12、中学校へ",
          "zh": "智力 +12，进入初中",
          "en": "Smarts +12, Enters Middle School"
        }
      },
      {
        "label": {
          "ja": "商売や修理など、実用的な技術を学ぶ",
          "zh": "学习手艺、维修或经商技能",
          "en": "Learn a practical trade, mechanic skills, or commerce"
        },
        "id": "apprenticeship",
        "sub": {
          "ja": "実用技能、資産 +$200",
          "zh": "实用技能，财富 +$200",
          "en": "Practical skill, Wealth +$200"
        }
      }
    ],
    "title": {
      "ja": "12歳：中学進学の分かれ道",
      "zh": "12岁：初中的岔路口",
      "en": "Age 12: Middle school crossroads"
    },
    "age": 12,
    "body": {
      "ja": "小学校を終えました。進学には学費や制服、遠くまで通う手間がかかります。",
      "zh": "小学毕业了。继续读中学需要学费、校服，还可能要走更远的路。",
      "en": "Primary school is behind you. Continuing to secondary education requires tuition, uniforms, and longer travel."
    }
  },
  "school3": {
    "fact": {
      "ja": "中欧の職業訓練制度では若者の失業率が5%未満の一方、多くの地域では20%を超えます。",
      "zh": "中欧的双元制职业培训使青年失业率低于5%，而许多地区的青年失业率超过20%。",
      "en": "Dual vocational training systems keep youth unemployment under 5% in Central Europe, while general youth unemployment exceeds 20% in many regions."
    },
    "id": "school3",
    "choices": [
      {
        "label": {
          "ja": "普通高校へ進み、大学入試を目指す",
          "zh": "就读普通高中，准备大学入学考试",
          "en": "Academic High School (aiming for college entrance)"
        },
        "id": "high_school",
        "sub": {
          "ja": "知性 +15、大学進学の道",
          "zh": "智力 +15，大学升学路线",
          "en": "Smarts +15, University track"
        }
      },
      {
        "label": {
          "ja": "職業学校で現代の実務技能を学ぶ",
          "zh": "就读职业技术学校，学习实用技术",
          "en": "Vocational Technical School (hands-on modern trades)"
        },
        "id": "vocational",
        "sub": {
          "ja": "安定した職、資産 +$400",
          "zh": "工作稳定，财富 +$400",
          "en": "Job stability, Wealth +$400"
        }
      },
      {
        "label": {
          "ja": "工場・商売・販売の仕事を始める",
          "zh": "直接工作，从事工厂、贸易或销售工作",
          "en": "Enter the workforce immediately (factory, trade, sales)"
        },
        "id": "workforce",
        "sub": {
          "ja": "すぐに収入 +$800",
          "zh": "即时收入 +$800",
          "en": "Immediate income +$800"
        }
      }
    ],
    "title": {
      "ja": "15歳：人生の転機",
      "zh": "15岁：人生转折点",
      "en": "Age 15: The turning point"
    },
    "age": 15,
    "body": {
      "ja": "15歳になると、普通高校、職業学校、就職へと、それぞれの道が分かれていきます。",
      "zh": "十五岁，人生道路开始分岔：有人读普通高中，有人读职业学校，也有人直接工作。",
      "en": "At fifteen, paths diverge: some head to academic high schools, others to vocational trade institutes, while many enter the workforce directly."
    }
  },
  "college": {
    "fact": {
      "ja": "世界銀行によると、高等教育を1年長く受けるごとの所得上昇率は世界平均で14%です。",
      "zh": "据世界银行统计，全球每增加一年高等教育，收入平均提高14%。",
      "en": "According to the World Bank, each additional year of tertiary education yields an average income premium of 14% globally."
    },
    "id": "college",
    "choices": [
      {
        "label": {
          "ja": "大学で理工・医学・経営・人文などを学ぶ",
          "zh": "进入大学学习理工、医学、商科或人文",
          "en": "Attend University (STEM, Medicine, Business, Humanities)"
        },
        "id": "go_uni",
        "sub": {
          "ja": "知性 +20、学位取得へ",
          "zh": "智力 +20，学位路线",
          "en": "Smarts +20, Degree pathway"
        }
      },
      {
        "label": {
          "ja": "専門職や事務の仕事を始める",
          "zh": "开始专业工作或办公室职业生涯",
          "en": "Start a professional job / office career"
        },
        "id": "start_job",
        "sub": {
          "ja": "資産 +$1,500、職務経験",
          "zh": "财富 +$1,500，职业经验",
          "en": "Wealth +$1,500, Career experience"
        }
      },
      {
        "label": {
          "ja": "海外での仕事・移住・奨学金を探す",
          "zh": "寻找海外工作、移民或奖学金机会",
          "en": "Seek opportunities abroad (working holiday, migration, scholarship)"
        },
        "id": "travel_abroad",
        "sub": {
          "ja": "国際経験、収入増",
          "zh": "国际经验，更高收入",
          "en": "Global experience, Higher earnings"
        }
      }
    ],
    "title": {
      "ja": "18歳：進学か就職か",
      "zh": "18岁：升学还是就业？",
      "en": "Age 18: Higher Education or Career?"
    },
    "age": 18,
    "body": {
      "ja": "成人の節目、18歳になりました。ここでの選択が、これから何十年にも影響します。",
      "zh": "十八岁，迈入成年的门槛。现在的选择将影响今后几十年的人生。",
      "en": "Eighteen arrives: the legal threshold of adulthood. The choices you make now will ripple through the decades ahead."
    }
  },
  "love": {
    "fact": {
      "ja": "平均初婚年齢は南アジアやアフリカの一部では20代前半、西欧や東アジアでは33歳を超えます。",
      "zh": "平均初婚年龄因地区而异：南亚和非洲部分地区在二十岁出头，西欧和东亚则超过33岁。",
      "en": "The average age at first marriage varies from early twenties in parts of South Asia/Africa to past 33 in Western Europe and East Asia."
    },
    "id": "love",
    "choices": [
      {
        "label": {
          "ja": "結婚式を挙げ、一緒に家庭を築く",
          "zh": "举行婚礼，共同建立家庭",
          "en": "Tie the knot in a joyous ceremony and build a family together"
        },
        "id": "marry",
        "sub": {
          "ja": "幸福 +15、結婚",
          "zh": "幸福 +15，结婚",
          "en": "Happiness +15, Married"
        }
      },
      {
        "label": {
          "ja": "自分の成長、貯蓄、仕事を優先する",
          "zh": "优先考虑个人成长、财务目标和事业",
          "en": "Prioritize personal growth, financial goals, and career momentum"
        },
        "id": "focus_career",
        "sub": {
          "ja": "資産 +$3,000、自立",
          "zh": "财富 +$3,000，独立",
          "en": "Wealth +$3,000, Independence"
        }
      }
    ],
    "title": {
      "ja": "26歳：恋愛と約束",
      "zh": "26岁：爱情与承诺",
      "en": "Age 26: Romance and Commitment"
    },
    "age": 26,
    "body": {
      "ja": "互いに理解し、励まし合える大切な人に出会いました。結婚や二人の未来を考え始めます。",
      "zh": "你遇到了理解你、鼓励你的特别之人，开始考虑婚姻和共同的未来。",
      "en": "You have met someone truly special who understands and inspires you. Thoughts turn toward marriage and shared futures."
    }
  },
  "midlife": {
    "fact": {
      "ja": "世界の70%以上の世帯では住宅が最大の資産であり、起業も世代を超えた上昇のきっかけになります。",
      "zh": "全球超过70%的家庭以住房为最大资产，而创业也能推动代际向上流动。",
      "en": "Home ownership represents the largest asset for over 70% of households globally, while entrepreneurship drives generational upward mobility."
    },
    "id": "midlife",
    "choices": [
      {
        "label": {
          "ja": "家を買い、家族の安定を築く",
          "zh": "购买家庭住房，获得稳定和安心",
          "en": "Purchase a family home for stability and enduring peace of mind"
        },
        "id": "buy_home",
        "sub": {
          "ja": "幸福 +12、持ち家",
          "zh": "幸福 +12，拥有住房",
          "en": "Happiness +12, Homeowner"
        }
      },
      {
        "label": {
          "ja": "自分の事業を立ち上げる",
          "zh": "创立自己的企业或开展创业项目",
          "en": "Found your own enterprise / Launch a business venture"
        },
        "id": "start_biz",
        "sub": {
          "ja": "大きな利益の可能性、起業家へ",
          "zh": "高回报潜力，成为创业者",
          "en": "High potential payoff, Entrepreneur"
        }
      }
    ],
    "title": {
      "ja": "35歳：安定か挑戦か",
      "zh": "35岁：安稳还是冒险？",
      "en": "Age 35: Security or Adventure?"
    },
    "age": 35,
    "body": {
      "ja": "働いて貯めた資金を前に、家計の大きな分かれ道に立っています。",
      "zh": "辛勤工作积攒了一笔钱，你站在家庭财务的重要岔路口。",
      "en": "With hard-earned savings accumulated, you stand at a major financial crossroads for your household."
    }
  },
  "mcrisis": {
    "fact": {
      "ja": "145か国で幸福度のU字型変化が報告されています。40代で底を迎え、その後は上昇する傾向です（Blanchflower・Oswald）。",
      "zh": "145个国家的研究记录了幸福感的U形曲线：四十多岁时较低，之后逐渐回升（Blanchflower、Oswald）。",
      "en": "The human happiness curve is widely documented as U-shaped across 145 countries, bottoming out in the 40s before rising steadily in later life (Blanchflower & Oswald)."
    },
    "id": "mcrisis",
    "choices": [
      {
        "label": {
          "ja": "家族と気持ちを話し合い、一緒の時間を作る",
          "zh": "向家人敞开心扉，安排相处时间",
          "en": "Open up to your family and carve out dedicated time together"
        },
        "id": "reconnect",
        "sub": {
          "ja": "幸福 +10、社交 +10",
          "zh": "幸福 +10，社交 +10",
          "en": "Happiness +10, Social +10"
        }
      },
      {
        "label": {
          "ja": "昔からの趣味や新しい創作に取り組む",
          "zh": "投入心仪已久的爱好，学习新的创作技能",
          "en": "Pursue a long-cherished hobby or learn a new creative craft"
        },
        "id": "new_passion",
        "sub": {
          "ja": "知性 +8、幸福 +8",
          "zh": "智力 +8，幸福 +8",
          "en": "Smarts +8, Happiness +8"
        }
      },
      {
        "label": {
          "ja": "仕事に全力を注ぎ、収入を最大限に伸ばす",
          "zh": "加倍努力工作，追求收入增长",
          "en": "Double down on professional output and maximum income growth"
        },
        "id": "focus_work",
        "sub": {
          "ja": "資産 +$3,500、幸福 -3",
          "zh": "财富 +$3,500，幸福 -3",
          "en": "Wealth +$3,500, Happiness -3"
        }
      }
    ],
    "title": {
      "ja": "42歳：人生の半ばで",
      "zh": "42岁：中年岔路口",
      "en": "Age 42: Midlife Crossroads"
    },
    "age": 42,
    "body": {
      "ja": "仕事と家の責任を背負い続け、疲れを感じています。若いころの夢や、本当に大切なものを考え直します。",
      "zh": "多年承担工作与家庭责任让你身心疲惫。你停下来，思考年轻时的梦想和真正重要的事。",
      "en": "Years of unrelenting duty to work and household have taken their toll. You pause, wondering where the youthful dreams went and what truly matters."
    }
  },
  "retire": {
    "fact": {
      "ja": "寿命が延び、退職後は平均20～25年になります（OECD）。人とのつながりは認知機能の低下リスクを減らします。",
      "zh": "寿命延长使退休生活平均达到20至25年（OECD）。保持社交联系有助于降低认知衰退风险。",
      "en": "Rising life expectancy means retirement now spans 20-25 years on average (OECD). Remaining socially connected reduces cognitive decline risks by 30%."
    },
    "id": "retire",
    "choices": [
      {
        "label": {
          "ja": "退職し、庭仕事や家族との時間を楽しむ",
          "zh": "安稳退休，打理花园，享受家庭时光",
          "en": "Retire peacefully, tend your garden, and enjoy family time"
        },
        "id": "enjoy_leisure",
        "sub": {
          "ja": "幸福 +15、健康 +5",
          "zh": "幸福 +15，健康 +5",
          "en": "Happiness +15, Health +5"
        }
      },
      {
        "label": {
          "ja": "若手の指導役や非常勤の相談役を続ける",
          "zh": "继续担任资深导师或兼职顾问",
          "en": "Stay on as a senior mentor or part-time advisor"
        },
        "id": "mentor_part",
        "sub": {
          "ja": "資産 +$1,500、知性 +5",
          "zh": "财富 +$1,500，智力 +5",
          "en": "Wealth +$1,500, Smarts +5"
        }
      }
    ],
    "title": {
      "ja": "62歳：退職の節目",
      "zh": "62岁：退休的门槛",
      "en": "Age 62: The Retirement Threshold"
    },
    "age": 62,
    "body": {
      "ja": "退職を考える年齢になりました。のんびり過ごしますか、それとも得意な仕事を続けますか？",
      "zh": "到了考虑退休的年纪。你会享受清闲，还是继续在熟悉的领域活跃？",
      "en": "You reach the statutory retirement age recognized in most nations. Will you step back to enjoy tranquil leisure, or keep active in your calling?"
    }
  },
  "oldhome": {
    "fact": {
      "ja": "東アジアでは高齢者の60%以上が子どもと同居または近居し、北欧では充実した介護制度が自立生活を支えています（WHO）。",
      "zh": "东亚超过60%的老人和子女同住或住得很近，而北欧完善的养老体系支持独立生活（WHO）。",
      "en": "Over 60% of elders in East Asia live with or near children, whereas comprehensive eldercare systems in Northern Europe enable independent communal living (WHO)."
    },
    "id": "oldhome",
    "choices": [
      {
        "label": {
          "ja": "親しい人たちのそばで、支え合って暮らす",
          "zh": "搬到亲近的人身边，互相照应",
          "en": "Move closer to loved ones and share everyday support"
        },
        "id": "live_with_kids",
        "sub": {
          "ja": "幸福 +16、社交 +12",
          "zh": "幸福 +16，社交 +12",
          "en": "Happiness +16, Social +12"
        }
      },
      {
        "label": {
          "ja": "住み慣れた家で、自立した暮らしを続ける",
          "zh": "留在熟悉的家中，保持独立生活",
          "en": "Remain in your longtime home with cherished independence"
        },
        "id": "own_home_stay",
        "sub": {
          "ja": "安心、幸福 +8",
          "zh": "安心，幸福 +8",
          "en": "Peace of mind, Happiness +8"
        }
      }
    ],
    "title": {
      "ja": "74歳：穏やかな暮らしの場",
      "zh": "74岁：安享晚年的居所",
      "en": "Age 74: The Golden Years Sanctuary"
    },
    "age": 74,
    "body": {
      "ja": "70代になり、体の動きもゆっくりになりました。これからの暮らしと支えをどう整えるか考えます。",
      "zh": "进入七十多岁，行动逐渐缓慢。你开始考虑如何安排今后的生活与照护。",
      "en": "Into your seventies, physical agility gently recedes. You consider how best to arrange your daily living and care for the peaceful years ahead."
    }
  },
  "service": {
    "fact": {
      "ja": "韓国、イスラエル、シンガポール、スイス、ベトナムなど約30か国で、12～36か月の徴兵制があります。",
      "zh": "韩国、以色列、新加坡、瑞士、越南等约30个国家实行义务兵役制，期限为12至36个月。",
      "en": "About 30 nations worldwide enforce mandatory military service (such as South Korea, Israel, Singapore, Switzerland, Vietnam), spanning 12 to 36 months."
    },
    "id": "service",
    "choices": [
      {
        "label": {
          "ja": "兵役に就き、規律を身につける",
          "zh": "参军服役，磨炼纪律",
          "en": "Enlist in military service to forge iron discipline"
        },
        "id": "serve_proudly",
        "sub": {
          "ja": "健康 +10、仲間との絆 +8",
          "zh": "健康 +10，战友情 +8",
          "en": "Health +10, Comradeship +8"
        }
      },
      {
        "label": {
          "ja": "地域の福祉やボランティアに参加する",
          "zh": "参与社区服务和志愿活动",
          "en": "Engage in community civil service and volunteer missions"
        },
        "id": "civil_service",
        "sub": {
          "ja": "知性 +6、社交 +8",
          "zh": "智力 +6，社交 +8",
          "en": "Smarts +6, Social +8"
        }
      }
    ],
    "title": {
      "ja": "19歳：社会への奉仕",
      "zh": "19岁：服役与公民责任",
      "en": "Age 19: National Service & Civic Duty"
    },
    "age": 19,
    "body": {
      "ja": "大人になり、兵役や地域への奉仕を考える時が来ました。どのように社会に貢献しますか？",
      "zh": "成年后，服兵役或参与社区服务的机会到来。你会如何为社会出力？",
      "en": "Reaching young adulthood, the call to national military service or civil community contribution arrives. How do you choose to serve your society?"
    }
  },
  "jobhunt": {
    "fact": {
      "ja": "世界の若者（15～24歳）の失業率は約13%で、成人の約3倍です（ILO 2024）。仕事の足場を得ることが大切な節目です。",
      "zh": "全球15至24岁青年的失业率约为13%，是成年人的三倍（ILO，2024）。找到职业立足点是重要的一步。",
      "en": "Global youth unemployment (ages 15-24) sits around 13%, three times that of older adults (ILO 2024). Landing a career foothold is a pivotal milestone."
    },
    "id": "jobhunt",
    "choices": [
      {
        "label": {
          "ja": "企業の事務職や公務員を目指す",
          "zh": "争取公司办公室或公务员职位",
          "en": "Pursue professional employment in corporate offices or civil service"
        },
        "id": "office_career",
        "sub": {
          "ja": "安定収入、知性 +6",
          "zh": "稳定收入，智力 +6",
          "en": "Stable income, Smarts +6"
        }
      },
      {
        "label": {
          "ja": "専門技術や職人の技能を磨く",
          "zh": "掌握专业技术或实用手艺",
          "en": "Master a skilled technical trade or practical craftsmanship"
        },
        "id": "skilled_craft",
        "sub": {
          "ja": "健康 +6、堅実な技能収入",
          "zh": "健康 +6，稳定的技术收入",
          "en": "Health +6, Solid trade earnings"
        }
      }
    ],
    "title": {
      "ja": "22歳：社会への一歩",
      "zh": "22岁：步入社会",
      "en": "Age 22: Stepping into the World"
    },
    "age": 22,
    "body": {
      "ja": "学校を離れ、仕事を選ぶ時が来ました。若い力をどこに注ぎますか？",
      "zh": "离开学校后，你站在职业选择的路口。你会把年轻的热情投入哪里？",
      "en": "Leaving formal education behind, you stand before life's occupational crossroads. Where will you invest your youthful drive?"
    }
  },
  "migx": {
    "fact": {
      "ja": "国際移民は世界で2億8千万人以上（UN DESA）、家族への年間送金は6,500億ドル以上です（世界銀行）。",
      "zh": "全球有超过2.8亿国际移民（UN DESA），每年向家人汇款超过6500亿美元（世界银行）。",
      "en": "Over 280 million people live as international migrants worldwide (UN DESA), sending over $650 billion in remittances to families annually (World Bank)."
    },
    "id": "migx",
    "choices": [
      {
        "label": {
          "ja": "海外で働き、家族に仕送りする",
          "zh": "出国工作，向家人汇款",
          "en": "Venture abroad to work and send remittances back to your family"
        },
        "id": "go_abroad",
        "sub": {
          "ja": "資産 +1500、知性 +8、故郷が恋しい",
          "zh": "财富 +1500，智力 +8，思乡",
          "en": "Wealth +1500, Smarts +8, Homesick"
        }
      },
      {
        "label": {
          "ja": "故郷に残り、年老いる両親のそばにいる",
          "zh": "留在家乡，陪伴渐老的父母",
          "en": "Stay home to remain close to aging parents and cherished roots"
        },
        "id": "stay_home",
        "sub": {
          "ja": "幸福 +10、社交 +8",
          "zh": "幸福 +10，社交 +8",
          "en": "Happiness +10, Social +8"
        }
      }
    ],
    "title": {
      "ja": "28歳：移住の分かれ道",
      "zh": "28岁：移居的岔路口",
      "en": "Age 28: The Migration Crossroads"
    },
    "age": 28,
    "body": {
      "ja": "高所得国で働く好機が来ました。貯蓄は増えそうですが、故郷と家族を離れることになります。",
      "zh": "一个去高收入国家工作的机会出现了。它能带来可观积蓄，但你必须离开家人与故乡。",
      "en": "A lucrative opportunity to work in a high-income nation arrives. It promises substantial savings, but demands leaving family and homeland behind."
    }
  },
  "biz": {
    "fact": {
      "ja": "中小企業は世界の企業の約90%を占め、雇用の50%以上を支えています（世界銀行）。",
      "zh": "中小企业约占全球企业的90%，提供超过50%的就业岗位（世界银行）。",
      "en": "Small and medium enterprises represent about 90% of all businesses and more than 50% of employment worldwide (World Bank)."
    },
    "id": "biz",
    "choices": [
      {
        "label": {
          "ja": "独立して、自分の事業を始める",
          "zh": "独立创业，自己当老板",
          "en": "Launch your independent business and become your own boss"
        },
        "id": "start_business",
        "sub": {
          "ja": "高い利益とリスク、知性 +10",
          "zh": "高风险高回报，智力 +10",
          "en": "High reward/risk, Smarts +10"
        }
      },
      {
        "label": {
          "ja": "今の仕事を続け、家計の安定を守る",
          "zh": "继续稳定的工作，守住家庭财务的安宁",
          "en": "Keep your steady job and protect your family's financial calm"
        },
        "id": "keep_stable",
        "sub": {
          "ja": "幸福 +6、ストレス少なめ",
          "zh": "幸福 +6，压力较低",
          "en": "Happiness +6, Low stress"
        }
      }
    ],
    "title": {
      "ja": "32歳：起業への思い",
      "zh": "32岁：创业的火花",
      "en": "Age 32: The Entrepreneurial Spark"
    },
    "age": 32,
    "body": {
      "ja": "10年ほどの経験と少しの貯蓄があります。自分で商売を始めるか、今の安定を守るか考えます。",
      "zh": "有了十年的实践经验和一些积蓄，你萌生了创业的念头。是大胆尝试，还是保持稳定？",
      "en": "With a decade of hands-on experience and modest savings, the drive to launch your own venture calls. Do you take the leap or hold steady?"
    }
  },
  "lifestyle": {
    "fact": {
      "ja": "心血管疾患、がん、糖尿病などの非感染性疾患は世界の死亡の74%を占めます（WHO）。中年期の生活習慣が将来に影響します。",
      "zh": "心血管疾病、癌症、糖尿病等非传染性疾病占全球死亡的74%（WHO）。中年的生活方式会影响未来健康。",
      "en": "Non-communicable diseases (cardiovascular, cancer, diabetes) account for 74% of all global deaths (WHO). Lifestyle changes in midlife add over a decade of vitality."
    },
    "id": "lifestyle",
    "choices": [
      {
        "label": {
          "ja": "食生活を整え、毎日運動する",
          "zh": "坚持健康饮食和每天锻炼",
          "en": "Commit to wholesome nutrition and daily fitness training"
        },
        "id": "healthy_change",
        "sub": {
          "ja": "健康 +12、活力 +6",
          "zh": "健康 +12，活力 +6",
          "en": "Health +12, Vitality +6"
        }
      },
      {
        "label": {
          "ja": "疲れを押して、収入のために働き続ける",
          "zh": "忍着疲劳继续拼命赚钱",
          "en": "Push through the aches and keep driving hard for financial gain"
        },
        "id": "work_focus",
        "sub": {
          "ja": "資産 +500、健康 -6",
          "zh": "财富 +500，健康 -6",
          "en": "Wealth +500, Health -6"
        }
      }
    ],
    "title": {
      "ja": "38歳：健康を見直す時",
      "zh": "38岁：重新重视健康",
      "en": "Age 38: The Midlife Wellness Awakening"
    },
    "age": 38,
    "body": {
      "ja": "長い勤務が続き、疲れや痛みを感じ始めました。若さがいつまでも続くわけではないと気づきます。",
      "zh": "长时间工作后，疲劳和疼痛逐渐出现。身体提醒你，年轻并不是用不完的本钱。",
      "en": "Lingering fatigue and aches emerge after prolonged workweeks. Your body gently signals that youth is no longer an infinite reservoir."
    }
  },
  "eldercare": {
    "fact": {
      "ja": "40～50代の「サンドイッチ世代」は、育つ子どもと弱る親を同時に支え、心と家計の二重の負担を担います（OECD）。",
      "zh": "四五十岁的“夹心一代”同时抚养孩子和照顾年迈父母，承担双重的情感与经济压力（OECD）。",
      "en": "The \"Sandwich Generation\" in their 40s-50s globally supports both maturing children and frail parents, shouldering double emotional and fiscal weight (OECD)."
    },
    "id": "eldercare",
    "choices": [
      {
        "label": {
          "ja": "両親を家に迎え、自分で世話をする",
          "zh": "接父母到家中，亲自照料",
          "en": "Welcome your parents into your home to personally care for them"
        },
        "id": "care_at_home",
        "sub": {
          "ja": "幸福 +14、家族の絆 +12",
          "zh": "幸福 +14，亲情 +12",
          "en": "Happiness +14, Family Bond +12"
        }
      },
      {
        "label": {
          "ja": "訪問看護や専門の介護を利用する",
          "zh": "聘请专业上门护理和医疗照护",
          "en": "Hire professional in-home nursing and specialized medical care"
        },
        "id": "medical_aid",
        "sub": {
          "ja": "資産 -400、専門のケア",
          "zh": "财富 -400，专业照护",
          "en": "Wealth -400, Professional care"
        }
      }
    ],
    "title": {
      "ja": "48歳：年老いた親を支える",
      "zh": "48岁：照顾长辈",
      "en": "Age 48: Honoring the Elders"
    },
    "age": 48,
    "body": {
      "ja": "両親が年を取り、移動や日々の暮らしに助けが必要になりました。仕事と家庭を抱えながら、どう支えますか？",
      "zh": "父母年迈，行动和日常生活都需要帮助。你还要兼顾自己的家庭与事业，会怎样照顾他们？",
      "en": "Aging parents face declining mobility and chronic ailments, needing daily devotion. Balancing your own household and career, how do you tend to them?"
    }
  },
  "legacy": {
    "fact": {
      "ja": "長寿研究では、指導や奉仕を続ける高齢者は、長生きし認知機能も保ちやすい傾向が示されています。",
      "zh": "长寿研究显示，积极指导年轻人或参与志愿服务的老人，往往寿命更长、认知衰退风险更低。",
      "en": "Harvard longevity studies show elders who actively mentor or volunteer live 20% longer with substantially lower cognitive decline."
    },
    "id": "legacy",
    "choices": [
      {
        "label": {
          "ja": "若者を導き、地域でボランティアをする",
          "zh": "指导年轻人，参与社区志愿活动",
          "en": "Mentor the young and volunteer in community neighborhood projects"
        },
        "id": "mentor_youth",
        "sub": {
          "ja": "幸福 +16、社交 +14",
          "zh": "幸福 +16，社交 +14",
          "en": "Happiness +16, Social +14"
        }
      },
      {
        "label": {
          "ja": "花を育て、景色や旅行をゆっくり楽しむ",
          "zh": "悠闲地种花、散步和旅行",
          "en": "Enjoy serene leisure, tending lush garden flowers and scenic travels"
        },
        "id": "leisure_travel",
        "sub": {
          "ja": "穏やかな心、健康 +8",
          "zh": "心境平和，健康 +8",
          "en": "Tranquility, Health +8"
        }
      }
    ],
    "title": {
      "ja": "68歳：経験を生かす日々",
      "zh": "68岁：受人尊敬的长者",
      "en": "Age 68: The Venerable Elder"
    },
    "age": 68,
    "body": {
      "ja": "仕事中心の日々を終え、退職生活も落ち着いてきました。豊富な人生経験を持つ今、どのように過ごしますか？",
      "zh": "忙碌的工作岁月已经过去，退休生活也渐入佳境。拥有丰富阅历的你，会如何度过这些日子？",
      "en": "With your working years behind you, you possess a treasure trove of lived experience. How do you choose to spend these golden days?"
    }
  },
  "will": {
    "fact": {
      "ja": "80歳を迎えるまでには、多くの困難や病気を乗り越えています。長い人生を歩んだこと自体が大きな達成です。",
      "zh": "走到八十岁，需要跨越许多困难与疾病。能走完这段漫长旅程，本身就是巨大的成就。",
      "en": "Only about a third of babies born in developing nations live to celebrate their 80th birthday. Reaching age 80 is humanity's grandest triumph."
    },
    "id": "will",
    "choices": [
      {
        "label": {
          "ja": "子孫に思いやりと家族の和を伝える",
          "zh": "给后人留下关爱、和睦与团结的嘱托",
          "en": "Leave a message of harmony, love, and unity for those who follow"
        },
        "id": "family_harmony",
        "sub": {
          "ja": "心の安らぎ +20",
          "zh": "内心安宁 +20",
          "en": "Complete Peace +20"
        }
      },
      {
        "label": {
          "ja": "貯蓄の一部を、困っている子の奨学金にする",
          "zh": "拿出部分积蓄，资助困难儿童求学",
          "en": "Endow a portion of savings to support scholarships for needy children"
        },
        "id": "donate_cause",
        "sub": {
          "ja": "尊い遺産、幸福 +22",
          "zh": "高尚的传承，幸福 +22",
          "en": "Noble Legacy, Happiness +22"
        }
      }
    ],
    "title": {
      "ja": "80歳：未来に残すもの",
      "zh": "80岁：留下的传承",
      "en": "Age 80: The Lasting Heritage"
    },
    "age": 80,
    "body": {
      "ja": "地上で80年を過ごしました。喜びも涙もある人生を振り返り、次の世代に何を残したいですか？",
      "zh": "在世间走过八十年，回望充满欢笑、泪水与坚韧的一生，你想给后人留下什么？",
      "en": "Eighty years upon this Earth. Looking back upon a complete human existence of joy, tears, and resilience. What final gift do you leave behind?"
    }
  }
};
