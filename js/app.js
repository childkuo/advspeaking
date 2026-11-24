/**
 * 如果跟我這樣說..... — 口語白話 → ≤300 字完整結構短文 ＋ CEFR A1 / A2 / B1 / B2 英文翻譯
 * 支援 100% 離線雙語引擎 ＋ 選填 Gemini／Ollama，桌機單畫面零捲動 ＋ 手機底部 4 分頁導覽
 */
(() => {
  'use strict';

  const STORAGE_KEY = '5d_teen_bilingual_cefr_v2';
  const MAX_ZH_CHARS = 300;
  const TAB_ORDER = ['article', 'd1', 'd2', 'd3', 'd4', 'd5', 'a4'];
  const CEFR_ORDER = ['A1', 'A2', 'B1', 'B2'];
  const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

  const TONE_LABELS = {
    gentle_family: '溫和親子對話版',
    teen_growth: '青春自律成長版',
    teacher_record: '師長輔導紀錄版'
  };

  const CEFR_META = {
    A1: {
      code: 'A1',
      short: '入門',
      title: '入門基礎・CEFR A1',
      promptSpec: 'CEFR A1 入門程度（國小高年級～國一），只用最常見基礎單字與超短直白句型（每句 6～12 字）'
    },
    A2: {
      code: 'A2',
      short: '國中',
      title: '國中程度・CEFR A2',
      promptSpec: '台灣國中英文程度（CEFR A2 基礎核心字彙與簡單清晰句型，避免艱深字）'
    },
    B1: {
      code: 'B1',
      short: '高中',
      title: '高中進階・CEFR B1',
      promptSpec: '台灣高中英文程度（CEFR B1 中級字彙、轉折連接詞與流暢複合句型）'
    },
    B2: {
      code: 'B2',
      short: '流利',
      title: '高階流利・CEFR B2',
      promptSpec: 'CEFR B2 中高級流利程度，使用精準抽象詞彙、分詞構句與自然道地的書面表達'
    }
  };

  /* -------------------- 基礎安全與輔助函式 -------------------- */
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[m]));
  }

  function escapeXml(s) {
    return String(s == null ? '' : s)
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  function sanitizeFilename(s) {
    const cleaned = String(s || 'DRAFT')
      .replace(/[\/\\:*?"<>|\x00-\x1F]/g, '_')
      .replace(/\.\.+/g, '_')
      .trim();
    return (cleaned || 'DRAFT').slice(0, 60);
  }

  function todayStr() {
    return new Date().toISOString().slice(0, 10);
  }

  function addDays(base, n = 7) {
    const d = new Date((base || todayStr()) + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }

  function countZh(s) {
    return String(s || '').replace(/\s+/g, '').length;
  }

  function isMobileView() {
    return typeof window !== 'undefined' && window.innerWidth < 768;
  }

  function setPath(obj, path, val) {
    const parts = String(path).split('.');
    if (parts.some(k => FORBIDDEN_KEYS.has(k))) return;
    let cur = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!Object.prototype.hasOwnProperty.call(cur, parts[i]) || typeof cur[parts[i]] !== 'object' || !cur[parts[i]]) {
        cur[parts[i]] = {};
      }
      cur = cur[parts[i]];
    }
    cur[parts[parts.length - 1]] = val;
  }

  function showToast(msg, type = '') {
    if (typeof document === 'undefined') return;
    const box = document.getElementById('toast-container');
    if (!box) return;
    const el = document.createElement('div');
    el.className = `toast ${type}`.trim();
    el.textContent = msg;
    box.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transition = 'opacity .2s';
      setTimeout(() => el.remove(), 200);
    }, 2300);
  }

  function speakText(text, rate = 1.0) {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      showToast('此瀏覽器不支援語音朗讀功能。', 'warning');
      return;
    }
    window.speechSynthesis.cancel();
    const clean = String(text || '').replace(/\(([^)]+)\)/g, ', $1').trim();
    if (!clean) return;
    const u = new SpeechSynthesisUtterance(clean);
    u.lang = 'en-US';
    u.rate = rate;
    window.speechSynthesis.speak(u);
    showToast(rate < 1 ? `慢速朗讀 ${activeCefr} 英文中...` : `朗讀 ${activeCefr} 英文中...`);
  }

  /* -------------------- 9 大國高中情境範例與四階 CEFR (A1–B2) 雙語知識庫 -------------------- */
  const SCENARIOS = {
    compound_3c_emotion: '昨晚弟弟熬夜玩手遊到凌晨一點多不肯睡，今天早上媽媽叫他起床去學校遲到了，他還嫌媽媽囉唆直接甩門發脾氣。',
    '3c_sleep': '我昨天晚上躲在房間滑手機看短影音到凌晨兩點才睡，結果今天早上鬧鐘響了叫不起來，第一節課大遲到。',
    study_exam: '小宇這次段考數學考得很差，因為怕被爸媽罵，不僅把考卷藏在書包最底層，連這禮拜的數學習作也連續三天沒交，直到導師打電話通知家長才曝光。',
    outing_safety: '高一的姊姊昨晚補習班提早下課，沒先傳訊息跟家裡說就和同學去西門町逛街吃宵夜，直到晚上十點半才回家，讓爸爸媽媽急得差點報警。',
    money_spend: '阿凱這個月把爸媽給的兩千元餐費跟零用錢省下來，偷偷拿去超商買遊戲點數卡課金，結果月底沒錢吃午餐還跟同學借了五百元。',
    peer_social: '小傑跟同班同學在班級 LINE 群組裡因為分組報告分工不均起口角，小傑一時衝動在群組裡截圖酸對方，造成全班氣氛尷尬、對方非常生氣。',
    boundary_item: '弟弟昨天沒問過姊姊就私自進房間拿她的藍牙耳機帶去學校用，還不小心把充電盒摔裂，姊姊回家發現後非常生氣覺得隱私跟物品完全沒被尊重。',
    chore_self: '哥哥這週輪到負責洗晚餐的碗跟整理書桌，但他放學回家只顧著追劇打電動，碗盤堆在水槽兩天發臭，書桌雜物也堆到找不到考卷。',
    safety_health: '小華今天早上為了趕公車騎電動自行車上學沒有戴安全帽，還在路口搶黃燈差點跟轉彎機車擦撞，被學校導護老師當場攔下來勸導。'
  };

  const KB = {
    '3c_sleep': {
      id: '3c_sleep', label: '3C 與睡眠作息',
      enLabel: { A1: 'phone and sleep', A2: 'phone habits and sleep', B1: 'sleep schedules and screen use', B2: 'sleep hygiene and digital self-regulation' },
      kw: /(手機|手遊|短影音|抖音|IG|YouTube|追劇|遊戲|Switch|平板|電腦|熬夜|凌晨|清晨|半夜|遲到|睡過頭|起不來|叫不醒|睡眠|睡覺|想睡|補眠|晚睡|沒睡飽|太累|很累|累壞|作息|打瞌睡)/g,
      title: a => `${a}夜間使用手機與作息調整`,
      when: '昨晚至今天早上', where: '家中臥室', item: '手機',
      why: '違反睡前收手機與準時上學的約定', how: '早上叫不醒上學遲到被發現', impact: '導致遲到、精神不濟也讓家人擔心',
      d2: '先協助整理出門確保平安到校，不於早晨擴大爭執，並約定放學後冷靜討論。',
      d3: '白天課業壓力大，想靠熬夜滑手機換取自由時間，加上手機放床邊缺少停損界限。',
      d4: '客廳設手機充電區，改用實體鬧鐘起床，並安排每天放學後 30 分鐘合法放鬆時間。',
      d5: '訂立作息公約：平日晚上固定時間手機放客廳充電，連續一週零遲到給予肯定。',
      levels: {
        A1: {
          text: (s, t) => `${t}, ${s.subj} played on ${s.poss} phone very late. ${s.Subj} got up late for school. First, ${s.we} did not fight, and ${s.subjLow} went to school safely. School was hard, and the phone was next to the bed. Next, ${s.subjLow} will put the phone in the living room at night and use a clock. Now ${s.we} have a home rule: no phone in bed on school nights.`,
          vocab: [['late', 'adj./adv.', '晚／遲到'], ['phone', 'n.', '手機'], ['fight', 'v.', '吵架'], ['bed', 'n.', '床'], ['clock', 'n.', '時鐘'], ['rule', 'n.', '規定']]
        },
        A2: {
          text: (s, t) => `${t}, ${s.subj} stayed up very late playing on the phone, so ${s.subjLow} got up late and was late for school. First, ${s.we} stayed calm and made sure ${s.subjLow} got to school safely without fighting in the morning. The real reason was school stress. ${s.Subj} wanted some free time at night, and keeping the phone by the bed made it hard to stop. To make things better, ${s.subjLow} will put the phone in the living room before bed, use a real alarm clock, and take a 30-minute break after school. Finally, ${s.we} made a family rule: put the phone outside the bedroom on school nights and arrive at school on time.`,
          vocab: [['stay up late', 'phr.', '熬夜'], ['late for school', 'phr.', '上學遲到'], ['calm', 'adj.', '冷靜的'], ['stress', 'n.', '壓力'], ['living room', 'n.', '客廳'], ['alarm clock', 'n.', '鬧鐘'], ['rule', 'n.', '規則／公約']]
        },
        B1: {
          text: (s, t) => `${t}, ${s.subj} stayed up past midnight scrolling on ${s.poss} phone, which caused ${s.obj} to oversleep and arrive late for school. To handle the situation properly, ${s.we} avoided a morning argument and focused on getting to school safely first. Looking deeper, heavy academic pressure made ${s.obj} seek freedom late at night, and keeping the phone beside the bed removed any clear boundary. Going forward, ${s.subjLow} will charge the phone in the living room, rely on a traditional alarm clock, and schedule a 30-minute break after school. In the end, ${s.we} established a routine: leave phones outside the bedroom on school nights and keep punctual attendance.`,
          vocab: [['oversleep', 'v.', '睡過頭'], ['argument', 'n.', '爭執'], ['academic', 'adj.', '課業的'], ['boundary', 'n.', '界限'], ['rely on', 'phr.', '依賴'], ['establish', 'v.', '建立'], ['punctual', 'adj.', '準時的']]
        },
        B2: {
          text: (s, t) => `${t}, ${s.subj} remained awake past midnight absorbed in ${s.poss} phone, inevitably oversleeping and missing the start of school. Rather than escalating tensions during a hectic morning, ${s.we} prioritized a calm departure and agreed to address the issue afterward. Upon reflection, persistent academic pressure fueled a desire for late-night autonomy, while bedside access to the device undermined self-restraint. To prevent a recurrence, ${s.subjLow} will designate a charging spot in the living room, switch to an analog alarm, and set aside a guilt-free 30-minute unwind window after school. Ultimately, ${s.we} reached a mutual commitment to keep devices out of the bedroom on weeknights and sustain consistent punctuality.`,
          vocab: [['inevitably', 'adv.', '不可避免地'], ['escalate', 'v.', '升級／擴大'], ['prioritize', 'v.', '優先處理'], ['autonomy', 'n.', '自主權'], ['undermine', 'v.', '削弱'], ['recurrence', 'n.', '再次發生'], ['mutual', 'adj.', '共同的']]
        }
      }
    },
    emotion_comm: {
      id: 'emotion_comm', label: '情緒與親子溝通',
      enLabel: { A1: 'anger at home', A2: 'anger and family talks', B1: 'emotional control at home', B2: 'emotional regulation and dialogue' },
      kw: /(發脾氣|大發脾氣|甩門|頂嘴|大吼|大叫|吵起來|冷戰|擺臭臉|嫌囉唆|嫌麻煩|不耐煩|罵髒話|摔東西|口氣差|嗆|生氣)/g,
      title: a => `${a}情緒管理與好好說話`,
      when: '今天溝通時段', where: '家中客廳與房門', item: '親子溝通',
      why: '違反理性表達、不甩門吼叫的尊重約定', how: '對話中情緒升高當場爆發', impact: '讓家人受傷且氣氛緊繃',
      d2: '雙方先暫停 15 分鐘各自深呼吸冷靜，避免在氣頭上說出傷人的話。',
      d3: '當下壓力與煩躁已達臨界點，又缺乏「喊暫停」的溝通暗號，才會用甩門防衛。',
      d4: '為衝動口氣誠懇道歉，並建立「我需要冷靜 15 分鐘」暫停暗號，大人也減少重複催促。',
      d5: '訂立溝通公約：生氣不甩門、不冷戰，先冷靜再說出心裡真正的感受。',
      levels: {
        A1: {
          text: (s, t) => `${t}, ${s.subj} got very angry at home and closed the door hard. First, everyone stopped talking for 15 minutes to cool down. ${s.Subj} felt tired and upset, and did not know how to ask for quiet time. Next, ${s.subjLow} said sorry. Now anyone can say, "I need 15 minutes." Our family rule is simple: do not shout, and talk nicely when calm.`,
          vocab: [['angry', 'adj.', '生氣的'], ['door', 'n.', '門'], ['stop', 'v.', '停止'], ['tired', 'adj.', '累的'], ['sorry', 'adj.', '抱歉的'], ['quiet', 'adj.', '安靜的']]
        },
        A2: {
          text: (s, t) => `${t}, ${s.subj} got very angry during a talk at home, shouted back, and closed the door hard. First, everyone took a 15-minute break to calm down so nobody said hurtful words. The main reason was too much stress. ${s.Subj} felt pushed and did not know how to ask for space nicely. Next, ${s.subjLow} said sorry for being rude. We also made a quiet sign: anyone can say "I need 15 minutes" before a fight starts. Finally, we agreed on a family rule: no shouting or slamming doors, and always talk nicely after we cool down.`,
          vocab: [['angry', 'adj.', '生氣的'], ['shout', 'v.', '大叫／吼叫'], ['take a break', 'phr.', '休息一下'], ['hurtful', 'adj.', '傷人的'], ['say sorry', 'phr.', '道歉'], ['rude', 'adj.', '沒禮貌的'], ['agree', 'v.', '同意／約定']]
        },
        B1: {
          text: (s, t) => `${t}, ${s.subj} lost ${s.poss} temper during a family conversation, talked back loudly, and slammed the bedroom door. Immediately, both sides stepped back for 15 minutes to breathe and prevent saying anything deeply hurtful. Looking at the cause, built-up frustration reached a breaking point, and there was no agreed signal to pause the discussion. Moving forward, ${s.subjLow} apologized sincerely for ${s.poss} harsh tone, and we introduced a clear timeout phrase while parents also cut back on repeated reminders. Together, we set a communication rule: never slam doors or give the silent treatment, and express true feelings calmly.`,
          vocab: [['temper', 'n.', '脾氣'], ['slam', 'v.', '用力甩／關'], ['frustration', 'n.', '挫折感'], ['apologize', 'v.', '道歉'], ['sincerely', 'adv.', '誠懇地'], ['harsh', 'adj.', '嚴厲／刺耳的'], ['signal', 'n.', '暗號／訊號']]
        },
        B2: {
          text: (s, t) => `${t}, ${s.subj} reacted defensively during a household exchange, snapping back and slamming the door in frustration. To de-escalate the confrontation, everyone observed a 15-minute cooling-off period before resuming dialogue. Underlying the outburst was accumulated pressure paired with the absence of a constructive mechanism to request space. As a corrective step, ${s.subjLow} offered a sincere apology for ${s.poss} impulsive tone, and the family adopted an explicit pause cue alongside fewer repetitive prompts from adults. Ultimately, we affirmed a respectful norm: reject door-slamming and stonewalling in favor of composed, honest communication.`,
          vocab: [['defensively', 'adv.', '防衛性地'], ['de-escalate', 'v.', '緩和降溫'], ['confrontation', 'n.', '衝突對峙'], ['accumulated', 'adj.', '累積的'], ['constructive', 'adj.', '具建設性的'], ['impulsive', 'adj.', '衝動的'], ['composed', 'adj.', '鎮定冷靜的']]
        }
      }
    },
    study_exam: {
      id: 'study_exam', label: '課業與誠信自律',
      enLabel: { A1: 'homework and tests', A2: 'homework and school tests', B1: 'schoolwork and honesty', B2: 'academic accountability' },
      kw: /(段考|期中考|期末考|考卷|成績單|不及格|考差|考很差|作業|功課|習作|聯絡簿|沒交|缺交|沒寫|抄襲|作弊|代簽|藏考卷|隱瞞成績)/g,
      title: a => `${a}課業面對與誠實求助`,
      when: '這週上課期間', where: '學校與家中書桌', item: '作業與考卷',
      why: '違反誠實面對成績與準時交作業的約定', how: '老師聯繫家長或檢查時發現', impact: '造成課業落後與信任受損',
      d2: '先一起攤開缺交作業與考卷盤點清單，並主動聯繫老師確認補交期限。',
      d3: '因為考差怕被責罵，加上不會寫不敢發問，才選擇拖延與藏起來逃避。',
      d4: '將作業拆成每天 25 分鐘小進度完成，睡前核對書包，遇到難題 24 小時內主動求助。',
      d5: '訂立學習公約：成績可以不完美，但考卷必誠實呈現；大人先協助找方法不情緒責罵。',
      levels: {
        A1: {
          text: (s, t) => `${t}, ${s.subj} hid a bad math test and did not give homework to the teacher. First, we made a list of missing work and called the teacher. ${s.Subj} felt afraid of being yelled at and did not ask for help. Next, ${s.subjLow} will study for 25 minutes every night and check ${s.poss} bag before bed. Our new rule: always show tests honestly, and parents will help nicely.`,
          vocab: [['test', 'n.', '考試'], ['homework', 'n.', '作業'], ['afraid', 'adj.', '害怕的'], ['study', 'v.', '讀書'], ['bag', 'n.', '書包'], ['help', 'v./n.', '幫忙']]
        },
        A2: {
          text: (s, t) => `${t}, ${s.subj} did not hand in homework on time and hid a bad math test paper at home until the teacher called. First, we checked all the missing homework together and asked the teacher for a new date to turn it in. The real reason was fear. ${s.Subj} felt scared of getting scolded and felt shy about asking questions when the work was hard. Next, ${s.subjLow} will study for 25 minutes each evening without a phone and check the school bag before bed. Finally, we made an honest rule: always show test papers within one day, and parents will help find better study ways instead of yelling.`,
          vocab: [['hand in', 'phr.', '繳交'], ['hide (hid)', 'v.', '藏起來'], ['missing', 'adj.', '缺漏的'], ['scared', 'adj.', '害怕的'], ['shy', 'adj.', '害羞的'], ['check', 'v.', '檢查'], ['honest', 'adj.', '誠實的']]
        },
        B1: {
          text: (s, t) => `${t}, ${s.subj} failed to submit math assignments for several days and concealed a disappointing exam paper until the homeroom teacher contacted home. Right away, we listed every overdue assignment and reached out to the teacher to confirm a makeup deadline. The underlying cause was anxiety over criticism and hesitation to seek help on difficult problems. Going forward, ${s.subjLow} will break homework into 25-minute daily sessions, inspect ${s.poss} backpack before sleep, and ask for support within 24 hours whenever stuck. Ultimately, we agreed that imperfect grades are acceptable as long as test papers are shared honestly without harsh blame.`,
          vocab: [['submit', 'v.', '繳交'], ['conceal', 'v.', '隱瞞／藏匿'], ['disappointing', 'adj.', '令人失望的'], ['overdue', 'adj.', '逾期的'], ['anxiety', 'n.', '焦慮'], ['hesitation', 'n.', '猶豫'], ['acceptable', 'adj.', '可接受的']]
        },
        B2: {
          text: (s, t) => `${t}, ${s.subj} withheld a poor midterm math paper and repeatedly missed workbook deadlines until the homeroom teacher intervened. To stabilize the situation, we audited all outstanding tasks together and proactively coordinated a realistic submission schedule with the teacher. Fundamentally, fear of reprimand combined with reluctance to expose academic gaps drove avoidance and procrastination. To rebuild momentum, ${s.subjLow} will tackle coursework in focused 25-minute intervals, verify ${s.poss} bag nightly, and request guidance within 24 hours of hitting an obstacle. Going forward, we established a transparent compact: grades need not be flawless, yet honesty is non-negotiable, met with problem-solving rather than scolding.`,
          vocab: [['withhold', 'v.', '隱瞞不報'], ['intervene', 'v.', '介入處理'], ['proactively', 'adv.', '主動積極地'], ['reprimand', 'n.', '斥責'], ['reluctance', 'n.', '不願／顧慮'], ['procrastination', 'n.', '拖延'], ['transparent', 'adj.', '透明坦誠的']]
        }
      }
    },
    outing_safety: {
      id: 'outing_safety', label: '外出與行蹤安全',
      enLabel: { A1: 'going out late', A2: 'going out safely', B1: 'outing check-ins', B2: 'safety communication' },
      kw: /(晚歸|沒回家|未歸|失聯|找不到人|翹課|翹補習|補習班|提早下課|逛街|西門町|網咖|KTV|宵夜|去玩|未報備|沒告知|沒傳訊息|報警)/g,
      title: a => `${a}課後外出與安全報備`,
      when: '昨晚課後至深夜', where: '校外商圈與返家途中', item: '課後行蹤報備',
      why: '違反行程變動必須事前報備的安全約定', how: '超過返家時間失聯經家人聯繫得知', impact: '讓家人極度焦慮並折損外出信任',
      d2: '確認平安返家無恙後，先安撫彼此情緒，並如實交代去向與同行朋友。',
      d3: '擔心先問會被拒絕而心存僥倖，也低估了聯絡不到人讓父母產生的恐慌。',
      d4: '養成 30 秒報備四要素（去哪、跟誰、幾點回、怎麼回），並設父母來電穿透靜音。',
      d5: '訂立外出公約：行程變動出發前必傳訊息報平安，連續準時報備即維持社交自主權。',
      levels: {
        A1: {
          text: (s, t) => `${t}, ${s.subj} went shopping with friends after class and came home very late without telling family. First, we were glad ${s.subjLow} got home safe, and ${s.subjLow} told us where ${s.subjLow} went. ${s.Subj} thought parents would say no. Next, ${s.subjLow} will send a short message before going out and answer parents' calls. Our family rule: always text before changing plans.`,
          vocab: [['shopping', 'n.', '逛街'], ['friends', 'n.', '朋友'], ['safe', 'adj.', '安全的'], ['tell (told)', 'v.', '告訴'], ['short', 'adj.', '簡短的'], ['call', 'n./v.', '電話／打電話']]
        },
        A2: {
          text: (s, t) => `${t}, ${s.subj} went out with friends after cram school and came home very late without sending a message to family. First, we made sure ${s.subjLow} came home safely, calmed down, and talked clearly about where ${s.subjLow} went. The reason was worry about hearing "no." ${s.Subj} did not think about how scared parents feel when they cannot reach their child. Next, ${s.subjLow} will send a quick message with the place, friends, and time before going anywhere, and keep the phone ring on for parents. Finally, we agreed on a safety rule: always text before changing plans, and parents will trust ${s.obj} to enjoy time with friends.`,
          vocab: [['cram school', 'n.', '補習班'], ['message', 'n.', '訊息'], ['safely', 'adv.', '平安地'], ['reach', 'v.', '聯絡上'], ['change plans', 'phr.', '改變計畫'], ['safety', 'n.', '安全'], ['trust', 'v.', '信任']]
        },
        B1: {
          text: (s, t) => `${t}, ${s.subj} hung out downtown with classmates after cram school ended early and returned home late at night without notifying family. Once ${s.subjLow} arrived safely, we calmed our nerves and went over where ${s.subjLow} had been and who was there. The root cause was fearing refusal while underestimating how panicked parents become when they lose contact. From now on, ${s.subjLow} will send a 30-second update covering destination, companions, return time, and transport, and allow parents' calls to bypass silent mode. We agreed on a fair outing rule: always check in before changing plans in order to keep social independence.`,
          vocab: [['notify', 'v.', '通知'], ['refusal', 'n.', '拒絕'], ['underestimate', 'v.', '低估'], ['panicked', 'adj.', '恐慌的'], ['destination', 'n.', '目的地'], ['companion', 'n.', '同伴'], ['independence', 'n.', '獨立自主']]
        },
        B2: {
          text: (s, t) => `${t}, ${s.subj} detoured downtown with peers following an early cram-school dismissal and returned well past curfew without prior notice, causing severe parental alarm. After confirming ${s.poss} safe arrival, we eased tensions and reviewed ${s.poss} itinerary candidly. Behind the lapse lay apprehension of being turned down alongside a failure to grasp the sheer distress caused by being unreachable. Moving forward, ${s.subjLow} will transmit a concise 30-second briefing—location, company, return time, and transit—while whitelisting parental calls through silent mode. Collectively, we affirmed a trust-based pact: timely check-ins prior to any schedule change preserve social autonomy.`,
          vocab: [['detour', 'v.', '繞道而行'], ['curfew', 'n.', '門禁時間'], ['itinerary', 'n.', '行程'], ['candidly', 'adv.', '坦白地'], ['apprehension', 'n.', '憂慮'], ['unreachable', 'adj.', '失聯的'], ['concise', 'adj.', '簡潔的']]
        }
      }
    },
    money_spend: {
      id: 'money_spend', label: '金錢與財務自律',
      enLabel: { A1: 'spending money', A2: 'spending money wisely', B1: 'budgeting allowance', B2: 'financial discipline' },
      kw: /([0-9一二兩三四五六七八九十百千萬]+元|塊錢|餐費|早餐錢|午餐錢|零用錢|壓歲錢|生活費|點數卡|儲值|課金|網購|蝦皮|刷卡|借錢|欠錢|透支|花光|超商)/g,
      title: a => `${a}零用錢管理與理性消費`,
      when: '這個月消費期間', where: '超商與學校', item: '餐費與零用錢',
      why: '違反專款專用與不私下借錢的理財約定', how: '月底沒錢吃飯或核對發票時發現', impact: '影響正常飲食並引發借貸困擾',
      d2: '先誠實盤點所有花費與欠款，並由家人陪同隔日立刻歸還同學借款。',
      d3: '餐費和娛樂費混放又沒記帳，面對遊戲點數限時誘惑時缺少冷靜緩衝。',
      d4: '改用分袋管理把吃飯錢與娛樂費分開，逾 300 元消費先等 24 小時，並分期償還透支。',
      d5: '訂立理財公約：每週日簡單記帳核對餘額，遇資金困難誠實找家人商量絕不私下借錢。',
      levels: {
        A1: {
          text: (s, t) => `${t}, ${s.subj} used lunch money to buy game cards and had no money for food. ${s.Subj} asked a friend for money. First, we counted the money and gave it back to the friend the next day. Meal money and play money were in the same bag. Next, ${s.subjLow} will keep lunch money in a separate bag and wait one day before buying games. Our money rule: write down spending each week and ask parents when short on money.`,
          vocab: [['lunch', 'n.', '午餐'], ['buy', 'v.', '買'], ['count', 'v.', '計算'], ['bag', 'n.', '袋子'], ['wait', 'v.', '等待'], ['week', 'n.', '星期']]
        },
        A2: {
          text: (s, t) => `${t}, ${s.subj} spent lunch money on game cards at a store, so there was no money left for food and ${s.subjLow} borrowed money from a classmate. First, we checked all the spending honestly and paid the classmate back the very next day. The reason was mixing meal money with fun money. Without keeping notes, it was easy to buy things too fast. Next, ${s.subjLow} will keep lunch money in a separate bag, wait 24 hours before buying fun things, and pay back the extra cost step by step. Finally, we made a money rule: write down weekly spending, never borrow big money from friends, and talk to parents when needing help.`,
          vocab: [['spend (spent)', 'v.', '花費'], ['borrow', 'v.', '借入'], ['pay back', 'phr.', '還錢'], ['separate', 'adj.', '分開的'], ['cost', 'n.', '費用'], ['weekly', 'adj.', '每週的'], ['honestly', 'adv.', '誠實地']]
        },
        B1: {
          text: (s, t) => `${t}, ${s.subj} secretly used ${s.poss} monthly meal allowance to purchase game credit at a convenience store, eventually running out of lunch funds and borrowing cash from a classmate. Immediately, we reviewed every expense honestly and repaid the classmate the following day with family support. The main problem was combining meal and entertainment budgets without tracking spending, leaving no buffer against limited-time game offers. Going forward, ${s.subjLow} will separate food and leisure envelopes, follow a 24-hour cooling-off rule for purchases over 300 dollars, and repay the overspent amount in installments. Together, we set a budget rule: log weekly balances every Sunday and consult family rather than borrowing privately.`,
          vocab: [['allowance', 'n.', '零用錢'], ['purchase', 'v./n.', '購買'], ['expense', 'n.', '開銷'], ['budget', 'n.', '預算'], ['entertainment', 'n.', '娛樂'], ['installment', 'n.', '分期款'], ['consult', 'v.', '商量／諮詢']]
        },
        B2: {
          text: (s, t) => `${t}, ${s.subj} diverted ${s.poss} meal stipend toward in-game top-up cards, depleting essential lunch funds and resorting to an informal loan from a peer. To resolve the shortfall responsibly, we conducted a transparent audit of all outlays and settled the peer debt the next day. At the core, commingling essential and discretionary funds without bookkeeping left ${s.obj} vulnerable to time-limited digital temptations. To build financial discipline, ${s.subjLow} will adopt envelope budgeting, enforce a 24-hour deliberation period on non-essential buys over 300 dollars, and reimburse the deficit incrementally. Ultimately, we instituted a Sunday ledger review and a firm pledge to seek family guidance rather than private borrowing.`,
          vocab: [['divert', 'v.', '挪用'], ['deplete', 'v.', '耗盡'], ['shortfall', 'n.', '資金缺口'], ['discretionary', 'adj.', '可自由支配的'], ['vulnerable', 'adj.', '易受誘惑的'], ['deliberation', 'n.', '審慎思考'], ['deficit', 'n.', '透支／赤字']]
        }
      }
    },
    peer_social: {
      id: 'peer_social', label: '同儕社群與手足',
      enLabel: { A1: 'fighting with friends', A2: 'talking kindly with friends', B1: 'peer communication online', B2: 'digital conflict resolution' },
      kw: /(群組|LINE|限動|截圖|酸|排擠|分組報告|同學吵架|口角|打架|推擠|搶|遙控器|電視|手足|吵架|說壞話|公審|霸凌|翻臉)/g,
      title: a => `${a}同儕群組與理性溝通`,
      when: '課餘互動時段', where: '班級群組與學校', item: '群組互動與分工',
      why: '違反對事不對人、不公開嘲諷截圖的界限', how: '群組口角傳開造成氣氛尷尬', impact: '傷害對方感受並破壞團體氣氛',
      d2: '立即停止筆戰並收回不當訊息，把公開爭執拉回私下理性對話。',
      d3: '因覺得分工不公累積委屈，隔著螢幕衝動想證明自己對，忘了公開酸人只會傷感情。',
      d4: '向對方誠懇道歉並重新列清楚分工表，養成生氣文字先存備忘錄放 10 分鐘的習慣。',
      d5: '訂立人際公約：私下溝通、公開尊重，生氣時絕不立刻按送出也不截圖公審。',
      levels: {
        A1: {
          text: (s, t) => `${t}, ${s.subj} had a fight with a classmate in the class chat and wrote mean words. First, ${s.subjLow} stopped typing and deleted the bad text. ${s.Subj} felt the team work was not fair and got mad fast. Next, ${s.subjLow} will say sorry, make a clear team plan, and wait 10 minutes before sending an angry text. Our rule: be kind in group chats and talk one-on-one.`,
          vocab: [['chat', 'n.', '聊天室'], ['write (wrote)', 'v.', '寫'], ['fair', 'adj.', '公平的'], ['mad', 'adj.', '生氣的'], ['plan', 'n.', '計畫'], ['kind', 'adj.', '友善的']]
        },
        A2: {
          text: (s, t) => `${t}, ${s.subj} argued with a classmate in the class group chat about team work and posted mean words that made everyone uncomfortable. First, ${s.subjLow} stopped fighting online, deleted the bad message, and moved the talk to a private chat. The real reason was feeling unfair about the work. Typing behind a screen made it too easy to send angry words without thinking. Next, ${s.subjLow} will say sorry nicely, make a clear work list with the team, and wait 10 minutes before sending any angry text. Finally, we agreed on a social rule: talk in private, be kind in public groups, and never post screenshots to hurt others.`,
          vocab: [['argue', 'v.', '爭吵'], ['mean', 'adj.', '刻薄的'], ['delete', 'v.', '刪除'], ['private', 'adj.', '私下的'], ['unfair', 'adj.', '不公平的'], ['public', 'adj.', '公開的'], ['hurt', 'v.', '傷害']]
        },
        B1: {
          text: (s, t) => `${t}, ${s.subj} got into a heated dispute with a classmate in the class group chat over unequal group project duties and posted sarcastic screenshots, making the atmosphere awkward. Immediately, ${s.subjLow} halted the online argument, unsent the hurtful messages, and shifted the conversation to private messaging. The underlying trigger was pent-up frustration over workload fairness, amplified by the impulse to prove a point behind a screen. Moving forward, ${s.subjLow} will apologize genuinely, clarify everyone's role in a shared checklist, and draft angry replies in notes for 10 minutes before hitting send. Together, we set a social principle: resolve conflicts privately, stay respectful in public chats, and never shame others with screenshots.`,
          vocab: [['dispute', 'n.', '爭執'], ['unequal', 'adj.', '不均的'], ['sarcastic', 'adj.', '諷刺的'], ['awkward', 'adj.', '尷尬的'], ['clarify', 'v.', '釐清'], ['principle', 'n.', '原則'], ['respectful', 'adj.', '尊重的']]
        },
        B2: {
          text: (s, t) => `${t}, ${s.subj} clashed with a peer in the class messaging group over perceived inequities in a team assignment, impulsively posting mocking screenshots that soured the classroom climate. To contain the fallout, ${s.subjLow} ceased replying publicly, retracted the offending remarks, and transitioned to a calm one-on-one exchange. At its core, unspoken resentment combined with screen-mediated impulsivity obscured how damaging public ridicule can be. Going forward, ${s.subjLow} will offer a candid apology, co-author an explicit division of labor, and impose a 10-minute draft buffer whenever agitated. Ultimately, we upheld a clear digital ethic: address grievances privately, uphold dignity in public forums, and never weaponize screenshots.`,
          vocab: [['inequity', 'n.', '不公平'], ['retract', 'v.', '收回／撤回'], ['resentment', 'n.', '怨懟委屈'], ['ridicule', 'n.', '嘲諷'], ['agitated', 'adj.', '激動煩躁的'], ['grievance', 'n.', '不滿／委屈'], ['dignity', 'n.', '尊嚴']]
        }
      }
    },
    boundary_item: {
      id: 'boundary_item', label: '物品與隱私界限',
      enLabel: { A1: 'taking personal things', A2: 'respecting personal things', B1: 'personal boundaries', B2: 'respecting privacy and property' },
      kw: /(擅自|沒問過|未經同意|沒經過同意|偷拿|偷看|翻看|日記|耳機|藍牙耳機|玩偶|彩色筆|文具|筆記本|化妝品|球鞋|模型|卡牌|弄壞|摔裂|摔壞|弄丟|隱私|私人物品)/g,
      title: a => `${a}尊重物品與隱私界限`,
      when: '昨天出門前', where: '家人房間與學校', item: '他人私人物品',
      why: '違反未經同意不得進入房間拿取私物的界限', how: '物主回家發現物品受損後抗議', impact: '造成財物受損與嚴重不被尊重感',
      d2: '立即雙手歸還物品並如實說明損壞情形，由家人先安撫物主情緒。',
      d3: '圖一時方便又怕被拒絕，抱持熟人借一下沒關係的僥倖心態，忽略他人安全感。',
      d4: '正式道歉不找藉口，以零用錢或家務存錢賠償維修費，落實進房先敲門、借物先問過。',
      d5: '訂立界限公約：全家人互相尊重私人空間與物品，對方有權說不，損壞一定負責。',
      levels: {
        A1: {
          text: (s, t) => `${t}, ${s.subj} took a family member's earphones without asking and broke the box at school. First, ${s.subjLow} gave them back right away and told the truth. ${s.Subj} wanted to borrow them fast and felt afraid to ask. Next, ${s.subjLow} will say sorry, pay to fix the box, and knock on doors first. Our home rule: always ask before taking someone's things.`,
          vocab: [['take (took)', 'v.', '拿取'], ['ask', 'v.', '詢問'], ['box', 'n.', '盒子'], ['fix', 'v.', '修理'], ['knock', 'v.', '敲門'], ['things', 'n.', '物品']]
        },
        A2: {
          text: (s, t) => `${t}, ${s.subj} took a family member's earphones without asking and accidentally broke the case at school. First, ${s.subjLow} gave the item back right away, told the truth about the damage, and listened to the owner's feelings. The reason was wanting a quick favor and feeling afraid of hearing "no." ${s.Subj} forgot that personal things need respect. Next, ${s.subjLow} will say sorry clearly, use pocket money to help fix or buy a new one, and always knock before entering a room. Finally, we made a respect rule: always ask first before borrowing anything, and accept "no" politely.`,
          vocab: [['without asking', 'phr.', '沒先詢問'], ['accidentally', 'adv.', '不小心'], ['break (broke)', 'v.', '弄壞'], ['truth', 'n.', '實話'], ['respect', 'n./v.', '尊重'], ['pocket money', 'n.', '零用錢'], ['politely', 'adv.', '有禮貌地']]
        },
        B1: {
          text: (s, t) => `${t}, ${s.subj} entered a family member's room without permission, took ${s.poss} relative's wireless earphones to school, and cracked the charging case by accident. Immediately, ${s.subjLow} returned the earphones with both hands, explained the damage honestly, and gave the owner space to share ${s.poss} frustration. The real cause was chasing convenience while fearing refusal, overlooking how deeply uninvited entry hurts someone's sense of privacy. Going forward, ${s.subjLow} will apologize without excuses, cover the repair cost through allowance or chores, and always knock before entering. Together, we set a boundary rule: respect personal space and belongings, accept "no" gracefully, and take full responsibility for damage.`,
          vocab: [['permission', 'n.', '同意／許可'], ['crack', 'v.', '摔裂'], ['convenience', 'n.', '方便'], ['privacy', 'n.', '隱私'], ['excuse', 'n.', '藉口'], ['belongings', 'n.', '私人物品'], ['responsibility', 'n.', '責任']]
        },
        B2: {
          text: (s, t) => `${t}, ${s.subj} entered a sibling's room uninvited, borrowed wireless earphones without consent, and inadvertently fractured the charging case at school. To address the breach immediately, ${s.subjLow} returned the item respectfully, disclosed the damage candidly, and acknowledged the owner's hurt feelings. Underlying the misstep was a casual assumption that family closeness excused skipping consent, disregarding personal security. As restitution, ${s.subjLow} will deliver an unconditional apology, finance the repair via allowance or extra chores, and strictly observe door-knocking etiquette. Ultimately, the household affirmed a mutual boundary compact: personal space and possessions are inviolable, refusal must be honored, and accountability is mandatory.`,
          vocab: [['consent', 'n.', '同意'], ['inadvertently', 'adv.', '不慎／無意中'], ['breach', 'n.', '侵犯／違反'], ['disclose', 'v.', '如實說明'], ['restitution', 'n.', '賠償修復'], ['unconditional', 'adj.', '無條件的'], ['accountability', 'n.', '負責／課責']]
        }
      }
    },
    chore_self: {
      id: 'chore_self', label: '家務與生活自理',
      enLabel: { A1: 'home chores', A2: 'home chores and tidying up', B1: 'daily chores and organization', B2: 'household accountability' },
      kw: /(倒垃圾|垃圾車|廚餘|洗碗|水槽|發臭|做家事|家務|打掃|整理房間|書桌|雜物|臭襪子|洗衣籃|長螞蟻|發霉|值日生|髒亂)/g,
      title: a => `${a}家務責任與生活自理`,
      when: '這週晚間家務時段', where: '家中廚房與書桌', item: '負責家務與整潔',
      why: '違反按時完成分工家務與維護整潔的約定', how: '家人發現碗盤發臭與桌面雜亂', impact: '影響環境衛生也增加家人負擔',
      d2: '立即放下螢幕花 15 分鐘洗清碗盤與整理桌面，並向善後的家人道謝致歉。',
      d3: '放學只想先追劇放鬆，抱持「等一下再做」拖延心態，且未設固定鬧鐘提醒。',
      d4: '設手機定時鬧鐘先做 10 分鐘家務再休息，睡前執行 3 分鐘桌面清零，忙時提前換班。',
      d5: '訂立分工公約：自己設鬧鐘完成分內家務、不拖過隔夜，大人也不反覆碎念催促。',
      levels: {
        A1: {
          text: (s, t) => `${t}, ${s.subj} watched videos after school and did not wash the dishes or clean the desk for two days. First, ${s.subjLow} stopped watching, washed the dishes, and cleaned the desk for 15 minutes. ${s.Subj} wanted to rest first and forgot without a clock. Next, ${s.subjLow} will set an alarm to do chores first and clean the desk for 3 minutes every night. Our home rule: finish daily chores before bed.`,
          vocab: [['dishes', 'n.', '碗盤'], ['desk', 'n.', '書桌'], ['rest', 'v.', '休息'], ['alarm', 'n.', '鬧鐘'], ['finish', 'v.', '完成'], ['night', 'n.', '晚上']]
        },
        A2: {
          text: (s, t) => `${t}, ${s.subj} kept watching videos after school and forgot to wash the dishes and clean the desk for two days. First, ${s.subjLow} put the screen away, spent 15 minutes cleaning the sink and desk right away, and thanked the family. The reason was waiting until "later." Without a set alarm, it was easy to forget chores while relaxing. Next, ${s.subjLow} will set a phone alarm to finish chores before playing, and spend 3 minutes tidying the desk every night. Finally, we made a home rule: finish daily chores before bed without reminders, and ask to trade turns early during exam weeks.`,
          vocab: [['wash the dishes', 'phr.', '洗碗'], ['clean', 'v./adj.', '清理／乾淨的'], ['forget (forgot)', 'v.', '忘記'], ['chore', 'n.', '家務'], ['tidy', 'v.', '整理'], ['daily', 'adj.', '每日的'], ['trade turns', 'phr.', '輪流換班']]
        },
        B1: {
          text: (s, t) => `${t}, ${s.subj} became absorbed in shows and games after school, leaving dirty dishes in the sink for two days and letting clutter bury ${s.poss} study desk. Right away, ${s.subjLow} stepped away from screens for 15 minutes to scrub the dishes, clear the desk, and thank family members who had helped. The root cause was a "do it later" mindset without any scheduled reminder to prompt action. Going forward, ${s.subjLow} will use a daily phone alarm to complete 10 minutes of chores before relaxing, do a 3-minute desk reset before bed, and swap shifts in advance during busy weeks. Together, we set a household routine: manage assigned chores independently overnight-free, while adults avoid constant nagging.`,
          vocab: [['clutter', 'n.', '雜物'], ['scrub', 'v.', '刷洗'], ['mindset', 'n.', '心態'], ['scheduled', 'adj.', '定時的'], ['swap', 'v.', '交換／換班'], ['independently', 'adv.', '獨立自主地'], ['nagging', 'n.', '反覆碎念']]
        },
        B2: {
          text: (s, t) => `${t}, ${s.subj} prioritized post-school screen entertainment over assigned duties, leaving unwashed dishes to stagnate in the sink and desk clutter to obscure important study sheets. To rectify the lapse immediately, ${s.subjLow} put devices aside for 15 minutes to restore the kitchen and workspace, expressing gratitude to family members who had stepped in. Underlying the neglect was habitual postponement coupled with the absence of an external cue once relaxation began. To sustain self-reliance, ${s.subjLow} will trigger a fixed alarm to complete 10 minutes of chores prior to leisure, conduct a 3-minute nightly desk reset, and negotiate shift swaps proactively before exams. Ultimately, we forged a balanced compact: self-monitored chore completion before bedtime in exchange for nag-free trust.`,
          vocab: [['rectify', 'v.', '補救糾正'], ['restore', 'v.', '恢復整潔'], ['neglect', 'n.', '疏忽'], ['postponement', 'n.', '拖延'], ['self-reliance', 'n.', '生活自理'], ['negotiate', 'v.', '協商'], ['compact', 'n.', '公約／協定']]
        }
      }
    },
    safety_health: {
      id: 'safety_health', label: '交通安全與健康',
      enLabel: { A1: 'road safety', A2: 'road safety', B1: 'commuting safety', B2: 'traffic safety habits' },
      kw: /(安全帽|腳踏車|單車|電動自行車|微電車|機車|闖紅燈|闖黃燈|搶快|過馬路|擦撞|摔車|導護|走廊奔跑|實驗室|手搖飲|不吃正餐|受傷|發燒|淋雨|雨衣)/g,
      title: a => `${a}通學交通安全與防護`,
      when: '今天早上上學途中', where: '通學路口與馬路', item: '安全帽與交通規則',
      why: '違反配戴安全帽與遵守號誌的安全紅線', how: '路口搶快被導護老師當場攔下勸導', impact: '潛藏嚴重車禍風險並讓家人後怕',
      d2: '立即停車確認平安無事，向導護老師道謝，並將安全帽固定放於玄關必拿處。',
      d3: '早上出門太趕怕遲到，心存「路很短不會出事」僥倖心態，把安全換成幾十秒方便。',
      d4: '每天提早 10 分鐘從容出門，安全帽放車上做到不戴不上路，路口確實停看聽。',
      d5: '訂立安全公約：安全永遠大於趕時間，寧可遲到報備，絕不沒戴安全帽或搶黃紅燈。',
      levels: {
        A1: {
          text: (s, t) => `${t}, ${s.subj} rode an e-bike to school with no helmet and went fast at a yellow light. A teacher stopped ${s.obj}. First, ${s.subjLow} stopped safely, thanked the teacher, and put the helmet by the door. ${s.Subj} left home late and thought the road was short. Next, ${s.subjLow} will leave 10 minutes early and always wear the helmet. Our safety rule: being safe comes before being fast.`,
          vocab: [['ride (rode)', 'v.', '騎乘'], ['helmet', 'n.', '安全帽'], ['fast', 'adv.', '快速地'], ['light', 'n.', '號誌燈'], ['early', 'adv.', '提早'], ['wear', 'v.', '配戴']]
        },
        A2: {
          text: (s, t) => `${t}, ${s.subj} rode an e-bike to school without a helmet and tried to beat a yellow light until a teacher stopped ${s.obj}. First, ${s.subjLow} stopped safely, thanked the teacher for the warning, and put the helmet right by the front door. The reason was rushing for school. ${s.Subj} thought the trip was short and forgot that one mistake on the road can be very dangerous. Next, ${s.subjLow} will leave home 10 minutes earlier every morning, always wear the helmet, and slow down at every corner. Finally, we agreed on a safety rule: being safe is always more important than being fast. Never run a yellow or red light.`,
          vocab: [['helmet', 'n.', '安全帽'], ['yellow light', 'n.', '黃燈'], ['warning', 'n.', '提醒／警告'], ['rush', 'v.', '趕時間／匆忙'], ['dangerous', 'adj.', '危險的'], ['slow down', 'phr.', '減速'], ['important', 'adj.', '重要的']]
        },
        B1: {
          text: (s, t) => `${t}, ${s.subj} commuted to school on an e-bike without wearing a helmet and attempted to rush through a yellow light, nearly colliding with a turning scooter before a crossing guard teacher intervened. Immediately, ${s.subjLow} pulled over safely, thanked the teacher for the reminder, and placed the helmet in a fixed spot by the front door. The core reason was leaving too late and falling into the false belief that a short ride carries no real danger. Moving forward, ${s.subjLow} will depart 10 minutes earlier each morning, keep the helmet on the bike so it is never forgotten, and pause carefully at every intersection. Together, we set a strict safety standard: personal safety always outweighs saving a few seconds.`,
          vocab: [['commute', 'v.', '通勤'], ['collide', 'v.', '擦撞／碰撞'], ['pull over', 'phr.', '靠邊停車'], ['depart', 'v.', '出發'], ['intersection', 'n.', '十字路口'], ['strict', 'adj.', '嚴格的'], ['outweigh', 'v.', '比……更重要']]
        },
        B2: {
          text: (s, t) => `${t}, ${s.subj} rode an e-bike to school unhelmeted and tried to beat an amber signal, narrowly avoiding a collision with a turning scooter until a duty teacher intervened. Immediately, ${s.subjLow} came to a controlled stop, expressed gratitude for the intervention, and established a visible storage spot for the helmet at the entryway. Fundamentally, morning haste fostered complacency—trading vital protection for mere seconds on a familiar route. To eliminate this hazard, ${s.subjLow} will build in a 10-minute morning buffer, enforce a strict "no helmet, no ride" habit, and practice defensive scanning at every junction. Ultimately, we enshrined a non-negotiable safety principle: arriving intact always supersedes punctuality, with zero tolerance for running signals.`,
          vocab: [['narrowly', 'adv.', '差一點／驚險地'], ['collision', 'n.', '碰撞事故'], ['complacency', 'n.', '僥倖大意'], ['hazard', 'n.', '危險隱患'], ['defensive', 'adj.', '防禦性的'], ['supersede', 'v.', '優先於／取代'], ['non-negotiable', 'adj.', '絕不妥協的']]
        }
      }
    }
  };

  /* -------------------- 狀態管理 -------------------- */
  let activeTone = 'gentle_family';
  let activeCefr = 'A2';
  let activeRTab = 'article';
  let activeMobTab = 'draft';
  let isDemoing = false;
  let data = blankData();

  function blankData() {
    const td = todayStr();
    return {
      reportId: `SAY-${td.replace(/-/g, '')}-${Math.floor(Math.random() * 900 + 100)}`,
      rawInput: '',
      tone: activeTone,
      cefrLevel: activeCefr,
      primaryDomain: '',
      secondaryDomain: '',
      title: '',
      partName: '',
      owner: '',
      dateCreated: td,
      targetCloseDate: addDays(td, 7),
      articleZh: '',
      articleEn: '',
      enVocab: [],
      refinements: [],
      d1: { problemDesc: '', who: '', when: '', where: '', why: '', how: '', impactScope: '' },
      d2: '', d3: '', d4: '', d5: '',
      qaStatus: '觀察改善中'
    };
  }

  function saveDraft() {
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {}
  }

  /* -------------------- 核心雙語結構補完引擎 -------------------- */
  function extractActorAndTime(text) {
    const names = [
      '保健室阿姨', '導護老師', '補習班老師',
      '小宇', '小傑', '小華', '小明', '小強', '小美', '小凱', '阿凱', '阿明',
      '哥哥', '姊姊', '姐姐', '弟弟', '妹妹', '我', '媽媽', '爸爸', '爸媽', '導師', '老師', '同學'
    ].sort((a, b) => b.length - a.length);

    const found = [];
    for (const n of names) {
      if (n === '我') {
        if (text.startsWith('我') || /[，。、\s]我/.test(text)) found.push({ n: '我', pos: text.indexOf('我') });
        continue;
      }
      const pos = text.indexOf(n);
      if (pos !== -1 && !found.some(x => x.n.includes(n) || n.includes(x.n))) {
        found.push({ n, pos });
      }
    }
    found.sort((a, b) => a.pos - b.pos);

    let timeZh = '', timeEn = 'Recently';
    if (text.includes('昨晚') || text.includes('昨天晚上')) { timeZh = '昨晚'; timeEn = 'Last night'; }
    else if (text.includes('今天早上') || text.includes('今早')) { timeZh = '今天早上'; timeEn = 'This morning'; }
    else if (text.includes('昨天')) { timeZh = '昨天'; timeEn = 'Yesterday'; }
    else if (text.includes('這禮拜') || text.includes('這週')) { timeZh = '這週'; timeEn = 'This week'; }
    else if (text.includes('這個月') || text.includes('本月')) { timeZh = '這個月'; timeEn = 'This month'; }
    else if (text.includes('今天')) { timeZh = '今天'; timeEn = 'Today'; }

    return {
      actor: found[0] ? found[0].n : '',
      others: found.slice(1).map(x => x.n),
      timeZh,
      timeEn
    };
  }

  const TONE_EN_FRAME = {
    gentle_family: {
      A1: { open: 'In our family talk: ', close: 'We will help each other with love.' },
      A2: { open: 'Family talk: ', close: 'With care and patience, our family will support each other.' },
      B1: { open: 'In a calm family talk: ', close: 'With mutual understanding, our family can build a better habit together.' },
      B2: { open: 'Supportive family dialogue: ', close: 'Through empathy and steady encouragement, our household will reinforce this positive change.' }
    },
    teen_growth: {
      A1: { open: 'My self-check: ', close: 'I want to do better next time.' },
      A2: { open: 'My reflection: ', close: 'I want to take responsibility and grow stronger from this.' },
      B1: { open: 'Self-reflection: ', close: 'I am determined to take ownership of my habits and keep improving.' },
      B2: { open: 'Personal reflection: ', close: 'I am committed to holding myself accountable and turning this setback into lasting growth.' }
    },
    teacher_record: {
      A1: { open: 'Teacher note: ', close: 'School and home will check progress next week.' },
      A2: { open: 'Guidance record: ', close: 'The teacher and parents will follow up on the student\'s progress together.' },
      B1: { open: 'Counseling summary: ', close: 'Both the school and parents will continue to monitor the student\'s progress and offer guidance.' },
      B2: { open: 'Counseling case summary: ', close: 'School staff and guardians will jointly review behavioral progress and provide ongoing guidance.' }
    }
  };

  function getEnglishSubject(actor, tone) {
    if (tone === 'teen_growth') {
      return { subj: 'I', subjLow: 'I', Subj: 'I', obj: 'me', poss: 'my', we: 'my family and I' };
    }
    if (tone === 'teacher_record') {
      return { subj: 'the student', subjLow: 'the student', Subj: 'The student', obj: 'the student', poss: 'their', we: 'the teacher and parents' };
    }
    const map = {
      '弟弟': { subj: 'my younger brother', subjLow: 'he', Subj: 'He', obj: 'him', poss: 'his', we: 'we' },
      '哥哥': { subj: 'my older brother', subjLow: 'he', Subj: 'He', obj: 'him', poss: 'his', we: 'we' },
      '姊姊': { subj: 'my older sister', subjLow: 'she', Subj: 'She', obj: 'her', poss: 'her', we: 'we' },
      '姐姐': { subj: 'my older sister', subjLow: 'she', Subj: 'She', obj: 'her', poss: 'her', we: 'we' },
      '妹妹': { subj: 'my younger sister', subjLow: 'she', Subj: 'She', obj: 'her', poss: 'her', we: 'we' }
    };
    if (map[actor]) return map[actor];
    if (actor === '我') {
      return { subj: 'I', subjLow: 'I', Subj: 'I', obj: 'me', poss: 'my', we: 'my family and I' };
    }
    return { subj: 'our child', subjLow: 'he or she', Subj: 'He or she', obj: 'them', poss: 'their', we: 'our family' };
  }

  function detectDomains(text) {
    const scored = Object.values(KB)
      .map(d => ({ id: d.id, n: (text.match(d.kw) || []).length }))
      .filter(x => x.n > 0)
      .sort((a, b) => b.n - a.n);
    return {
      primary: scored[0] ? scored[0].id : 'emotion_comm',
      secondary: (scored[1] && scored[1].n >= 1) ? scored[1].id : ''
    };
  }

  function composeZhArticle(d) {
    const cleanRaw = String(d.d1.problemDesc || '').replace(/\s+/g, '').replace(/[。！!]$/, '');
    const prefix = d.tone === 'teen_growth'
      ? '回顧這次事件，'
      : (d.tone === 'teacher_record' ? '本次輔導紀錄摘要：' : '家人好好聊聊這次的事：');
    const closingActor = d.tone === 'teen_growth'
      ? '最後我與家人共同'
      : (d.tone === 'teacher_record' ? '最後親師生共同' : '最後大家一起');
    const s2 = String(d.d2 || '').replace(/[。！!]$/, '');
    const s3 = String(d.d3 || '').replace(/[。！!]$/, '');
    const s4 = String(d.d4 || '').replace(/[。！!]$/, '');
    const s5 = String(d.d5 || '').replace(/[。！!]$/, '');

    const assemble = (rawPart, p2, p3, p4, p5) =>
      `${prefix}${rawPart}。當下先${p2.replace(/^先/, '')}。細想背後原因，主要是${p3.replace(/^因為/, '')}。未來改善方面，${p4}。${closingActor}${p5}。`;

    let article = assemble(cleanRaw, s2, s3, s4, s5);
    if (countZh(article) > MAX_ZH_CHARS) {
      const trimClause = (str, maxLen) =>
        str.length <= maxLen ? str : str.slice(0, maxLen - 1).replace(/[，、；：]$/, '') + '等';
      article = assemble(
        trimClause(cleanRaw, 54),
        trimClause(s2, 42),
        trimClause(s3, 44),
        trimClause(s4, 50),
        trimClause(s5, 46)
      );
    }
    if (countZh(article) > MAX_ZH_CHARS) {
      article = article.slice(0, MAX_ZH_CHARS - 1).replace(/[，、；：]$/, '') + '。';
    }
    return article;
  }

  function translateRefinementByLevel(text, level = 'A2') {
    const lvl = CEFR_META[level] ? level : 'A2';
    if (/(道歉|對不起)/.test(text)) {
      return {
        A1: 'Later, saying sorry made everyone feel good.',
        A2: 'Also, saying sorry nicely helped everyone feel much better.',
        B1: 'In addition, offering a genuine apology afterward helped ease the tension.',
        B2: 'Moreover, a candid apology afterward meaningfully restored mutual goodwill.'
      }[lvl];
    }
    if (/(段考|考試|壓力)/.test(text)) {
      return {
        A1: 'The big test made it hard to feel calm.',
        A2: 'The big test pressure made it even harder to stay relaxed.',
        B1: 'Recent exam stress also made it harder to stay patient and balanced.',
        B2: 'Compounding this, mounting exam pressure significantly strained emotional resilience.'
      }[lvl];
    }
    if (/(11點|十一點|客廳|充電|約定|公約)/.test(text)) {
      return {
        A1: 'We agreed to put the phone in the living room at 11 p.m.',
        A2: 'We clearly agreed to put the phone in the living room before 11 p.m. on school nights.',
        B1: 'We specifically agreed to leave the phone charging in the living room by 11 p.m. on weeknights.',
        B2: 'We formally committed to docking the phone in the living room by 11 p.m. on school nights.'
      }[lvl];
    }
    if (/(洗碗|倒垃圾|家事|補償)/.test(text)) {
      return {
        A1: 'Helping with dishes and trash this week is part of the plan.',
        A2: 'To show responsibility, helping with dishes and trash this week is part of the plan.',
        B1: 'To make amends, taking initiative on washing dishes and taking out the trash is included this week.',
        B2: 'As tangible restitution, proactively handling dishes and waste disposal this week anchors the plan.'
      }[lvl];
    }
    if (/(提早|10分鐘)/.test(text)) {
      return {
        A1: 'Getting up 10 minutes early will also help.',
        A2: 'Getting up 10 minutes earlier will also keep mornings calm.',
        B1: 'Waking up 10 minutes earlier will also create a smoother morning routine.',
        B2: 'Building in a 10-minute morning buffer will likewise prevent avoidable haste.'
      }[lvl];
    }
    return {
      A1: 'We also talked about this and added it to our plan.',
      A2: 'We talked openly about this extra detail and added it to our plan.',
      B1: 'We discussed this additional point openly and incorporated it into our agreement.',
      B2: 'We candidly addressed this supplementary detail and integrated it into our resolution.'
    }[lvl];
  }

  function composeEnglish(d, actorInfo, level = d.cefrLevel || activeCefr) {
    const lvl = CEFR_META[level] ? level : 'A2';
    const toneKey = TONE_EN_FRAME[d.tone] ? d.tone : 'gentle_family';
    const frame = TONE_EN_FRAME[toneKey][lvl] || TONE_EN_FRAME.gentle_family.A2;
    const dom1 = KB[d.primaryDomain] || KB['3c_sleep'];
    const dom2 = d.secondaryDomain ? KB[d.secondaryDomain] : null;
    const s = getEnglishSubject(actorInfo.actor, toneKey);
    const t = actorInfo.timeEn || 'Recently';
    const pack1 = dom1.levels[lvl] || dom1.levels.A2;

    let secondarySentence = '';
    if (dom2) {
      if (dom2.id === 'emotion_comm') {
        secondarySentence = {
          A1: `${s.Subj} also got mad and shut the door hard.`,
          A2: `At the same time, ${s.subjLow} also got angry and closed the door hard.`,
          B1: `At the same time, ${s.subjLow} lost ${s.poss} temper and slammed the door.`,
          B2: `Compounding the situation, ${s.subjLow} reacted defensively and slammed the door.`
        }[lvl];
      } else {
        const lbl = dom2.enLabel[lvl] || dom2.enLabel.A2;
        secondarySentence = {
          A1: `This also made a problem with ${lbl}.`,
          A2: `At the same time, this also caused a problem with ${lbl}.`,
          B1: `Meanwhile, this also led to difficulties with ${lbl}.`,
          B2: `Simultaneously, this spilled over into ${lbl}.`
        }[lvl];
      }
    }

    const baseText = pack1.text(s, t);
    // 將關聯領域句子自然插在第一句之後
    let combined = baseText;
    if (secondarySentence) {
      const firstPeriod = baseText.indexOf('. ');
      if (firstPeriod !== -1) {
        combined = `${baseText.slice(0, firstPeriod + 1)} ${secondarySentence}${baseText.slice(firstPeriod + 1)}`;
      } else {
        combined = `${baseText} ${secondarySentence}`;
      }
    }

    const extra = (d.refinements || []).map(r => translateRefinementByLevel(r, lvl));
    const fullText = `${frame.open}${[combined, ...extra, frame.close].filter(Boolean).join(' ')}`;

    const vocabMap = new Map();
    pack1.vocab.forEach(v => vocabMap.set(v[0], v));
    if (dom2 && dom2.levels[lvl]) {
      dom2.levels[lvl].vocab.slice(0, 2).forEach(v => vocabMap.set(v[0], v));
    }

    return {
      level: lvl,
      en: fullText,
      vocab: Array.from(vocabMap.values()).slice(0, 8)
    };
  }

  function buildFromPlainText(rawText, tone = activeTone, cefr = activeCefr) {
    const clean = String(rawText || '').trim();
    if (!clean) return null;
    const lvl = CEFR_META[cefr] ? cefr : 'A2';
    const actorInfo = extractActorAndTime(clean);
    const { primary, secondary } = detectDomains(clean);
    const d1 = KB[primary];
    const d2 = secondary ? KB[secondary] : null;
    const actor = actorInfo.actor || (tone === 'teen_growth' ? '我' : '同學');

    const out = blankData();
    out.rawInput = clean;
    out.tone = tone;
    out.cefrLevel = lvl;
    out.primaryDomain = primary;
    out.secondaryDomain = secondary;
    out.title = d2 ? `${d1.title(actor)}（併同${d2.label}）` : d1.title(actor);
    out.partName = d1.item;
    out.owner = tone === 'teen_growth' ? actor : (tone === 'teacher_record' ? '導師／輔導老師' : '家長與當事人');

    out.d1 = {
      problemDesc: clean,
      who: `${actor}${actorInfo.others.length ? '、' + actorInfo.others.join('、') : ''}`,
      when: actorInfo.timeZh || d1.when,
      where: d1.where,
      why: d1.why + (d2 ? `，且涉及${d2.label}` : ''),
      how: d1.how,
      impactScope: d1.impact
    };

    if (d2 && d2.id === 'emotion_comm') {
      out.d2 = d1.d2.replace(/。$/, '，同時雙方先各自深呼吸冷靜 15 分鐘。');
      out.d3 = d1.d3.replace(/。$/, '，且情緒緊繃缺少暫停暗號才爆發口角。');
      out.d4 = d1.d4.replace(/。$/, '，並針對衝動口氣誠懇道歉。');
    } else {
      out.d2 = d1.d2;
      out.d3 = d1.d3;
      out.d4 = d1.d4;
    }
    out.d5 = d1.d5;

    out.articleZh = composeZhArticle(out);
    const enPack = composeEnglish(out, actorInfo, lvl);
    out.articleEn = enPack.en;
    out.enVocab = enPack.vocab;
    return out;
  }

  function applySpokenRefinement(sentence) {
    const s = String(sentence || '').trim();
    if (!s) return null;
    let label = '中英短文與對話結構';
    if (/(約定|公約|家規|11點|客廳)/.test(s)) {
      data.d5 = s;
      label = 'D5 共同約定與中英短文';
    } else if (/(因為|原因|壓力|段考)/.test(s)) {
      data.d3 = `${s}，${data.d3}`;
      label = 'D3 背後原因與中英短文';
    } else if (/(補償|洗碗|倒垃圾|以後|願意|提早)/.test(s)) {
      data.d4 = `${s}，並${data.d4}`;
      label = 'D4 改善補償與中英短文';
    } else if (/(當下|事後|道歉|冷靜)/.test(s)) {
      data.d2 = `${s}，並${data.d2}`;
      label = 'D2 當下處置與中英短文';
    } else {
      data.d1.problemDesc = `${data.d1.problemDesc.replace(/[。！!]$/, '')}，${s}。`;
    }

    data.refinements = [...(data.refinements || []).slice(-2), s];
    data.articleZh = composeZhArticle(data);
    const enPack = composeEnglish(data, extractActorAndTime(data.rawInput || data.d1.problemDesc), activeCefr);
    data.cefrLevel = enPack.level;
    data.articleEn = enPack.en;
    data.enVocab = enPack.vocab;

    if (typeof document !== 'undefined') {
      if (isMobileView()) switchMobileTab('draft');
      switchRightTab('article', true);
    }
    return { label, zhLen: countZh(data.articleZh), cefrLevel: enPack.level };
  }

  function applyCefrSwitch(newLevel) {
    if (!CEFR_META[newLevel]) return;
    activeCefr = newLevel;
    data.cefrLevel = newLevel;
    if (data.rawInput || data.d1.problemDesc) {
      const enPack = composeEnglish(data, extractActorAndTime(data.rawInput || data.d1.problemDesc), newLevel);
      data.articleEn = enPack.en;
      data.enVocab = enPack.vocab;
    }
    refreshAllViews(true);
    showToast(`已切換英文難度：${CEFR_META[newLevel].title}`, 'success');
  }

  /* -------------------- 雙軌外部 AI（Gemini / Ollama） -------------------- */
  async function runGenerate() {
    const rawEl = document.getElementById('raw-input');
    const txt = rawEl ? rawEl.value.trim() : '';
    if (!txt) { showToast('請先說說發生的事情！', 'warning'); return; }
    const provider = document.getElementById('llm-provider').value;
    const btn = document.getElementById('btn-generate');
    btn.disabled = true;
    btn.textContent = `整理短文與 ${activeCefr} 翻譯中...`;
    try {
      if (provider === 'offline') {
        data = buildFromPlainText(txt, activeTone, activeCefr);
        if (isMobileView()) switchMobileTab('draft');
        switchRightTab('article', true);
        showToast(`已整理成 ${countZh(data.articleZh)} 字短文與 ${CEFR_META[activeCefr].title} 翻譯！`, 'success');
      } else {
        await callExternalAi(provider, txt);
      }
    } finally {
      btn.disabled = false;
      btn.textContent = '幫我整理成 300字短文 ＋ 英文翻譯';
    }
  }

  async function callExternalAi(provider, rawText) {
    const apiKey = document.getElementById('llm-api-key').value.trim();
    const model = document.getElementById('llm-model-name').value.trim() || (provider === 'ollama' ? 'qwen2.5' : 'gemini-2.5-flash');
    if (provider === 'gemini' && !apiKey) {
      data = buildFromPlainText(rawText, activeTone, activeCefr);
      if (isMobileView()) switchMobileTab('draft');
      switchRightTab('article', true);
      showToast('未填 API Key，已改由離線雙語引擎生成。', 'warning');
      return;
    }

    const cefrInfo = CEFR_META[activeCefr] || CEFR_META.A2;
    const prompt = `你現在是「如果跟我這樣說.....」雙語對話整理助手。請將以下台灣國高中生口語白話情境，自動補足為完整結構（發生經過、當下處置、真正原因、改善補償、共同約定）的繁體中文短文與英文翻譯。
嚴格要求：
1. articleZh：流暢自然的完整結構中文文章，總字數絕對不可超過 300 字（建議 200～270 字），語氣為「${TONE_LABELS[activeTone]}」。
2. articleEn：對應的英文翻譯，必須嚴格符合【${cefrInfo.promptSpec}】。
3. enVocab：列出本篇用到的 6～8 個符合 CEFR ${cefrInfo.code} 難度的重點單字陣列，每項格式為 ["word", "詞性", "中文意思"]。
4. 同步回傳 d1{who,when,where,why,how,impactScope}, d2, d3, d4, d5, title。
口語情境：${rawText.slice(0, 2000)}
請嚴格輸出純 JSON。`;

    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 30000);
    try {
      let parsed;
      if (provider === 'gemini') {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          signal: ctrl.signal,
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: 'application/json' }
          })
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        parsed = JSON.parse((await res.json()).candidates[0].content.parts[0].text);
      } else {
        const res = await fetch('http://localhost:11434/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: ctrl.signal,
          body: JSON.stringify({ model, prompt, stream: false, format: 'json' })
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        parsed = JSON.parse((await res.json()).response);
      }
      clearTimeout(tid);
      const base = buildFromPlainText(rawText, activeTone, activeCefr);
      const vocab = Array.isArray(parsed.enVocab) ? parsed.enVocab : (Array.isArray(parsed.a2Vocab) ? parsed.a2Vocab : base.enVocab);
      data = Object.assign(base, parsed, {
        rawInput: rawText,
        tone: activeTone,
        cefrLevel: activeCefr,
        enVocab: vocab,
        d1: Object.assign(base.d1, parsed.d1 || {})
      });
      if (countZh(data.articleZh) > MAX_ZH_CHARS) {
        data.articleZh = data.articleZh.slice(0, MAX_ZH_CHARS - 1).replace(/[，、；：]$/, '') + '。';
      }
      if (isMobileView()) switchMobileTab('draft');
      switchRightTab('article', true);
      showToast(`${provider === 'gemini' ? 'Gemini' : 'Ollama'} 雙語短文（${activeCefr}）生成完成！`, 'success');
    } catch (e) {
      clearTimeout(tid);
      data = buildFromPlainText(rawText, activeTone, activeCefr);
      if (isMobileView()) switchMobileTab('draft');
      switchRightTab('article', true);
      showToast('外部 AI 連線失敗或逾時，已改由離線雙語引擎生成。', 'warning');
    }
  }

  /* -------------------- 視圖渲染與手機/桌機導覽 -------------------- */
  function getVocabList(d) {
    return Array.isArray(d.enVocab) && d.enVocab.length ? d.enVocab : (Array.isArray(d.a2Vocab) ? d.a2Vocab : []);
  }

  function buildA4Html() {
    const zhLen = countZh(data.articleZh);
    const cefr = CEFR_META[data.cefrLevel] || CEFR_META.A2;
    const vocab = getVocabList(data);
    return `
      <div class="a4-mini">
        <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:8px;border-bottom:2px solid #1b4d5c;padding-bottom:8px;margin-bottom:8px;flex-wrap:wrap;">
          <div>
            <div style="font-size:15px;font-weight:800;color:#1b4d5c;">如果跟我這樣說..... — 雙語短文與約定單</div>
            <div style="font-size:10.5px;color:#64748b;">${escapeHtml(data.title)}（${escapeHtml(TONE_LABELS[data.tone])}｜中文 ${zhLen} 字｜${escapeHtml(cefr.title)}）</div>
          </div>
          <div style="font-size:10.5px;color:#475569;">${escapeHtml(data.reportId)} ｜ ${escapeHtml(data.dateCreated)}</div>
        </div>
        <div class="a4-sec">一、如果跟我這樣說.....（中文完整短文 ${zhLen} / 300 字）</div>
        <div class="a4-essay">${escapeHtml(data.articleZh || '尚未生成')}</div>
        <div class="a4-sec">二、英文翻譯（${escapeHtml(cefr.title)}）</div>
        <div class="a4-essay" style="font-family:Segoe UI,Arial,sans-serif;">${escapeHtml(data.articleEn || 'Not generated yet.')}</div>
        <div class="a4-sec">三、CEFR ${escapeHtml(cefr.code)} 核心單字庫</div>
        <table class="a4-table">
          <tr>${vocab.slice(0, 4).map(v => `<td><strong>${escapeHtml(v[0])}</strong> <span style="color:#64748b;">(${escapeHtml(v[1])})</span> ${escapeHtml(v[2])}</td>`).join('')}</tr>
          ${vocab.length > 4 ? `<tr>${vocab.slice(4, 8).map(v => `<td><strong>${escapeHtml(v[0])}</strong> <span style="color:#64748b;">(${escapeHtml(v[1])})</span> ${escapeHtml(v[2])}</td>`).join('')}</tr>` : ''}
        </table>
        <div class="a4-sec">四、對話結構摘要與雙方親筆簽認</div>
        <table class="a4-table">
          <tr><th style="width:18%;">D1 發生經過</th><td>${escapeHtml(data.d1.who)}｜${escapeHtml(data.d1.when)}｜${escapeHtml(data.d1.impactScope)}</td></tr>
          <tr><th>D2 當下處置</th><td>${escapeHtml(data.d2)}</td></tr>
          <tr><th>D3 背後原因</th><td>${escapeHtml(data.d3)}</td></tr>
          <tr><th>D4 改善補償</th><td>${escapeHtml(data.d4)}</td></tr>
          <tr><th>D5 共同約定</th><td><strong>${escapeHtml(data.d5)}</strong></td></tr>
        </table>
        <table class="a4-table" style="margin-bottom:0;">
          <tr><th style="width:18%;">當事人簽名</th><td style="width:32%;height:34px;color:#94a3b8;font-size:10px;vertical-align:bottom;">（請親筆簽名）</td><th style="width:18%;">家長／師長簽名</th><td style="width:32%;height:34px;color:#94a3b8;font-size:10px;vertical-align:bottom;">（請親筆簽名）</td></tr>
        </table>
      </div>`;
  }

  function updateCounters() {
    saveDraft();
    if (typeof document === 'undefined') return;
    const len = countZh(data.articleZh);
    const cefrCode = (CEFR_META[data.cefrLevel] || CEFR_META.A2).code;

    const pill = document.getElementById('char-count-pill');
    if (pill) {
      pill.textContent = `${len}/300字`;
      pill.classList.toggle('over-limit', len > MAX_ZH_CHARS);
    }
    const cefrPill = document.getElementById('cefr-pill');
    if (cefrPill) cefrPill.textContent = `CEFR ${cefrCode}`;

    const quickSpeak = document.getElementById('btn-speak-en-quick');
    if (quickSpeak) quickSpeak.textContent = `🔊 朗讀 ${cefrCode} 英文`;

    const badge = document.getElementById('inline-zh-count');
    if (badge) {
      badge.textContent = `${len} / 300 字${len <= MAX_ZH_CHARS ? ' ✓' : '（超過上限）'}`;
      badge.className = `badge ${len <= MAX_ZH_CHARS ? 'badge-fact' : 'badge-danger'}`;
    }
    const printMount = document.getElementById('print-mount');
    if (printMount) printMount.innerHTML = buildA4Html();
  }

  function refreshAllViews(pulse = false) {
    updateCounters();
    if (typeof document === 'undefined') return;

    const domBadges = document.getElementById('domain-badges');
    if (domBadges) {
      const tags = [];
      if (KB[data.primaryDomain]) tags.push(`<span class="dom-tag">${escapeHtml(KB[data.primaryDomain].label)}</span>`);
      if (KB[data.secondaryDomain]) tags.push(`<span class="dom-tag">＋${escapeHtml(KB[data.secondaryDomain].label)}</span>`);
      domBadges.innerHTML = tags.join('');
    }

    const canvas = document.getElementById('right-canvas');
    if (!canvas) return;

    if (!data.articleZh && !data.d1.problemDesc) {
      canvas.innerHTML = `
        <div class="empty-state">
          <h3>如果跟我這樣說..... — 1～2 句白話變 300 字好文章</h3>
          <p>系統會自動補足完整對話結構（發生經過、當下處置、背後原因、改善補償、共同約定），並提供可切換 CEFR A1／A2／B1／B2 難度的英文翻譯、單字卡與發音朗讀。</p>
          <button type="button" class="btn btn-primary btn-touch mob-only" data-go-mob="input">先說說發生的事</button>
        </div>`;
      return;
    }

    if (activeRTab === 'article') {
      const len = countZh(data.articleZh);
      const cefr = CEFR_META[data.cefrLevel] || CEFR_META.A2;
      const vocab = getVocabList(data);
      canvas.innerHTML = `
        <div class="bilingual-stack">
          <div class="article-card">
            <div class="article-card-head">
              <div class="article-card-title">
                <strong>如果跟我這樣說.....（中文完整短文）</strong>
                <span id="inline-zh-count" class="badge ${len <= MAX_ZH_CHARS ? 'badge-fact' : 'badge-danger'}">${len} / 300 字${len <= MAX_ZH_CHARS ? ' ✓' : '（超過上限）'}</span>
              </div>
              <div class="row-gap">
                <button type="button" class="btn btn-secondary btn-mini" data-resync="1">依結構重組</button>
                <button type="button" class="btn btn-secondary btn-mini" data-copy="zh">複製中文</button>
              </div>
            </div>
            <textarea rows="4" class="article-textarea" data-edit="articleZh">${escapeHtml(data.articleZh)}</textarea>
            <div class="check-pills">
              <span class="check-pill">✓ D1 發生經過</span>
              <span class="check-pill">✓ D2 當下處理</span>
              <span class="check-pill">✓ D3 背後原因</span>
              <span class="check-pill">✓ D4 改善補償</span>
              <span class="check-pill">✓ D5 共同約定</span>
            </div>
          </div>

          <div class="article-card">
            <div class="article-card-head">
              <div class="article-card-title">
                <strong>英文翻譯（${escapeHtml(cefr.title)}）</strong>
                <span class="badge badge-inferred">${escapeHtml(TONE_LABELS[data.tone] || TONE_LABELS.gentle_family)}</span>
                <div class="cefr-switch" role="radiogroup" aria-label="切換英文字彙難度">
                  ${CEFR_ORDER.map(lv => `<button type="button" class="cefr-btn${lv === cefr.code ? ' active' : ''}" data-cefr="${lv}" aria-checked="${lv === cefr.code}" title="${escapeHtml(CEFR_META[lv].title)}">${lv}</button>`).join('')}
                </div>
              </div>
              <div class="row-gap">
                <button type="button" class="btn btn-secondary btn-mini" data-speak="1.0">🔊 朗讀</button>
                <button type="button" class="btn btn-secondary btn-mini" data-speak="0.78">🐢 慢速</button>
                <button type="button" class="btn btn-secondary btn-mini" data-copy="en">複製英文</button>
              </div>
            </div>
            <textarea rows="4" class="article-textarea en-text" data-edit="articleEn">${escapeHtml(data.articleEn)}</textarea>
            <div>
              <div class="vocab-section-title">本篇 CEFR ${escapeHtml(cefr.code)}（${escapeHtml(cefr.short)}）核心單字（點擊發音）：</div>
              <div class="vocab-grid">
                ${vocab.map(v => `
                  <button type="button" class="vocab-chip" data-word="${escapeHtml(v[0])}">
                    <span class="vocab-word">${escapeHtml(v[0])}</span>
                    <span class="vocab-pos">(${escapeHtml(v[1])})</span>
                    <span>${escapeHtml(v[2])}</span>
                  </button>`).join('')}
              </div>
            </div>
          </div>
        </div>`;
    } else if (activeRTab === 'd1') {
      canvas.innerHTML = `
        <div class="step-stack">
          <div class="step-heading">D1 發生經過（修改後回「中英短文」可一鍵重組）</div>
          <div class="grid-2">
            <div class="field col-span-2"><label>事件標題</label><input class="control" data-edit="title" value="${escapeHtml(data.title)}"></div>
            <div class="field"><label>Who 人物</label><input class="control" data-edit="d1.who" value="${escapeHtml(data.d1.who)}"></div>
            <div class="field"><label>When 時間</label><input class="control" data-edit="d1.when" value="${escapeHtml(data.d1.when)}"></div>
            <div class="field"><label>Where 地點</label><input class="control" data-edit="d1.where" value="${escapeHtml(data.d1.where)}"></div>
            <div class="field"><label>How 察覺</label><input class="control" data-edit="d1.how" value="${escapeHtml(data.d1.how)}"></div>
            <div class="field col-span-2"><label>Why 約定</label><input class="control" data-edit="d1.why" value="${escapeHtml(data.d1.why)}"></div>
            <div class="field col-span-2"><label>影響範圍</label><input class="control" data-edit="d1.impactScope" value="${escapeHtml(data.d1.impactScope)}"></div>
          </div>
        </div>`;
    } else if (['d2', 'd3', 'd4', 'd5'].includes(activeRTab)) {
      const titles = {
        d2: 'D2：當下緊急處置（先穩住現場與情緒）',
        d3: 'D3：背後真正原因（不貼標籤找動機）',
        d4: 'D4：未來改善與補償作法',
        d5: 'D5：共同訂立的生活約定'
      };
      canvas.innerHTML = `
        <div class="step-stack">
          <div class="step-heading">${titles[activeRTab]}</div>
          <textarea rows="5" class="article-textarea" data-edit="${activeRTab}">${escapeHtml(data[activeRTab])}</textarea>
          <div><button type="button" class="btn btn-primary btn-touch" data-resync="1">套用修改並同步更新 300 字短文</button></div>
        </div>`;
    } else if (activeRTab === 'a4') {
      canvas.innerHTML = buildA4Html();
    }

    canvas.scrollTop = 0;
    if (pulse) {
      canvas.classList.remove('pulse-ring');
      void canvas.offsetWidth;
      canvas.classList.add('pulse-ring');
    }
  }

  function switchRightTab(tabId, pulse = false) {
    activeRTab = tabId;
    if (typeof document === 'undefined') return;
    document.querySelectorAll('#right-tabs .rtab').forEach(b => {
      const act = b.dataset.rtab === tabId;
      b.classList.toggle('active', act);
      if (act && b.scrollIntoView) b.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    });
    const idx = TAB_ORDER.indexOf(tabId);
    const prevBtn = document.getElementById('btn-prev-tab');
    const nextBtn = document.getElementById('btn-next-tab');
    if (prevBtn) prevBtn.disabled = idx <= 0;
    if (nextBtn) {
      nextBtn.textContent = (isMobileView() && tabId === 'd5') ? '前往 A4 / 匯出 →' : '下一頁 →';
      nextBtn.disabled = !isMobileView() && idx >= TAB_ORDER.length - 1;
    }
    refreshAllViews(pulse);
  }

  function switchMobileTab(mTab) {
    activeMobTab = mTab;
    if (typeof document === 'undefined') return;
    const paneIn = document.getElementById('pane-input');
    const paneRef = document.getElementById('pane-refine');
    const paneRight = document.getElementById('pane-right');
    const leftWrap = document.getElementById('left-wrapper');
    const rightTabsBar = document.getElementById('right-tabs-bar');
    const mobExpBar = document.getElementById('mob-export-bar');
    const stepFoot = document.getElementById('step-nav-footer');

    paneIn.classList.toggle('mob-active', mTab === 'input');
    paneRef.classList.toggle('mob-active', mTab === 'refine');
    paneRight.classList.toggle('mob-active', mTab === 'draft' || mTab === 'export');

    if (isMobileView()) {
      leftWrap.style.display = (mTab === 'input' || mTab === 'refine') ? 'flex' : 'none';
      rightTabsBar.style.display = mTab === 'export' ? 'none' : 'flex';
      mobExpBar.hidden = mTab !== 'export';
      stepFoot.style.display = mTab === 'export' ? 'none' : 'flex';
    } else {
      leftWrap.style.display = '';
      rightTabsBar.style.display = '';
      mobExpBar.hidden = true;
      stepFoot.style.display = '';
    }

    document.querySelectorAll('#mobile-bottom-nav .mnav').forEach(b => {
      b.classList.toggle('active', b.dataset.mtab === mTab);
    });

    if (mTab === 'export') switchRightTab('a4');
    else if (mTab === 'draft' && activeRTab === 'a4') switchRightTab('article');
  }

  function applyToneSwitch(newTone) {
    activeTone = newTone;
    if (typeof document !== 'undefined') {
      document.querySelectorAll('.seg-btn').forEach(b => {
        const act = b.dataset.tone === newTone;
        b.classList.toggle('active', act);
        b.setAttribute('aria-checked', String(act));
      });
    }
    if (!data.rawInput && !data.d1.problemDesc) return;
    data.tone = newTone;
    data.articleZh = composeZhArticle(data);
    const enPack = composeEnglish(data, extractActorAndTime(data.rawInput || data.d1.problemDesc), activeCefr);
    data.articleEn = enPack.en;
    data.enVocab = enPack.vocab;
    refreshAllViews(true);
    showToast(`已切換為「${TONE_LABELS[newTone]}」，中英短文已同步更新！`, 'success');
  }

  /* -------------------- Word & 16:9 雙語 PPTX 匯出 -------------------- */
  function downloadBlob(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  }

  function exportWord() {
    if (!data.articleZh) { showToast('請先整理出中英短文！', 'warning'); return; }
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><style>@page S{size:595.3pt 841.9pt;margin:1.8cm;}body{font-family:'Microsoft JhengHei',sans-serif;font-size:10pt;}table{width:100%;border-collapse:collapse;margin-bottom:8pt;}th,td{border:1px solid #b5c2bc;padding:5pt;font-size:9.2pt;}th{background:#f8fafc;color:#1b4d5c;}</style></head><body>${buildA4Html()}</body></html>`;
    downloadBlob(new Blob(['\ufeff' + html], { type: 'application/msword;charset=utf-8' }), `如果跟我這樣說_${sanitizeFilename(data.reportId)}.doc`);
    showToast('已匯出雙語 Word (.doc)！', 'success');
  }

  const CRC_T = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      t[i] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = CRC_T[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  function zipStore(files) {
    const enc = new TextEncoder(), ch = [], cd = [];
    let off = 0;
    files.forEach(f => {
      const nb = enc.encode(f.n), db = enc.encode(f.d), crc = crc32(db), len = db.length;
      const lf = new Uint8Array(30 + nb.length), lv = new DataView(lf.buffer);
      lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0x0800, true);
      lv.setUint32(14, crc, true); lv.setUint32(18, len, true); lv.setUint32(22, len, true);
      lv.setUint16(26, nb.length, true); lf.set(nb, 30);
      ch.push(lf, db);

      const ce = new Uint8Array(46 + nb.length), cv = new DataView(ce.buffer);
      cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true);
      cv.setUint16(8, 0x0800, true); cv.setUint32(16, crc, true); cv.setUint32(20, len, true);
      cv.setUint32(24, len, true); cv.setUint16(28, nb.length, true); cv.setUint32(42, off, true);
      ce.set(nb, 46);
      cd.push(ce);
      off += lf.length + db.length;
    });
    const cdStart = off;
    let cdSize = 0;
    cd.forEach(c => { ch.push(c); cdSize += c.length; });
    const eo = new Uint8Array(22), ev = new DataView(eo.buffer);
    ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, files.length, true);
    ev.setUint16(10, files.length, true); ev.setUint32(12, cdSize, true); ev.setUint32(16, cdStart, true);
    ch.push(eo);
    const out = new Uint8Array(ch.reduce((a, b) => a + b.length, 0));
    let p = 0;
    ch.forEach(c => { out.set(c, p); p += c.length; });
    return out;
  }

  function buildPptxUint8Array(d) {
    const cefr = CEFR_META[d.cefrLevel] || CEFR_META.A2;
    const vocab = getVocabList(d);
    const slides = [
      { bg: '14222B', tc: 'FFFFFF', bc: 'DCE7EC', t: d.title || '如果跟我這樣說.....', sub: `如果跟我這樣說..... | 中文 ${countZh(d.articleZh)}字 | CEFR ${cefr.code}`, lines: [`紀錄編號：${d.reportId}`, `建立日期：${d.dateCreated}`, `語氣風格：${TONE_LABELS[d.tone] || ''}｜英文難度：${cefr.title}`] },
      { bg: 'FFFFFF', tc: '1B4D5C', bc: '14222B', t: `如果跟我這樣說.....（${countZh(d.articleZh)} / 300 字）`, sub: 'STRUCTURED CHINESE ARTICLE', lines: [d.articleZh] },
      { bg: 'FFFFFF', tc: '1B4D5C', bc: '14222B', t: `英文翻譯（${cefr.title}）`, sub: `CEFR ${cefr.code} ENGLISH VERSION`, lines: [d.articleEn] },
      { bg: 'FFFFFF', tc: '1B4D5C', bc: '14222B', t: `CEFR ${cefr.code} 核心單字庫`, sub: `KEY ${cefr.code} VOCABULARY`, lines: vocab.map(v => `${v[0]} (${v[1]}) — ${v[2]}`) },
      { bg: 'FFFFFF', tc: '1B4D5C', bc: '14222B', t: '對話結構拆解與共同約定', sub: 'DIALOGUE SUMMARY', lines: [`D1 經過：${d.d1.who}｜${d.d1.when}｜${d.d1.impactScope}`, `D2 處置：${d.d2}`, `D3 原因：${d.d3}`, `D4 改善：${d.d4}`, `D5 約定：${d.d5}`] }
    ];
    const mkSlide = s => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="${s.bg}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr><p:sp><p:nvSpPr><p:cNvPr id="2" name="T"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="685800" y="457200"/><a:ext cx="10820400" cy="1005840"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr wrap="square"/><a:lstStyle/><a:p><a:r><a:rPr lang="zh-TW" sz="2400" b="1"><a:solidFill><a:srgbClr val="${s.tc}"/></a:solidFill><a:ea typeface="Microsoft JhengHei"/></a:rPr><a:t>${escapeXml(s.t)}</a:t></a:r></a:p><a:p><a:r><a:rPr lang="en-US" sz="1100" b="1"><a:solidFill><a:srgbClr val="697A86"/></a:solidFill></a:rPr><a:t>${escapeXml(s.sub)}</a:t></a:r></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id="3" name="B"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="685800" y="1645920"/><a:ext cx="10820400" cy="4663440"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr wrap="square"/><a:lstStyle/>${s.lines.map(l => `<a:p><a:pPr><a:spcBef><a:spcPts val="600"/></a:spcBef></a:pPr><a:r><a:rPr lang="zh-TW" sz="1700"><a:solidFill><a:srgbClr val="${s.bc}"/></a:solidFill><a:ea typeface="Microsoft JhengHei"/></a:rPr><a:t>${escapeXml(l)}</a:t></a:r></a:p>`).join('')}</p:txBody></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;

    const files = [
      { n: '[Content_Types].xml', d: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>${slides.map((_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join('')}</Types>` },
      { n: '_rels/.rels', d: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>` },
      { n: 'ppt/presentation.xml', d: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${slides.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 2}"/>`).join('')}</p:sldIdLst><p:sldSz cx="12192000" cy="6858000" type="screen16x9"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>` },
      { n: 'ppt/_rels/presentation.xml.rels', d: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>${slides.map((_, i) => `<Relationship Id="rId${i + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i + 1}.xml"/>`).join('')}</Relationships>` },
      { n: 'ppt/slideMasters/slideMaster1.xml', d: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst></p:sldMaster>` },
      { n: 'ppt/slideMasters/_rels/slideMaster1.xml.rels', d: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>` },
      { n: 'ppt/slideLayouts/slideLayout1.xml', d: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld></p:sldLayout>` },
      { n: 'ppt/slideLayouts/_rels/slideLayout1.xml.rels', d: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>` }
    ];
    slides.forEach((s, i) => {
      files.push({ n: `ppt/slides/slide${i + 1}.xml`, d: mkSlide(s) });
      files.push({ n: `ppt/slides/_rels/slide${i + 1}.xml.rels`, d: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>` });
    });
    return zipStore(files);
  }

  async function exportPpt() {
    if (!data.articleZh) { showToast('請先整理出中英短文！', 'warning'); return; }
    const cefr = CEFR_META[data.cefrLevel] || CEFR_META.A2;
    const vocab = getVocabList(data);
    const fileName = `如果跟我這樣說_${cefr.code}_雙語簡報_${sanitizeFilename(data.reportId)}.pptx`;
    try {
      if (typeof window !== 'undefined' && typeof window.PptxGenJS === 'function') {
        const pptx = new window.PptxGenJS();
        pptx.layout = 'LAYOUT_16x9';
        pptx.title = data.title || '如果跟我這樣說.....';

        const s1 = pptx.addSlide();
        s1.background = { color: '14222B' };
        s1.addText(data.title || '如果跟我這樣說.....', { x: 0.7, y: 1.5, w: 11.9, h: 1.2, fontSize: 30, bold: true, color: 'FFFFFF', fontFace: 'Microsoft JhengHei' });
        s1.addText(`如果跟我這樣說..... ｜ 中文 ${countZh(data.articleZh)} / 300 字 ｜ ${cefr.title}`, { x: 0.7, y: 2.8, w: 11.9, h: 0.6, fontSize: 15, color: 'A7DFD4', fontFace: 'Microsoft JhengHei' });
        s1.addText(`紀錄編號：${data.reportId}   建立日期：${data.dateCreated}   語氣：${TONE_LABELS[data.tone]}`, { x: 0.7, y: 3.6, w: 11.9, h: 0.6, fontSize: 13, color: 'DCE7EC', fontFace: 'Microsoft JhengHei' });

        const addCardSlide = (heading, sub, bodyText, font = 'Microsoft JhengHei', size = 18) => {
          const sl = pptx.addSlide();
          sl.background = { color: 'FFFFFF' };
          sl.addText(heading, { x: 0.6, y: 0.45, w: 12.1, h: 0.7, fontSize: 22, bold: true, color: '1B4D5C', fontFace: 'Microsoft JhengHei' });
          sl.addText(sub, { x: 0.6, y: 1.05, w: 12.1, h: 0.35, fontSize: 11, bold: true, color: '697A86', fontFace: 'Segoe UI' });
          sl.addText(bodyText, { x: 0.6, y: 1.6, w: 12.1, h: 5.1, fontSize: size, color: '14222B', fontFace: font, valign: 'top', lineSpacingMultiple: 1.35 });
        };

        addCardSlide(`如果跟我這樣說.....（${countZh(data.articleZh)} / 300 字）`, 'STRUCTURED CHINESE ARTICLE', data.articleZh, 'Microsoft JhengHei', 19);
        addCardSlide(`英文翻譯（${cefr.title}）`, `CEFR ${cefr.code} ENGLISH VERSION`, data.articleEn, 'Segoe UI', 17);
        addCardSlide(`CEFR ${cefr.code} 核心單字庫`, `KEY ${cefr.code} VOCABULARY`, vocab.map(v => `• ${v[0]} (${v[1]}) — ${v[2]}`).join('\n'), 'Microsoft JhengHei', 17);
        addCardSlide('對話結構拆解與共同約定', 'DIALOGUE SUMMARY', [
          `D1 發生經過：${data.d1.who}｜${data.d1.when}｜${data.d1.impactScope}`,
          `D2 當下處置：${data.d2}`,
          `D3 背後原因：${data.d3}`,
          `D4 改善補償：${data.d4}`,
          `D5 共同約定：${data.d5}`
        ].join('\n\n'), 'Microsoft JhengHei', 15);

        await pptx.writeFile({ fileName });
        showToast('已匯出 16:9 雙語簡報 (.pptx)！', 'success');
        return;
      }
    } catch (err) {
      // 若 PptxGenJS 載入異常則自動降級回內建 OOXML 產生器
    }
    const bytes = buildPptxUint8Array(data);
    downloadBlob(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }), fileName);
    showToast('已匯出 16:9 雙語簡報 (.pptx)！', 'success');
  }

  /* -------------------- 自動示範與事件初始化 -------------------- */
  async function runDemo() {
    if (isDemoing) return;
    isDemoing = true;
    const btn = document.getElementById('btn-auto-demo');
    btn.disabled = true;
    btn.textContent = '示範中...';
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    try {
      if (isMobileView()) switchMobileTab('input');
      const raw = document.getElementById('raw-input');
      raw.value = '';
      for (const ch of SCENARIOS.compound_3c_emotion) {
        raw.value += ch;
        await sleep(16);
      }
      await sleep(220);
      data = buildFromPlainText(SCENARIOS.compound_3c_emotion, activeTone, activeCefr);
      if (isMobileView()) switchMobileTab('draft');
      switchRightTab('article', true);
      showToast(`已整理成 ${countZh(data.articleZh)} 字短文 ＋ ${CEFR_META[activeCefr].title}！`, 'success');
      await sleep(1100);
      applyCefrSwitch(activeCefr === 'B1' ? 'A2' : 'B1');
    } finally {
      isDemoing = false;
      btn.disabled = false;
      btn.textContent = '自動示範';
    }
  }

  function initBrowser() {
    document.getElementById('mobile-bottom-nav').addEventListener('click', e => {
      const b = e.target.closest('.mnav');
      if (b) switchMobileTab(b.dataset.mtab);
    });
    window.addEventListener('resize', () => switchMobileTab(activeMobTab));

    document.getElementById('right-tabs').addEventListener('click', e => {
      const b = e.target.closest('.rtab');
      if (b) switchRightTab(b.dataset.rtab);
    });
    document.getElementById('btn-prev-tab').addEventListener('click', () => {
      const i = TAB_ORDER.indexOf(activeRTab);
      if (i > 0) switchRightTab(TAB_ORDER[i - 1]);
    });
    document.getElementById('btn-next-tab').addEventListener('click', () => {
      if (isMobileView() && activeRTab === 'd5') { switchMobileTab('export'); return; }
      const i = TAB_ORDER.indexOf(activeRTab);
      if (i < TAB_ORDER.length - 1) switchRightTab(TAB_ORDER[i + 1]);
    });

    document.getElementById('scenario-select').addEventListener('change', e => {
      const t = SCENARIOS[e.target.value];
      if (t) {
        document.getElementById('raw-input').value = t;
        data = buildFromPlainText(t, activeTone, activeCefr);
        if (isMobileView()) switchMobileTab('draft');
        switchRightTab('article', true);
        showToast(`已整理成 ${countZh(data.articleZh)} 字短文與 ${CEFR_META[activeCefr].title}！`, 'success');
      }
    });

    document.getElementById('btn-generate').addEventListener('click', runGenerate);
    document.getElementById('btn-auto-demo').addEventListener('click', runDemo);
    document.addEventListener('keydown', e => {
      if (e.altKey && (e.key === 'd' || e.key === 'D')) { e.preventDefault(); runDemo(); }
    });
    document.querySelectorAll('.seg-btn').forEach(b => {
      b.addEventListener('click', () => applyToneSwitch(b.dataset.tone));
    });

    const doRefine = () => {
      const inp = document.getElementById('refine-input');
      const v = inp.value.trim();
      if (!v) { showToast('請輸入要補充的白話句子！', 'warning'); return; }
      const res = applySpokenRefinement(v);
      inp.value = '';
      const fb = document.getElementById('refine-feedback');
      fb.textContent = `已融入【${res.label}】，目前中文 ${res.zhLen} / 300 字（英文 ${res.cefrLevel}）！`;
      fb.hidden = false;
      showToast('已即時融入並重寫中英雙語短文！', 'success');
    };
    document.getElementById('btn-apply-refine').addEventListener('click', doRefine);
    document.getElementById('refine-input').addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); doRefine(); }
    });
    document.getElementById('refine-hints').addEventListener('click', e => {
      const c = e.target.closest('.hint-chip');
      if (c) {
        const i = document.getElementById('refine-input');
        i.value = c.dataset.refine;
        i.focus();
      }
    });

    document.getElementById('btn-copy-both').addEventListener('click', async () => {
      const cefrCode = (CEFR_META[data.cefrLevel] || CEFR_META.A2).code;
      const txt = `【${data.title}】\n\n${data.articleZh}\n\n[English - CEFR ${cefrCode}]\n${data.articleEn}`;
      try {
        await navigator.clipboard.writeText(txt);
        showToast('已複製中英雙語全文！', 'success');
      } catch (e) {
        showToast('請直接選取文字框複製。', 'warning');
      }
    });
    document.getElementById('btn-speak-en-quick').addEventListener('click', () => speakText(data.articleEn, 0.95));

    const canvas = document.getElementById('right-canvas');
    canvas.addEventListener('click', async e => {
      const gm = e.target.closest('[data-go-mob]');
      if (gm) { switchMobileTab(gm.dataset.goMob); return; }

      const cf = e.target.closest('[data-cefr]');
      if (cf) { applyCefrSwitch(cf.dataset.cefr); return; }

      const cp = e.target.closest('[data-copy]');
      if (cp) {
        const val = cp.dataset.copy === 'zh' ? data.articleZh : data.articleEn;
        try {
          await navigator.clipboard.writeText(val);
          showToast(cp.dataset.copy === 'zh' ? '已複製中文短文！' : `已複製 CEFR ${activeCefr} 英文翻譯！`, 'success');
        } catch (err) {}
        return;
      }

      const sp = e.target.closest('[data-speak]');
      if (sp) { speakText(data.articleEn, Number(sp.dataset.speak)); return; }

      const wd = e.target.closest('[data-word]');
      if (wd) { speakText(wd.dataset.word, 0.9); return; }

      const rs = e.target.closest('[data-resync]');
      if (rs) {
        data.articleZh = composeZhArticle(data);
        const enPack = composeEnglish(data, extractActorAndTime(data.rawInput || data.d1.problemDesc), activeCefr);
        data.articleEn = enPack.en;
        data.enVocab = enPack.vocab;
        switchRightTab('article', true);
        showToast(`已依結構重組（${countZh(data.articleZh)} / 300 字｜CEFR ${activeCefr}）！`, 'success');
      }
    });

    canvas.addEventListener('input', e => {
      const ed = e.target.closest('[data-edit]');
      if (ed) {
        setPath(data, ed.dataset.edit, ed.value);
        updateCounters();
      }
    });

    const aiModal = document.getElementById('ai-modal');
    document.getElementById('btn-open-ai').addEventListener('click', () => { aiModal.hidden = false; });
    document.getElementById('btn-close-ai').addEventListener('click', () => { aiModal.hidden = true; });
    document.getElementById('btn-save-ai').addEventListener('click', () => { aiModal.hidden = true; showToast('已套用引擎設定！', 'success'); });
    document.getElementById('llm-provider').addEventListener('change', e => {
      document.getElementById('wrap-api-key').hidden = e.target.value !== 'gemini';
      document.getElementById('wrap-model-name').hidden = e.target.value === 'offline';
      document.getElementById('llm-model-name').value = e.target.value === 'ollama' ? 'qwen2.5' : 'gemini-2.5-flash';
    });

    document.getElementById('btn-reset').addEventListener('click', () => {
      data = blankData();
      document.getElementById('raw-input').value = '';
      document.getElementById('refine-feedback').hidden = true;
      if (isMobileView()) switchMobileTab('input');
      switchRightTab('article');
      showToast('已清空重寫！');
    });

    document.getElementById('btn-export-word').addEventListener('click', exportWord);
    document.getElementById('btn-mob-word').addEventListener('click', exportWord);
    document.getElementById('btn-export-ppt').addEventListener('click', exportPpt);
    document.getElementById('btn-mob-ppt').addEventListener('click', exportPpt);

    const doPrint = () => {
      if (!data.articleZh) { showToast('請先整理出中英短文！', 'warning'); return; }
      document.getElementById('print-mount').innerHTML = buildA4Html();
      window.print();
    };
    document.getElementById('btn-print').addEventListener('click', doPrint);
    document.getElementById('btn-mob-print').addEventListener('click', doPrint);

    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        data = Object.assign(blankData(), JSON.parse(saved));
        activeCefr = CEFR_META[data.cefrLevel] ? data.cefrLevel : 'A2';
        activeTone = TONE_LABELS[data.tone] ? data.tone : 'gentle_family';
        data.cefrLevel = activeCefr;
        data.tone = activeTone;
        document.getElementById('raw-input').value = data.rawInput || '';
      } else {
        document.getElementById('raw-input').value = SCENARIOS.compound_3c_emotion;
        data = buildFromPlainText(SCENARIOS.compound_3c_emotion, activeTone, activeCefr);
      }
    } catch (e) {
      document.getElementById('raw-input').value = SCENARIOS.compound_3c_emotion;
      data = buildFromPlainText(SCENARIOS.compound_3c_emotion, activeTone, activeCefr);
    }

    document.querySelectorAll('.seg-btn').forEach(b => {
      const act = b.dataset.tone === activeTone;
      b.classList.toggle('active', act);
      b.setAttribute('aria-checked', String(act));
    });
    switchRightTab('article');
    switchMobileTab(isMobileView() ? 'input' : 'draft');
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', initBrowser);
  }

  /* -------------------- Node.js 自動化測試匯出 -------------------- */
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      MAX_ZH_CHARS,
      CEFR_ORDER,
      CEFR_META,
      SCENARIOS,
      KB,
      countZh,
      escapeHtml,
      escapeXml,
      sanitizeFilename,
      setPath,
      extractActorAndTime,
      detectDomains,
      composeZhArticle,
      composeEnglish,
      buildFromPlainText,
      applySpokenRefinement,
      applyCefrSwitch,
      applyToneSwitch,
      buildPptxUint8Array,
      getData: () => data,
      setData: d => { data = d; }
    };
  }
})();
