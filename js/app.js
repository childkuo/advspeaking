/**
 * 如果跟我這樣說..... — 口語白話 → ≤300 字完整結構短文 ＋ 即時連動 CEFR A1 / A2 / B1 / B2 英文翻譯
 * 支援 100% 離線逐句中翻英連動引擎 ＋ 選填 Gemini／Ollama，桌機單畫面零捲動 ＋ 手機底部 4 分頁導覽
 */
(() => {
  'use strict';

  const STORAGE_KEY = '5d_teen_bilingual_cefr_v3';
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

  /* -------------------- 範例與 10 大生活領域知識庫 -------------------- */
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
      kw: /(手機|手遊|短影音|抖音|IG|YouTube|追劇|遊戲|Switch|平板|電腦|熬夜|凌晨|清晨|半夜|遲到|睡過頭|起不來|叫不醒|打瞌睡)/g,
      title: a => `${a}夜間使用手機與作息調整`,
      when: '昨晚至今天早上', where: '家中臥室', item: '手機與作息',
      why: '違反睡前收手機與準時上學的約定', how: '早上叫不醒上學遲到被發現', impact: '導致遲到、精神不濟也讓家人擔心',
      d2: '先協助整理出門確保平安到校，不於早晨擴大爭執，並約定放學後冷靜討論。',
      d3: '白天課業壓力大，想靠熬夜滑手機換取自由時間，加上手機放床邊缺少停損界限。',
      d4: '客廳設手機充電區，改用實體鬧鐘起床，並安排每天放學後 30 分鐘合法放鬆時間。',
      d5: '訂立作息公約：平日晚上固定時間手機放客廳充電，連續一週零遲到給予肯定。'
    },
    rest_fatigue: {
      id: 'rest_fatigue', label: '休息與體力調節',
      kw: /(睡覺|想睡|補眠|太累|很累|累壞|沒睡飽|累了|休息|透支|連日玩|玩太累|玩太多|疲倦|體力)/g,
      title: a => `${a}體力調節與好好休息`,
      when: '最近這幾天', where: '家中臥室', item: '睡眠與體力',
      why: '需要平衡玩樂行程與身體休息節奏', how: '身體過度疲憊主動表達想睡休息', impact: '體力透支影響精神與隔天狀態',
      d2: '先放下手邊安排，安心睡一覺補充體力，醒來後再輕鬆對話。',
      d3: '連續幾天行程排太滿、玩得太投入，忽略了身體需要足夠的休息緩衝。',
      d4: '往後連續活動後固定留半天休息，每天預留足夠睡眠時間，累了就提前主動說。',
      d5: '訂立休息約定：玩樂盡興也要顧好作息，體力不足時先補眠不硬撐。'
    },
    emotion_comm: {
      id: 'emotion_comm', label: '情緒與親子溝通',
      kw: /(發脾氣|大發脾氣|甩門|頂嘴|大吼|大叫|吵起來|冷戰|擺臭臉|嫌囉唆|嫌麻煩|不耐煩|罵髒話|摔東西|口氣差|嗆|生氣|難過|委屈)/g,
      title: a => `${a}情緒管理與好好說話`,
      when: '今天溝通時段', where: '家中客廳與房門', item: '親子溝通',
      why: '違反理性表達、不甩門吼叫的尊重約定', how: '對話中情緒升高當場爆發', impact: '讓家人受傷且氣氛緊繃',
      d2: '雙方先暫停 15 分鐘各自深呼吸冷靜，避免在氣頭上說出傷人的話。',
      d3: '當下壓力與煩躁已達臨界點，又缺乏「喊暫停」的溝通暗號，才會用甩門防衛。',
      d4: '為衝動口氣誠懇道歉，並建立「我需要冷靜 15 分鐘」暫停暗號，大人也減少重複催促。',
      d5: '訂立溝通公約：生氣不甩門、不冷戰，先冷靜再說出心裡真正的感受。'
    },
    study_exam: {
      id: 'study_exam', label: '課業與誠信自律',
      kw: /(段考|期中考|期末考|考卷|成績單|不及格|考差|考很差|作業|功課|習作|聯絡簿|沒交|缺交|沒寫|抄襲|作弊|代簽|藏考卷|隱瞞成績)/g,
      title: a => `${a}課業面對與誠實求助`,
      when: '這週上課期間', where: '學校與家中書桌', item: '作業與考卷',
      why: '違反誠實面對成績與準時交作業的約定', how: '老師聯繫家長或檢查時發現', impact: '造成課業落後與信任受損',
      d2: '先一起攤開缺交作業與考卷盤點清單，並主動聯繫老師確認補交期限。',
      d3: '因為考差怕被責罵，加上不會寫不敢發問，才選擇拖延與藏起來逃避。',
      d4: '將作業拆成每天 25 分鐘小進度完成，睡前核對書包，遇到難題 24 小時內主動求助。',
      d5: '訂立學習公約：成績可以不完美，但考卷必誠實呈現；大人先協助找方法不情緒責罵。'
    },
    outing_safety: {
      id: 'outing_safety', label: '外出與行蹤安全',
      kw: /(晚歸|沒回家|未歸|失聯|找不到人|翹課|翹補習|補習班|提早下課|逛街|西門町|網咖|KTV|宵夜|去玩|未報備|沒告知|沒傳訊息|報警)/g,
      title: a => `${a}課後外出與安全報備`,
      when: '昨晚課後至深夜', where: '校外商圈與返家途中', item: '課後行蹤報備',
      why: '違反行程變動必須事前報備的安全約定', how: '超過返家時間失聯經家人聯繫得知', impact: '讓家人極度焦慮並折損外出信任',
      d2: '確認平安返家無恙後，先安撫彼此情緒，並如實交代去向與同行朋友。',
      d3: '擔心先問會被拒絕而心存僥倖，也低估了聯絡不到人讓父母產生的恐慌。',
      d4: '養成 30 秒報備四要素（去哪、跟誰、幾點回、怎麼回），並設父母來電穿透靜音。',
      d5: '訂立外出公約：行程變動出發前必傳訊息報平安，連續準時報備即維持社交自主權。'
    },
    money_spend: {
      id: 'money_spend', label: '金錢與財務自律',
      kw: /([0-9一二兩三四五六七八九十百千萬]+元|塊錢|餐費|早餐錢|午餐錢|零用錢|壓歲錢|生活費|點數卡|儲值|課金|網購|蝦皮|刷卡|借錢|欠錢|透支|花光|超商)/g,
      title: a => `${a}零用錢管理與理性消費`,
      when: '這個月消費期間', where: '超商與學校', item: '餐費與零用錢',
      why: '違反專款專用與不私下借錢的理財約定', how: '月底沒錢吃飯或核對發票時發現', impact: '影響正常飲食並引發借貸困擾',
      d2: '先誠實盤點所有花費與欠款，並由家人陪同隔日立刻歸還同學借款。',
      d3: '餐費和娛樂費混放又沒記帳，面對遊戲點數限時誘惑時缺少冷靜緩衝。',
      d4: '改用分袋管理把吃飯錢與娛樂費分開，逾 300 元消費先等 24 小時，並分期償還透支。',
      d5: '訂立理財公約：每週日簡單記帳核對餘額，遇資金困難誠實找家人商量絕不私下借錢。'
    },
    peer_social: {
      id: 'peer_social', label: '同儕社群與手足',
      kw: /(群組|LINE|限動|截圖|酸|排擠|分組報告|同學吵架|口角|打架|推擠|搶|遙控器|電視|手足|吵架|說壞話|公審|霸凌|翻臉)/g,
      title: a => `${a}同儕群組與理性溝通`,
      when: '課餘互動時段', where: '班級群組與學校', item: '群組互動與分工',
      why: '違反對事不對人、不公開嘲諷截圖的界限', how: '群組口角傳開造成氣氛尷尬', impact: '傷害對方感受並破壞團體氣氛',
      d2: '立即停止筆戰並收回不當訊息，把公開爭執拉回私下理性對話。',
      d3: '因覺得分工不公累積委屈，隔著螢幕衝動想證明自己對，忘了公開酸人只會傷感情。',
      d4: '向對方誠懇道歉並重新列清楚分工表，養成生氣文字先存備忘錄放 10 分鐘的習慣。',
      d5: '訂立人際公約：私下溝通、公開尊重，生氣時絕不立刻按送出也不截圖公審。'
    },
    boundary_item: {
      id: 'boundary_item', label: '物品與隱私界限',
      kw: /(擅自|沒問過|未經同意|沒經過同意|偷拿|偷看|翻看|日記|耳機|藍牙耳機|玩偶|彩色筆|文具|筆記本|化妝品|球鞋|模型|卡牌|弄壞|摔裂|摔壞|弄丟|隱私|私人物品)/g,
      title: a => `${a}尊重物品與隱私界限`,
      when: '昨天出門前', where: '家人房間與學校', item: '他人私人物品',
      why: '違反未經同意不得進入房間拿取私物的界限', how: '物主回家發現物品受損後抗議', impact: '造成財物受損與嚴重不被尊重感',
      d2: '立即雙手歸還物品並如實說明損壞情形，由家人先安撫物主情緒。',
      d3: '圖一時方便又怕被拒絕，抱持熟人借一下沒關係的僥倖心態，忽略他人安全感。',
      d4: '正式道歉不找藉口，以零用錢或家務存錢賠償維修費，落實進房先敲門、借物先問過。',
      d5: '訂立界限公約：全家人互相尊重私人空間與物品，對方有權說不，損壞一定負責。'
    },
    chore_self: {
      id: 'chore_self', label: '家務與生活自理',
      kw: /(倒垃圾|垃圾車|廚餘|洗碗|水槽|發臭|做家事|家務|打掃|整理房間|書桌|雜物|臭襪子|洗衣籃|長螞蟻|發霉|值日生|髒亂)/g,
      title: a => `${a}家務責任與生活自理`,
      when: '這週晚間家務時段', where: '家中廚房與書桌', item: '負責家務與整潔',
      why: '違反按時完成分工家務與維護整潔的約定', how: '家人發現碗盤發臭與桌面雜亂', impact: '影響環境衛生也增加家人負擔',
      d2: '立即放下螢幕花 15 分鐘洗清碗盤與整理桌面，並向善後的家人道謝致歉。',
      d3: '放學只想先追劇放鬆，抱持「等一下再做」拖延心態，且未設固定鬧鐘提醒。',
      d4: '設手機定時鬧鐘先做 10 分鐘家務再休息，睡前執行 3 分鐘桌面清零，忙時提前換班。',
      d5: '訂立分工公約：自己設鬧鐘完成分內家務、不拖過隔夜，大人也不反覆碎念催促。'
    },
    safety_health: {
      id: 'safety_health', label: '交通安全與健康',
      kw: /(安全帽|腳踏車|單車|電動自行車|微電車|機車|闖紅燈|闖黃燈|搶快|過馬路|擦撞|摔車|導護|走廊奔跑|實驗室|手搖飲|不吃正餐|受傷|發燒|淋雨|雨衣)/g,
      title: a => `${a}通學交通安全與防護`,
      when: '今天早上上學途中', where: '通學路口與馬路', item: '安全帽與交通規則',
      why: '違反配戴安全帽與遵守號誌的安全紅線', how: '路口搶快被導護老師當場攔下勸導', impact: '潛藏嚴重車禍風險並讓家人後怕',
      d2: '立即停車確認平安無事，向導護老師道謝，並將安全帽固定放於玄關必拿處。',
      d3: '早上出門太趕怕遲到，心存「路很短不會出事」僥倖心態，把安全換成幾十秒方便。',
      d4: '每天提早 10 分鐘從容出門，安全帽放車上做到不戴不上路，路口確實停看聽。',
      d5: '訂立安全公約：安全永遠大於趕時間，寧可遲到報備，絕不沒戴安全帽或搶黃紅燈。'
    }
  };

  /* -------------------- 中→英 逐句連動翻譯核心（支援 A1/A2/B1/B2 與動態數字） -------------------- */
  function zhNumToArabic(str) {
    const map = { '零':0,'一':1,'二':2,'兩':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10,'十一':11,'十二':12,'十五':15,'二十':20,'三十':30 };
    if (/^\d+$/.test(str)) return Number(str);
    if (map[str] !== undefined) return map[str];
    const m = str.match(/^([一二三四五六七八九])?十([一二三四五六七八九])?$/);
    if (m) return (m[1] ? map[m[1]] : 1) * 10 + (m[2] ? map[m[2]] : 0);
    return null;
  }

  function pickMins(text, fallback) {
    const m = text.match(/([0-9一二兩三四五六七八九十]+)\s*分鐘/);
    const n = m ? zhNumToArabic(m[1]) : null;
    return n || fallback;
  }

  function pickHours(text, fallback) {
    const m = text.match(/([0-9一二兩三四五六七八九十]+)\s*(?:小時|個小時)/);
    const n = m ? zhNumToArabic(m[1]) : null;
    return n || fallback;
  }

  function pickClock(text, fallback) {
    const m = text.match(/(凌晨|清晨|早上|上午|中午|下午|晚上|晚間)?\s*([0-9一二兩三四五六七八九十]+)\s*點(半|多)?/);
    if (!m) return fallback;
    const period = m[1] || '';
    const h = zhNumToArabic(m[2]);
    if (!h) return fallback;
    const half = m[3] === '半' ? ':30' : '';
    const suffix = /(凌晨|清晨|早上|上午)/.test(period)
      ? ' a.m.'
      : (/(下午|晚上|晚間)/.test(period)
        ? ' p.m.'
        : (/(凌晨|清晨|早上|上午)/.test(text) ? ' a.m.' : (h >= 7 && h <= 11 ? ' p.m.' : ':00')));
    return `${h}${half}${suffix}`;
  }

  function pickMoney(text, fallback) {
    const m = text.match(/([0-9]+|[一二兩三四五六七八九十百千]+)\s*(?:元|塊)/);
    if (!m) return fallback;
    if (/^\d+$/.test(m[1])) return `${m[1]} dollars`;
    const special = { '兩千':'2,000','二千':'2,000','一千':'1,000','五百':'500','三百':'300','兩百':'200','一百':'100' };
    return `${special[m[1]] || fallback.replace(/\s*dollars/, '')} dollars`;
  }

  function pickDays(text, fallback) {
    const m = text.match(/([0-9一二兩三四五六七八九十]+)\s*天/);
    const n = m ? zhNumToArabic(m[1]) : null;
    return n ? (n === 1 ? 'one day' : `${n} days`) : fallback;
  }

  function pickTimeLead(text) {
    if (/(連日|連續幾天|這幾天)/.test(text)) return { A1:'For days', A2:'For several days', B1:'Over the past few days', B2:'Over consecutive days' };
    if (/(昨晚|昨天晚上)/.test(text)) return { A1:'Last night', A2:'Last night', B1:'Last night', B2:'Last night' };
    if (/(今天早上|今早)/.test(text)) return { A1:'This morning', A2:'This morning', B1:'This morning', B2:'This morning' };
    if (/(明天早上|明早)/.test(text)) return { A1:'Tomorrow morning', A2:'Tomorrow morning', B1:'Tomorrow morning', B2:'Tomorrow morning' };
    if (/(明天)/.test(text)) return { A1:'Tomorrow', A2:'Tomorrow', B1:'Tomorrow', B2:'Tomorrow' };
    if (/(昨天)/.test(text)) return { A1:'Yesterday', A2:'Yesterday', B1:'Yesterday', B2:'Yesterday' };
    if (/(這禮拜|這週)/.test(text)) return { A1:'This week', A2:'This week', B1:'This week', B2:'This week' };
    if (/(這個月|本月)/.test(text)) return { A1:'This month', A2:'This month', B1:'This month', B2:'This month' };
    if (/(今天)/.test(text)) return { A1:'Today', A2:'Today', B1:'Today', B2:'Today' };
    return null;
  }

  const TONE_EN_PREFIX = {
    gentle_family: {
      A1: 'In our family talk: ',
      A2: 'Family talk: ',
      B1: 'In a calm family talk: ',
      B2: 'Supportive family dialogue: '
    },
    teen_growth: {
      A1: 'My self-check: ',
      A2: 'My reflection: ',
      B1: 'Self-reflection: ',
      B2: 'Personal reflection: '
    },
    teacher_record: {
      A1: 'Teacher note: ',
      A2: 'Guidance record: ',
      B1: 'Counseling summary: ',
      B2: 'Counseling case summary: '
    }
  };

  function getEnglishSubject(actor, tone) {
    if (tone === 'teen_growth') {
      return { subj: 'I', subjLow: 'I', Subj: 'I', obj: 'me', poss: 'my', we: 'my family and I', bePres: 'am', want: 'want', need: 'need', feel: 'feel' };
    }
    if (tone === 'teacher_record') {
      return { subj: 'the student', subjLow: 'the student', Subj: 'The student', obj: 'the student', poss: 'their', we: 'the teacher and parents', bePres: 'is', want: 'wants', need: 'needs', feel: 'feels' };
    }
    const map = {
      '弟弟': { subj: 'my younger brother', subjLow: 'he', Subj: 'He', obj: 'him', poss: 'his', we: 'our family', bePres: 'is', want: 'wants', need: 'needs', feel: 'feels' },
      '哥哥': { subj: 'my older brother', subjLow: 'he', Subj: 'He', obj: 'him', poss: 'his', we: 'our family', bePres: 'is', want: 'wants', need: 'needs', feel: 'feels' },
      '姊姊': { subj: 'my older sister', subjLow: 'she', Subj: 'She', obj: 'her', poss: 'her', we: 'our family', bePres: 'is', want: 'wants', need: 'needs', feel: 'feels' },
      '姐姐': { subj: 'my older sister', subjLow: 'she', Subj: 'She', obj: 'her', poss: 'her', we: 'our family', bePres: 'is', want: 'wants', need: 'needs', feel: 'feels' },
      '妹妹': { subj: 'my younger sister', subjLow: 'she', Subj: 'She', obj: 'her', poss: 'her', we: 'our family', bePres: 'is', want: 'wants', need: 'needs', feel: 'feels' }
    };
    if (map[actor]) return map[actor];
    if (actor === '我') {
      return { subj: 'I', subjLow: 'I', Subj: 'I', obj: 'me', poss: 'my', we: 'my family and I', bePres: 'am', want: 'want', need: 'need', feel: 'feel' };
    }
    return { subj: 'our child', subjLow: 'he or she', Subj: 'He or she', obj: 'them', poss: 'their', we: 'our family', bePres: 'is', want: 'wants', need: 'needs', feel: 'feels' };
  }

  // 逐句語意對應翻譯規則（嚴格對齊中文實際內容，含動態數字／時間／人稱）
  const SENTENCE_TRANSLATORS = [
    // --- D2 當下處置句 ---
    {
      test: t => /協助整理出門|確保平安到校/.test(t),
      tr: (t, s) => {
        const calm = /深呼吸冷靜|冷靜\s*[0-9一二三四五六七八九十]+/.test(t);
        const m = pickMins(t, 15);
        return {
          A1: `First, ${s.we} stayed calm and helped ${s.obj} get to school safely${calm ? `, and took ${m} minutes to cool down` : ''}.`,
          A2: `First, ${s.we} helped ${s.obj} get to school safely without fighting in the morning and agreed to talk calmly after school${calm ? `, while taking ${m} minutes to breathe and cool down` : ''}.`,
          B1: `Immediately, ${s.we} prioritized getting ${s.obj} to school safely rather than arguing in the morning and set a calm talk for after school${calm ? `, taking ${m} minutes to breathe and cool down` : ''}.`,
          B2: `Rather than escalating tensions during a hectic morning, ${s.we} prioritized a calm arrival at school and scheduled a composed discussion afterward${calm ? `, observing a ${m}-minute cooling-off pause` : ''}.`
        };
      }
    },
    {
      test: t => /放下手邊安排|睡一覺補充體力|醒來再/.test(t),
      tr: (t, s) => ({
        A1: `First, ${s.we} stopped other plans so ${s.subjLow} could get a good sleep and talk later.`,
        A2: `First, ${s.we} put other plans aside so ${s.subjLow} could get a good sleep to recharge, and agreed to talk gently after waking up.`,
        B1: `Right away, ${s.we} paused non-urgent plans so ${s.subjLow} could sleep deeply and recover energy before having a relaxed conversation.`,
        B2: `Immediately, ${s.we} suspended secondary tasks to let ${s.obj} get restorative sleep, deferring any discussion until ${s.poss} energy recovered.`
      })
    },
    {
      test: t => /暫停\s*[0-9一二三四五六七八九十]+\s*分鐘|各自深呼吸冷靜/.test(t),
      tr: (t) => {
        const m = pickMins(t, 15);
        return {
          A1: `First, everyone stopped talking for ${m} minutes to cool down.`,
          A2: `First, both sides took a ${m}-minute break to breathe and calm down so nobody said hurtful words.`,
          B1: `Immediately, both sides stepped back for ${m} minutes to breathe and prevent saying anything deeply hurtful.`,
          B2: `To de-escalate the moment, both parties observed a ${m}-minute cooling-off pause to avoid hurtful remarks.`
        };
      }
    },
    {
      test: t => /攤開缺交作業|聯繫老師確認補交/.test(t),
      tr: () => ({
        A1: 'First, we made a list of missing work and called the teacher.',
        A2: 'First, we checked all the missing homework and test papers together and contacted the teacher for a new due date.',
        B1: 'Right away, we listed every overdue assignment and exam paper together and reached out to the teacher to confirm a makeup deadline.',
        B2: 'Immediately, we audited all outstanding coursework and exam papers together and proactively coordinated a realistic makeup schedule with the teacher.'
      })
    },
    {
      test: t => /確認平安返家|如實交代去向/.test(t),
      tr: (t, s) => ({
        A1: `First, we made sure ${s.subjLow} got home safe and talked about where ${s.subjLow} went.`,
        A2: `First, we made sure ${s.subjLow} came home safely, calmed down, and talked honestly about where ${s.subjLow} went and with whom.`,
        B1: `Once ${s.subjLow} returned safely, we calmed our nerves and went over ${s.poss} exact whereabouts and companions honestly.`,
        B2: `After verifying ${s.poss} safe return, we eased tensions and reviewed ${s.poss} itinerary and company candidly.`
      })
    },
    {
      test: t => /誠實盤點.*花費|歸還同學借款/.test(t),
      tr: () => ({
        A1: 'First, we counted all the spending and gave the money back to the classmate the next day.',
        A2: 'First, we checked all the spending and debts honestly and paid the classmate back the very next day.',
        B1: 'Immediately, we reviewed every expense and debt transparently and repaid the classmate the following day with family support.',
        B2: 'Immediately, we conducted a transparent audit of all outlays and settled the peer debt the very next day.'
      })
    },
    {
      test: t => /停止筆戰|收回不當訊息|拉回私下/.test(t),
      tr: (t, s) => ({
        A1: `First, ${s.subjLow} stopped fighting online, deleted the bad text, and talked one-on-one.`,
        A2: `First, ${s.subjLow} stopped arguing online, deleted the mean message, and moved the talk to a private chat.`,
        B1: `Immediately, ${s.subjLow} halted the online dispute, unsent the inappropriate messages, and shifted the conversation to a calm private chat.`,
        B2: `To contain the fallout, ${s.subjLow} ceased replying publicly, retracted the offending messages, and transitioned to a composed private dialogue.`
      })
    },
    {
      test: t => /雙手歸還物品|如實說明損壞/.test(t),
      tr: (t, s) => ({
        A1: `First, ${s.subjLow} gave the item back right away and told the truth about the damage.`,
        A2: `First, ${s.subjLow} returned the item with both hands, explained the damage honestly, and listened to the owner's feelings.`,
        B1: `Immediately, ${s.subjLow} returned the item respectfully, disclosed the damage honestly, and gave the owner space to share ${s.poss} feelings.`,
        B2: `To address the breach immediately, ${s.subjLow} returned the item respectfully, disclosed the damage candidly, and acknowledged the owner's frustration.`
      })
    },
    {
      test: t => /放下螢幕.*洗清碗盤|洗清碗盤與整理桌面/.test(t),
      tr: (t, s) => {
        const m = pickMins(t, 15);
        return {
          A1: `First, ${s.subjLow} stopped watching, spent ${m} minutes washing the dishes and cleaning the desk, and thanked family.`,
          A2: `First, ${s.subjLow} put the screen away, spent ${m} minutes washing the dishes and tidying the desk, and thanked family members.`,
          B1: `Right away, ${s.subjLow} stepped away from screens for ${m} minutes to scrub the dishes, organize the desk, and apologize with thanks to family.`,
          B2: `Immediately, ${s.subjLow} set devices aside for ${m} minutes to restore the sink and workspace, expressing gratitude and regret to family members.`
        };
      }
    },
    {
      test: t => /停車確認平安|安全帽固定放/.test(t),
      tr: (t, s) => ({
        A1: `First, ${s.subjLow} stopped safely, thanked the teacher, and put the helmet by the front door.`,
        A2: `First, ${s.subjLow} stopped safely, thanked the crossing teacher, and placed the helmet in a fixed spot by the front door.`,
        B1: `Immediately, ${s.subjLow} pulled over safely, thanked the crossing guard teacher, and placed the helmet in an unmissable entryway spot.`,
        B2: `Immediately, ${s.subjLow} came to a controlled stop, expressed gratitude to the duty teacher, and established a visible storage spot for the helmet at the entryway.`
      })
    },

    // --- D3 背後原因句 ---
    {
      test: t => /課業壓力大.*熬夜滑手機|手機放床邊/.test(t),
      tr: (t, s) => {
        const emo = /情緒緊繃|暫停暗號/.test(t);
        return {
          A1: `The reason was hard schoolwork, wanting free time on the phone at night, and keeping the phone by the bed${emo ? ', plus getting angry fast' : ''}.`,
          A2: `The real reason was heavy school stress, wanting free time on the phone at night, and keeping the phone by the bed without a clear stop line${emo ? ', while stress led to an angry fight' : ''}.`,
          B1: `Looking deeper, heavy academic pressure made ${s.obj} seek freedom through late-night phone use, while keeping the device beside the bed removed any clear boundary${emo ? ', and built-up tension sparked an argument' : ''}.`,
          B2: `Upon reflection, persistent academic pressure fueled a desire for late-night autonomy, while bedside phone access undermined self-restraint${emo ? ' and accumulated tension triggered an outburst' : ''}.`
        };
      }
    },
    {
      test: t => /行程排太滿|玩得太投入|休息緩衝/.test(t),
      tr: () => ({
        A1: 'The reason was playing too much for days without taking a rest.',
        A2: 'The real reason was packing too many fun plans into several days and forgetting to leave time to rest.',
        B1: 'Looking deeper, having an overly packed schedule for consecutive days left no recovery buffer and drained physical energy.',
        B2: 'Upon reflection, back-to-back activities over consecutive days eliminated essential recovery buffers and led to physical exhaustion.'
      })
    },
    {
      test: t => /壓力與煩躁已達臨界點|缺乏.*喊暫停/.test(t),
      tr: (t, s) => ({
        A1: `The reason was too much stress and not knowing how to ask for a short break.`,
        A2: `The main reason was reaching a stress limit without a quiet pause signal, so ${s.subjLow} slammed the door to hide.`,
        B1: `The root cause was built-up frustration reaching a breaking point without an agreed timeout cue, leading to defensive door-slamming.`,
        B2: `Underlying the outburst was accumulated strain reaching a threshold without a constructive pause mechanism, prompting defensive withdrawal.`
      })
    },
    {
      test: t => /考差怕被責罵|不會寫不敢發問/.test(t),
      tr: (t, s) => ({
        A1: `The reason was feeling afraid of being yelled at and feeling shy to ask questions.`,
        A2: `The real reason was fearing scolding over poor grades and feeling too shy to ask for help, which led to hiding and delaying.`,
        B1: `The underlying cause was anxiety over criticism combined with hesitation to ask questions on difficult work, driving avoidance.`,
        B2: `Fundamentally, fear of reprimand coupled with reluctance to expose academic gaps fostered avoidance and procrastination.`
      })
    },
    {
      test: t => /擔心先問會被拒絕|聯絡不到人.*恐慌/.test(t),
      tr: () => ({
        A1: 'The reason was feeling afraid parents would say no and forgetting how worried they get.',
        A2: 'The reason was worrying about hearing "no" and not realizing how scared parents feel when they cannot reach their child.',
        B1: 'The root cause was fearing refusal while underestimating how panicked parents become when they lose contact.',
        B2: 'Behind the lapse lay apprehension of being turned down alongside a failure to grasp the distress caused by being unreachable.'
      })
    },
    {
      test: t => /餐費和娛樂費混放|遊戲點數限時誘惑/.test(t),
      tr: () => ({
        A1: 'The reason was mixing food money with fun money and buying game cards too fast.',
        A2: 'The reason was mixing meal money with fun money without keeping notes, making it hard to resist game card offers.',
        B1: 'The main issue was combining meal and leisure budgets without tracking expenses, leaving no buffer against limited-time game offers.',
        B2: 'At the core, commingling essential and discretionary funds without bookkeeping created vulnerability to time-limited digital temptations.'
      })
    },
    {
      test: t => /分工不公.*委屈|隔著螢幕衝動/.test(t),
      tr: () => ({
        A1: 'The reason was feeling the team work was unfair and sending angry words too fast.',
        A2: 'The real reason was feeling unfair about the team work and typing angry words behind a screen without thinking of others\' feelings.',
        B1: 'The underlying trigger was pent-up frustration over unequal duties, amplified by the impulse to prove a point behind a screen.',
        B2: 'At its core, unspoken resentment combined with screen-mediated impulsivity obscured how damaging public ridicule can be.'
      })
    },
    {
      test: t => /圖一時方便|熟人借一下沒關係/.test(t),
      tr: () => ({
        A1: 'The reason was wanting a quick favor and forgetting to respect personal things.',
        A2: 'The reason was wanting quick convenience while fearing "no," forgetting that taking things without asking hurts trust.',
        B1: 'The real cause was chasing convenience while fearing refusal, overlooking how deeply uninvited borrowing undermines personal privacy.',
        B2: 'Underlying the misstep was a casual assumption that closeness excused bypassing consent, disregarding another person\'s sense of security.'
      })
    },
    {
      test: t => /等一下再做.*拖延|未設固定鬧鐘/.test(t),
      tr: () => ({
        A1: 'The reason was wanting to rest first and forgetting chores without an alarm.',
        A2: 'The reason was putting chores off until "later" after school without setting a regular phone alarm.',
        B1: 'The root cause was a "do it later" mindset after school paired with the absence of a scheduled alarm reminder.',
        B2: 'Underlying the neglect was habitual postponement after school coupled with the lack of an external cue once relaxation began.'
      })
    },
    {
      test: t => /出門太趕怕遲到|路很短不會出事/.test(t),
      tr: () => ({
        A1: 'The reason was leaving late and thinking the short road was safe.',
        A2: 'The reason was rushing in the morning and thinking a short ride would be fine, trading safety for a few seconds.',
        B1: 'The core reason was morning haste and falling into the false belief that a short ride carries no real risk.',
        B2: 'Fundamentally, morning haste fostered complacency—trading vital protection for mere seconds on a familiar route.'
      })
    },

    // --- D4 改善補償句 ---
    {
      test: t => /客廳設手機充電區|實體鬧鐘/.test(t),
      tr: (t, s) => {
        const m = pickMins(t, 30);
        const apol = /衝動口氣誠懇道歉|道歉/.test(t);
        return {
          A1: `Next, ${s.subjLow} will charge the phone in the living room, use a real clock, and take a ${m}-minute break after school${apol ? ', and say sorry nicely' : ''}.`,
          A2: `Next, ${s.subjLow} will set up a phone charging spot in the living room, use a real alarm clock, and enjoy a ${m}-minute break after school${apol ? ', while saying sorry for the rude tone' : ''}.`,
          B1: `Going forward, ${s.subjLow} will charge ${s.poss} phone in the living room, rely on a traditional alarm clock, and schedule a ${m}-minute break after school${apol ? ', alongside a sincere apology for the harsh tone' : ''}.`,
          B2: `To prevent a recurrence, ${s.subjLow} will designate a living-room charging station, switch to an analog alarm, and carve out a guilt-free ${m}-minute unwind window after school${apol ? ', paired with a sincere apology for the impulsive tone' : ''}.`
        };
      }
    },
    {
      test: t => /固定留半天休息|預留足夠睡眠時間/.test(t),
      tr: (t, s) => ({
        A1: `Next, ${s.subjLow} will save half a day to rest after busy fun days, sleep enough every day, and speak up when tired.`,
        A2: `Next, ${s.subjLow} will plan half a day of rest after busy trips, keep enough sleep hours every night, and speak up early when feeling tired.`,
        B1: `Going forward, ${s.subjLow} will schedule a half-day recovery window after intensive outings, protect daily sleep hours, and communicate fatigue proactively.`,
        B2: `To sustain balance, ${s.subjLow} will build in a half-day recovery period following consecutive outings, safeguard nightly sleep, and voice fatigue before reaching exhaustion.`
      })
    },
    {
      test: t => /衝動口氣誠懇道歉|需要冷靜.*暫停暗號/.test(t),
      tr: (t, s) => {
        const m = pickMins(t, 15);
        return {
          A1: `Next, ${s.subjLow} will say sorry and use a "${m}-minute break" sign, and adults will repeat less.`,
          A2: `Next, ${s.subjLow} will say sorry for the rude tone and use an "I need ${m} minutes" sign, while parents also cut down on repeating.`,
          B1: `Moving forward, ${s.subjLow} will apologize sincerely for ${s.poss} harsh tone and adopt an "I need ${m} minutes to calm down" cue, while adults reduce repetitive reminders.`,
          B2: `As a corrective measure, ${s.subjLow} will offer a candid apology for ${s.poss} impulsive tone and adopt an explicit ${m}-minute timeout cue alongside fewer repetitive prompts from adults.`
        };
      }
    },
    {
      test: t => /拆成每天.*小進度|睡前核對書包/.test(t),
      tr: (t, s) => {
        const m = pickMins(t, 25), h = pickHours(t, 24);
        return {
          A1: `Next, ${s.subjLow} will study ${m} minutes each day, check ${s.poss} bag before bed, and ask for help within ${h} hours.`,
          A2: `Next, ${s.subjLow} will split homework into ${m}-minute daily blocks, check the school bag before bed, and ask for help within ${h} hours when stuck.`,
          B1: `Going forward, ${s.subjLow} will break coursework into ${m}-minute daily sessions, inspect ${s.poss} backpack nightly, and seek assistance within ${h} hours of hitting a problem.`,
          B2: `To rebuild momentum, ${s.subjLow} will tackle coursework in focused ${m}-minute intervals, verify ${s.poss} bag nightly, and request guidance within ${h} hours of encountering an obstacle.`
        };
      }
    },
    {
      test: t => /報備四要素|穿透靜音/.test(t),
      tr: (t, s) => ({
        A1: `Next, ${s.subjLow} will text where, who, when, and how to get home, and keep parents' calls loud.`,
        A2: `Next, ${s.subjLow} will send a 30-second message with the place, friends, return time, and ride, and let parents' calls ring through silent mode.`,
        B1: `From now on, ${s.subjLow} will send a quick 30-second update covering destination, companions, return time, and transport, while allowing parents' calls to bypass silent mode.`,
        B2: `Moving forward, ${s.subjLow} will transmit a concise 30-second briefing—location, company, return time, and transit—while whitelisting parental calls through silent mode.`
      })
    },
    {
      test: t => /分袋管理|先等\s*[0-9一二三四五六七八九十]+\s*小時/.test(t),
      tr: (t, s) => {
        const money = pickMoney(t, '300 dollars'), h = pickHours(t, 24);
        return {
          A1: `Next, ${s.subjLow} will put food money and play money in two bags, wait ${h} hours for buys over ${money}, and pay back the extra cost.`,
          A2: `Next, ${s.subjLow} will separate meal money and fun money into bags, wait ${h} hours before spending over ${money}, and pay back the overspent money step by step.`,
          B1: `Going forward, ${s.subjLow} will use separate envelopes for meals and leisure, observe a ${h}-hour pause for purchases over ${money}, and repay the overspent amount in installments.`,
          B2: `To strengthen discipline, ${s.subjLow} will adopt envelope budgeting, enforce a ${h}-hour deliberation rule on purchases above ${money}, and reimburse the deficit incrementally.`
        };
      }
    },
    {
      test: t => /重新列清楚分工表|備忘錄放/.test(t),
      tr: (t, s) => {
        const m = pickMins(t, 10);
        return {
          A1: `Next, ${s.subjLow} will say sorry, write a clear team list, and save angry texts in notes for ${m} minutes first.`,
          A2: `Next, ${s.subjLow} will apologize nicely, write a clear team task list, and keep angry messages in notes for ${m} minutes before sending.`,
          B1: `Moving forward, ${s.subjLow} will apologize genuinely, clarify duties in a shared task list, and draft heated replies in notes for ${m} minutes before hitting send.`,
          B2: `Going forward, ${s.subjLow} will offer a candid apology, co-author an explicit division of labor, and impose a ${m}-minute draft buffer whenever agitated.`
        };
      }
    },
    {
      test: t => /進房先敲門|借物先問過|賠償維修費/.test(t),
      tr: (t, s) => ({
        A1: `Next, ${s.subjLow} will say sorry, pay to fix the item, knock on doors, and ask before borrowing.`,
        A2: `Next, ${s.subjLow} will apologize without excuses, use pocket money or chores to help pay for repairs, knock before entering, and ask before borrowing.`,
        B1: `Going forward, ${s.subjLow} will apologize without excuses, cover repair costs through allowance or chores, and strictly knock before entering or borrowing.`,
        B2: `As restitution, ${s.subjLow} will deliver an unconditional apology, finance repairs via allowance or chores, and strictly observe door-knocking and consent etiquette.`
      })
    },
    {
      test: t => /先做.*家務再休息|桌面清零/.test(t),
      tr: (t, s) => {
        const m1 = pickMins(t, 10), m2 = (t.match(/睡前執行\s*([0-9]+)\s*分鐘/) ? Number(t.match(/睡前執行\s*([0-9]+)\s*分鐘/)[1]) : 3);
        return {
          A1: `Next, ${s.subjLow} will set an alarm to do ${m1} minutes of chores before resting, clean the desk for ${m2} minutes at night, and trade turns early when busy.`,
          A2: `Next, ${s.subjLow} will set a phone alarm to finish ${m1} minutes of chores before relaxing, spend ${m2} minutes tidying the desk before bed, and trade turns early during busy weeks.`,
          B1: `Going forward, ${s.subjLow} will rely on a daily alarm to finish ${m1} minutes of chores prior to relaxing, run a ${m2}-minute nightly desk reset, and swap shifts in advance when busy.`,
          B2: `To sustain self-reliance, ${s.subjLow} will trigger a fixed alarm for ${m1} minutes of chores before leisure, conduct a ${m2}-minute nightly desk reset, and negotiate shift swaps proactively.`
        };
      }
    },
    {
      test: t => /提早.*從容出門|不戴不上路|路口確實停看聽/.test(t),
      tr: (t, s) => {
        const m = pickMins(t, 10);
        return {
          A1: `Next, ${s.subjLow} will leave ${m} minutes early every day, always wear the helmet, and look carefully at corners.`,
          A2: `Next, ${s.subjLow} will leave home ${m} minutes earlier each morning, keep the helmet on the bike so it is always worn, and stop and look at every corner.`,
          B1: `Moving forward, ${s.subjLow} will depart ${m} minutes earlier each morning, keep the helmet on the bike to guarantee use, and check carefully at every intersection.`,
          B2: `To eliminate this hazard, ${s.subjLow} will build in a ${m}-minute morning buffer, enforce a strict "no helmet, no ride" habit, and practice defensive scanning at every junction.`
        };
      }
    },

    // --- D5 共同約定／生活公約句 ---
    {
      test: t => /訂立作息公約|固定時間手機放客廳|平日晚上.*手機放客廳/.test(t),
      tr: (t, s) => {
        const clk = pickClock(t, '');
        const atTime = clk ? ` by ${clk}` : ' at a set time';
        return {
          A1: `Finally, ${s.we} made a sleep rule: put the phone in the living room${atTime} on school nights and arrive on time.`,
          A2: `Finally, ${s.we} made a family rule: charge the phone in the living room${atTime} on school nights, and praise a full week with zero lateness.`,
          B1: `In the end, ${s.we} established a clear routine: leave the phone charging in the living room${atTime} on weeknights and recognize a full week of punctual attendance.`,
          B2: `Ultimately, ${s.we} reached a mutual commitment to dock devices in the living room${atTime} on weeknights and celebrate a full week of consistent punctuality.`
        };
      }
    },
    {
      test: t => /訂立休息約定|玩樂盡興也要顧好作息|不硬撐/.test(t),
      tr: (t, s) => ({
        A1: `Finally, ${s.we} made a rest rule: have fun, keep good sleep hours, and rest first when tired.`,
        A2: `Finally, ${s.we} agreed on a rest rule: enjoy fun activities while keeping healthy sleep hours, and rest first instead of pushing too hard.`,
        B1: `In the end, ${s.we} established a rest agreement: enjoy activities fully while maintaining healthy sleep routines, and prioritize sleep rather than pushing through exhaustion.`,
        B2: `Ultimately, ${s.we} affirmed a balanced rest compact: savor leisure while safeguarding sleep hygiene, choosing timely recovery over overexertion.`
      })
    },
    {
      test: t => /訂立溝通公約|生氣不甩門/.test(t),
      tr: (t, s) => ({
        A1: `Finally, ${s.we} made a talk rule: no slamming doors or cold silence—calm down first and share true feelings.`,
        A2: `Finally, ${s.we} agreed on a communication rule: never slam doors or stay silent in anger; cool down first and speak honestly.`,
        B1: `In the end, ${s.we} set a communication principle: avoid slamming doors or giving the silent treatment, and express true feelings calmly once settled.`,
        B2: `Ultimately, ${s.we} affirmed a respectful dialogue norm: reject door-slamming and stonewalling in favor of composed, candid communication.`
      })
    },
    {
      test: t => /訂立學習公約|成績可以不完美/.test(t),
      tr: (t, s) => ({
        A1: `Finally, ${s.we} made a study rule: grades do not have to be perfect, always show tests honestly, and adults will help kindly.`,
        A2: `Finally, ${s.we} agreed on a study rule: grades can be imperfect, but test papers must be shared honestly, and adults will help find ways without yelling.`,
        B1: `In the end, ${s.we} established a learning agreement: imperfect scores are acceptable as long as exams are shown honestly, met with problem-solving rather than scolding.`,
        B2: `Ultimately, ${s.we} established a transparent academic compact: grades need not be flawless, yet honesty is non-negotiable, met with constructive coaching rather than reprimands.`
      })
    },
    {
      test: t => /訂立外出公約|行程變動.*報平安/.test(t),
      tr: (t, s) => ({
        A1: `Finally, ${s.we} made an outing rule: always text before changing plans so parents can trust ${s.obj}.`,
        A2: `Finally, ${s.we} agreed on a safety rule: always send a message before changing plans, and keeping this habit protects social freedom.`,
        B1: `In the end, ${s.we} established an outing agreement: checking in prior to any schedule change sustains trust and social independence.`,
        B2: `Ultimately, ${s.we} affirmed a trust-based outing pact: timely check-ins before modifying plans preserve ongoing social autonomy.`
      })
    },
    {
      test: t => /訂立理財公約|每週日.*記帳|絕不私下借錢/.test(t),
      tr: (t, s) => ({
        A1: `Finally, ${s.we} made a money rule: check spending every Sunday and ask family instead of borrowing from friends.`,
        A2: `Finally, ${s.we} agreed on a money rule: write down spending every Sunday, and always talk to family instead of borrowing privately.`,
        B1: `In the end, ${s.we} set a financial rule: review weekly balances every Sunday and consult family honestly rather than borrowing privately.`,
        B2: `Ultimately, ${s.we} instituted a Sunday ledger review and a firm pledge to seek family guidance rather than informal private borrowing.`
      })
    },
    {
      test: t => /訂立人際公約|私下溝通、公開尊重/.test(t),
      tr: (t, s) => ({
        A1: `Finally, ${s.we} made a friend rule: talk privately, be kind in groups, and never post mean screenshots.`,
        A2: `Finally, ${s.we} agreed on a social rule: talk in private, stay respectful in public groups, and never post screenshots to hurt others.`,
        B1: `In the end, ${s.we} established a social principle: handle conflicts privately, stay respectful in public chats, and never shame others with screenshots.`,
        B2: `Ultimately, ${s.we} upheld a clear digital ethic: address grievances privately, uphold dignity in public forums, and never weaponize screenshots.`
      })
    },
    {
      test: t => /訂立界限公約|尊重私人空間與物品/.test(t),
      tr: (t, s) => ({
        A1: `Finally, ${s.we} made a home rule: respect personal rooms and things, accept "no," and pay if something breaks.`,
        A2: `Finally, ${s.we} agreed on a respect rule: everyone respects personal space and belongings, accepts "no" politely, and takes care of any damage.`,
        B1: `In the end, ${s.we} set a boundary agreement: respect personal rooms and belongings, honor the right to say no, and take full responsibility for damage.`,
        B2: `Ultimately, ${s.we} affirmed a mutual boundary compact: personal space and possessions are inviolable, refusal must be honored, and accountability is mandatory.`
      })
    },
    {
      test: t => /訂立分工公約|不拖過隔夜/.test(t),
      tr: (t, s) => ({
        A1: `Finally, ${s.we} made a chore rule: use an alarm to finish daily chores before bed so adults do not nag.`,
        A2: `Finally, ${s.we} agreed on a home rule: finish daily chores with an alarm before bed without leaving them overnight, and adults will not keep nagging.`,
        B1: `In the end, ${s.we} established a chore routine: manage assigned tasks independently with an alarm before bedtime, in exchange for nag-free trust from adults.`,
        B2: `Ultimately, ${s.we} forged a balanced household compact: self-monitored chore completion before bedtime in exchange for nag-free trust.`
      })
    },
    {
      test: t => /訂立安全公約|安全永遠大於趕時間/.test(t),
      tr: (t, s) => ({
        A1: `Finally, ${s.we} made a safety rule: being safe comes before being fast—always wear a helmet and never run red or yellow lights.`,
        A2: `Finally, ${s.we} agreed on a safety rule: safety is always more important than rushing; it is better to report being late than to ride without a helmet or run a yellow or red light.`,
        B1: `In the end, ${s.we} set a strict safety standard: personal safety always outweighs saving time—better to report a delay than ride unhelmeted or beat traffic signals.`,
        B2: `Ultimately, ${s.we} enshrined a non-negotiable safety principle: arriving intact always supersedes punctuality, with zero tolerance for riding unhelmeted or running signals.`
      })
    }
  ];

  // 自由口語／手動編輯中文句子的組合式 CEFR (A1–B2) 翻譯器
  function translateFreeChineseSentence(rawSentence, lvl, s) {
    const t = rawSentence.trim();
    if (!t) return '';

    const timeObj = pickTimeLead(t);
    const timeLead = timeObj ? `${timeObj[lvl]}, ` : '';
    const clauses = [];

    // 1. 睡眠／太累／想睡／補眠
    let hasInlineTime = false;
    if (/(我要睡覺|想睡覺|想睡|補眠|早點睡|早睡|睡到|睡飽)/.test(t)) {
      const clk = pickClock(t, '');
      clauses.push({
        A1: `${s.subj} ${s.want} to sleep${clk ? ` until ${clk}` : ''}`,
        A2: `${s.subj} really ${s.need} to get some sleep${clk ? ` until ${clk}` : ''}`,
        B1: `${s.subj} ${s.need} to get proper rest and sleep${clk ? ` until ${clk}` : ''}`,
        B2: `${s.subj} urgently ${s.need} restorative sleep${clk ? ` until ${clk}` : ''}`
      }[lvl]);
    }
    if (/(連日玩|玩太累|玩太多|太累|很累|累壞|疲倦|沒睡飽)/.test(t)) {
      const played = /(玩|出遊|逛|打球|活動)/.test(t);
      if (played) hasInlineTime = true;
      clauses.push({
        A1: played ? `${s.subjLow} played too much and ${s.feel} very tired` : `${s.subjLow} ${s.feel} very tired`,
        A2: played ? `${s.subjLow} played too hard over several days and became very tired` : `${s.subjLow} ${s.bePres} very tired from not getting enough rest`,
        B1: played ? `playing nonstop over several days left ${s.obj} completely exhausted` : `lack of adequate rest left ${s.obj} thoroughly exhausted`,
        B2: played ? `consecutive days of nonstop activity have left ${s.obj} thoroughly drained` : `accumulated fatigue has left ${s.obj} significantly depleted`
      }[lvl]);
    }

    // 2. 熬夜／滑手機／短影音／手遊／遲到
    if (/(熬夜|凌晨|半夜|兩點|一點)/.test(t) && /(手機|手遊|短影音|遊戲|追劇|平板|電腦|不肯睡)/.test(t)) {
      const clk = pickClock(t, 'after midnight');
      clauses.push({
        A1: `${s.subj} played on ${s.poss} phone until ${clk}`,
        A2: `${s.subj} stayed up late using ${s.poss} phone until ${clk}`,
        B1: `${s.subj} stayed up scrolling on ${s.poss} phone until ${clk}`,
        B2: `${s.subj} remained awake absorbed in ${s.poss} phone until ${clk}`
      }[lvl]);
    }
    if (/(遲到|叫不起來|睡過頭|起不來)/.test(t)) {
      clauses.push({
        A1: `${s.subjLow} got up late and was late for school`,
        A2: `${s.subjLow} could not wake up on time and arrived late for school`,
        B1: `${s.subjLow} overslept and arrived late for school`,
        B2: `${s.subjLow} inevitably overslept and missed the start of school`
      }[lvl]);
    }

    // 3. 情緒／甩門／頂嘴／發脾氣
    if (/(甩門|發脾氣|頂嘴|嫌.*囉唆|大吼|吵架|口角)/.test(t) && !/(群組|LINE)/.test(t)) {
      clauses.push({
        A1: `${s.subjLow} got mad and shut the door hard`,
        A2: `${s.subjLow} got angry, talked back, and slammed the door`,
        B1: `${s.subjLow} lost ${s.poss} temper, talked back impatiently, and slammed the door`,
        B2: `${s.subjLow} reacted defensively, snapped back, and slammed the door in frustration`
      }[lvl]);
    }

    // 4. 段考／藏考卷／缺交作業
    if (/(段考|考差|考很差|藏考卷|考卷藏|習作.*沒交|作業.*沒交|沒交)/.test(t)) {
      const days = pickDays(t, 'three days');
      clauses.push({
        A1: `${s.subj} did badly on a test, hid the paper, and missed homework for ${days}`,
        A2: `${s.subj} did poorly on the math test, hid the test paper out of fear, and missed homework for ${days} until the teacher called`,
        B1: `${s.subj} performed poorly on the exam, concealed the paper to avoid blame, and failed to submit assignments for ${days} until the teacher called home`,
        B2: `${s.subj} received a poor exam score, withheld the paper out of apprehension, and repeatedly missed assignments for ${days} until the homeroom teacher intervened`
      }[lvl]);
    }

    // 5. 補習班／晚歸／未報備
    if (/(補習班|提早下課|逛街|西門町|吃宵夜|晚歸|十點半|沒先傳訊息|報警)/.test(t)) {
      const clk = pickClock(t, '10:30 p.m.');
      clauses.push({
        A1: `${s.subj} went out with friends after class and came home at ${clk} without texting family`,
        A2: `${s.subj} went shopping and ate with friends after cram school ended early and came home at ${clk} without sending a message`,
        B1: `${s.subj} went downtown with classmates after cram school dismissed early and returned at ${clk} without notifying family, leaving parents deeply worried`,
        B2: `${s.subj} detoured downtown with peers following an early cram-school dismissal and returned at ${clk} without prior notice, causing severe parental alarm`
      }[lvl]);
    }

    // 6. 餐費／零用錢／點數卡／借錢
    if (/(餐費|零用錢|點數卡|課金|借了|借錢|透支)/.test(t)) {
      const m1 = pickMoney(t, '2,000 dollars');
      clauses.push({
        A1: `${s.subj} spent ${m1} of lunch money on game cards and borrowed money from a classmate`,
        A2: `${s.subj} spent ${m1} of meal money on game cards at a store, ran out of lunch money, and borrowed cash from a classmate`,
        B1: `${s.subj} secretly spent ${m1} of meal allowance on game credit, running out of lunch funds and borrowing cash from a classmate`,
        B2: `${s.subj} diverted ${m1} of meal stipend toward in-game top-up cards, depleting essential lunch funds and resorting to an informal loan from a peer`
      }[lvl]);
    }

    // 7. 班級群組／分組報告／截圖
    if (/(群組|LINE|分組報告|截圖)/.test(t)) {
      clauses.push({
        A1: `${s.subj} fought with a classmate in the class chat and posted mean screenshots`,
        A2: `${s.subj} argued with a classmate in the class group chat about team work and posted mean screenshots that made everyone uncomfortable`,
        B1: `${s.subj} got into a heated dispute in the class group chat over unequal project duties and posted sarcastic screenshots, making the class awkward`,
        B2: `${s.subj} clashed with a peer in the class messaging group over perceived inequities in team duties, impulsively posting mocking screenshots that soured the classroom climate`
      }[lvl]);
    }

    // 8. 偷拿耳機／摔裂／隱私
    if (/(耳機|藍牙耳機|摔裂|私自進房間|沒問過)/.test(t)) {
      clauses.push({
        A1: `${s.subj} took a family member's earphones without asking and broke the case at school`,
        A2: `${s.subj} entered a family member's room without asking, took ${s.poss} relative's earphones to school, and accidentally cracked the case`,
        B1: `${s.subj} entered a sibling's room without permission, took their wireless earphones to school, and accidentally fractured the charging case`,
        B2: `${s.subj} entered a sibling's room uninvited, borrowed wireless earphones without consent, and inadvertently fractured the charging case at school`
      }[lvl]);
    }

    // 9. 洗碗／書桌／家務
    if (/(洗.*碗|水槽|發臭|書桌|雜物|打掃|倒垃圾|做家事)/.test(t) && !/補償/.test(t)) {
      const days = pickDays(t, 'two days');
      clauses.push({
        A1: `${s.subj} watched shows after school and left dirty dishes and a messy desk for ${days}`,
        A2: `${s.subj} only watched videos and played games after school, leaving dirty dishes in the sink for ${days} and a messy desk`,
        B1: `${s.subj} became absorbed in shows and games after school, leaving dirty dishes sitting in the sink for ${days} and letting clutter pile up on the desk`,
        B2: `${s.subj} prioritized screen entertainment over assigned duties, leaving unwashed dishes to stagnate for ${days} and desk clutter to obscure study papers`
      }[lvl]);
    }

    // 10. 安全帽／電動自行車／搶黃燈
    if (/(安全帽|電動自行車|腳踏車|搶黃燈|闖紅燈|擦撞|導護)/.test(t)) {
      clauses.push({
        A1: `${s.subj} rode an e-bike with no helmet and rushed a yellow light until a teacher stopped ${s.obj}`,
        A2: `${s.subj} rode an e-bike to school without a helmet and tried to beat a yellow light, nearly hitting a scooter before a teacher stopped ${s.obj}`,
        B1: `${s.subj} commuted by e-bike without wearing a helmet and rushed through a yellow light, nearly colliding with a turning scooter before a crossing teacher intervened`,
        B2: `${s.subj} rode an e-bike unhelmeted and tried to beat an amber signal, narrowly avoiding a collision with a turning scooter until a duty teacher intervened`
      }[lvl]);
    }

    // 11. 常見口語追加句（道歉／段考壓力／11點約定／家事補償／提早10分鐘／肚子餓／忘記帶／生病／心情不好）
    if (/(道歉|對不起)/.test(t) && clauses.length === 0) {
      clauses.push({
        A1: `${s.subj} said sorry nicely afterward and wanted to talk calmly`,
        A2: `${s.subj} apologized softly afterward and showed willingness to talk calmly`,
        B1: `${s.subj} offered a genuine apology afterward and became willing to communicate calmly`,
        B2: `${s.subj} subsequently offered a candid apology and demonstrated openness to constructive dialogue`
      }[lvl]);
    }
    if (/(段考壓力|考試壓力|壓力太大)/.test(t) && clauses.length === 0) {
      clauses.push({
        A1: `the big test gave ${s.obj} too much stress`,
        A2: `recent exam pressure was too heavy and made ${s.obj} want to relax`,
        B1: `mounting pressure from recent exams made ${s.obj} crave an outlet to unwind`,
        B2: `compounding academic strain from upcoming exams intensified the urge for immediate relief`
      }[lvl]);
    }
    if (/(洗碗|倒垃圾|家事).*(補償|主動)/.test(t) || /(補償).*(洗碗|倒垃圾|家事)/.test(t)) {
      clauses.push({
        A1: `${s.subj} will wash the dishes and take out the trash this week to help`,
        A2: `${s.subj} offered to wash the dishes and take out the trash this week to make up for it`,
        B1: `${s.subj} volunteered to wash the dishes and take out the trash this week to make amends`,
        B2: `${s.subj} proactively volunteered for dishwashing and waste disposal this week as tangible restitution`
      }[lvl]);
    }
    if (/(提早).*(分鐘)/.test(t) && clauses.length === 0) {
      const m = pickMins(t, 10);
      clauses.push({
        A1: `${s.subj} will wake up ${m} minutes early`,
        A2: `${s.subj} will get up ${m} minutes earlier each morning`,
        B1: `${s.subj} committed to waking up ${m} minutes earlier to keep mornings smooth`,
        B2: `${s.subj} committed to building a ${m}-minute morning buffer to prevent avoidable haste`
      }[lvl]);
    }
    if (/(忘記帶|沒帶)/.test(t) && clauses.length === 0) {
      clauses.push({
        A1: `${s.subj} forgot to bring something important`,
        A2: `${s.subj} forgot to bring an important item today`,
        B1: `${s.subj} accidentally left an essential item behind`,
        B2: `${s.subj} inadvertently failed to bring a necessary item`
      }[lvl]);
    }
    if (/(肚子餓|好餓|沒吃飯|吃飯)/.test(t) && clauses.length === 0) {
      clauses.push({
        A1: `${s.subj} felt very hungry and needed food`,
        A2: `${s.subj} felt very hungry and needed a proper meal`,
        B1: `${s.subj} felt quite hungry and needed a balanced meal`,
        B2: `${s.subj} experienced strong hunger and required proper nourishment`
      }[lvl]);
    }
    if (/(生病|發燒|頭痛|不舒服|感冒)/.test(t) && clauses.length === 0) {
      clauses.push({
        A1: `${s.subj} did not feel well and needed rest`,
        A2: `${s.subj} felt unwell today and needed to rest and take care`,
        B1: `${s.subj} was feeling under the weather and needed time to recover`,
        B2: `${s.subj} experienced physical discomfort and required attentive recovery`
      }[lvl]);
    }
    if (/(開心|高興|感謝|謝謝)/.test(t) && clauses.length === 0) {
      clauses.push({
        A1: `${s.subj} felt happy and thankful`,
        A2: `${s.subj} felt grateful and glad to work things out together`,
        B1: `${s.subj} felt genuinely appreciative of the supportive discussion`,
        B2: `${s.subj} expressed sincere gratitude for the constructive exchange`
      }[lvl]);
    }

    if (clauses.length === 0) {
      // 完全自訂的新中文句子 fallback（仍依語氣與 CEFR 難度產生自然句）
      const isPlan = /(未來|以後|明天|約定|公約|願意|會|要)/.test(t);
      const isWhy = /(因為|原因|其實|主要)/.test(t);
      if (isPlan) {
        clauses.push({
          A1: `${s.we} added a clear next step to our plan`,
          A2: `${s.we} agreed on a clear action step to make things better`,
          B1: `${s.we} incorporated a concrete improvement step into our shared plan`,
          B2: `${s.we} integrated a deliberate corrective measure into our mutual plan`
        }[lvl]);
      } else if (isWhy) {
        clauses.push({
          A1: `${s.we} talked honestly about the reason behind this`,
          A2: `${s.we} talked openly about the real reason behind what happened`,
          B1: `${s.we} reflected candidly on the underlying factor behind this situation`,
          B2: `${s.we} examined the root factor underlying this episode with candor`
        }[lvl]);
      } else {
        clauses.push({
          A1: `${s.we} shared what happened honestly`,
          A2: `${s.we} talked openly about what happened in daily life`,
          B1: `${s.we} discussed this everyday situation openly and calmly`,
          B2: `${s.we} addressed this everyday situation with clarity and mutual respect`
        }[lvl]);
      }
    }

    const joined = clauses.length > 1
      ? `${clauses[0]}, and ${clauses.slice(1).join(', and ')}`
      : clauses[0];
    const effectiveLead = (hasInlineTime && /(連日|連續幾天|這幾天)/.test(t)) ? '' : timeLead;
    const sentence = `${effectiveLead}${joined}`.trim();
    const cap = sentence.charAt(0).toUpperCase() + sentence.slice(1);
    return /[.!?]$/.test(cap) ? cap : `${cap}.`;
  }

  // 核心連動函式：直接逐句讀取中文文章 (articleZh) 轉譯成對應 CEFR 難度與語氣的英文文章
  function translateZhArticleToEn(zhArticle, cefr = activeCefr, tone = activeTone, context = data) {
    const lvl = CEFR_META[cefr] ? cefr : 'A2';
    const toneKey = TONE_EN_PREFIX[tone] ? tone : 'gentle_family';
    const text = String(zhArticle || '').trim();
    if (!text) return { level: lvl, en: '', vocab: [] };

    const actorInfo = extractActorAndTime(text || (context && context.rawInput) || '');
    const s = getEnglishSubject(actorInfo.actor, toneKey);

    // 拆解中文文章中的每一個實際句子
    const rawSentences = text
      .split(/[。！？!?]+/)
      .map(x => x.trim())
      .filter(Boolean);

    const translatedSentences = rawSentences.map((sent, idx) => {
      let body = sent;
      let leadPrefix = '';

      // 第一句偵測並轉換語氣開頭
      if (idx === 0) {
        if (/^家人好好聊聊這次的事[：:]/.test(body)) {
          leadPrefix = TONE_EN_PREFIX.gentle_family[lvl];
          body = body.replace(/^家人好好聊聊這次的事[：:]\s*/, '');
        } else if (/^回顧這次事件[，,]/.test(body)) {
          leadPrefix = TONE_EN_PREFIX.teen_growth[lvl];
          body = body.replace(/^回顧這次事件[，,]\s*/, '');
        } else if (/^本次輔導紀錄摘要[：:]/.test(body)) {
          leadPrefix = TONE_EN_PREFIX.teacher_record[lvl];
          body = body.replace(/^本次輔導紀錄摘要[：:]\s*/, '');
        } else {
          leadPrefix = TONE_EN_PREFIX[toneKey][lvl];
        }
      }

      // 去除結構連接前綴以便比對語意核心
      const core = body
        .replace(/^當下先/, '')
        .replace(/^細想背後原因[，,]主要是/, '')
        .replace(/^未來改善方面[，,]/, '')
        .replace(/^最後(?:大家一起|大家共同|我與家人共同|親師生共同)/, '')
        .trim();

      // 優先比對精準語意句型表（支援動態數字／時間替換）
      for (const rule of SENTENCE_TRANSLATORS) {
        if (rule.test(core)) {
          const out = rule.tr(core, s)[lvl];
          return `${leadPrefix}${out}`;
        }
      }

      // 若是使用者自訂／手動改寫的句子，逐句組合翻譯
      const freeEn = translateFreeChineseSentence(core, lvl, s);
      return `${leadPrefix}${freeEn}`;
    });

    // 依語氣補上一句與中文語氣一致的英文收尾
    const closingByTone = {
      gentle_family: {
        A1: 'We will help each other with love.',
        A2: 'With care and patience, our family will support each other.',
        B1: 'With mutual understanding, our family can build a better habit together.',
        B2: 'Through empathy and steady encouragement, our household will reinforce this positive change.'
      },
      teen_growth: {
        A1: 'I want to do better next time.',
        A2: 'I want to take responsibility and grow stronger from this.',
        B1: 'I am determined to take ownership of my habits and keep improving.',
        B2: 'I am committed to holding myself accountable and turning this setback into lasting growth.'
      },
      teacher_record: {
        A1: 'School and home will check progress next week.',
        A2: 'The teacher and parents will follow up on the student\'s progress together.',
        B1: 'Both the school and parents will continue to monitor the student\'s progress and offer guidance.',
        B2: 'School staff and guardians will jointly review behavioral progress and provide ongoing guidance.'
      }
    }[toneKey][lvl];

    const enFull = [...translatedSentences, closingByTone].filter(Boolean).join(' ');
    const vocab = extractVocabFromEnglish(enFull, lvl);
    return { level: lvl, en: enFull, vocab };
  }

  /* -------------------- 動態對應單字庫（只顯示實際出現在英文文章裡的該等級單字） -------------------- */
  const CEFR_GLOSSARY = {
    A1: [
      ['sleep', 'v./n.', '睡覺'], ['tired', 'adj.', '累的'], ['rest', 'v./n.', '休息'], ['phone', 'n.', '手機'],
      ['late', 'adj./adv.', '晚／遲到'], ['fight', 'v.', '吵架'], ['calm', 'adj.', '冷靜的'], ['bed', 'n.', '床'],
      ['clock', 'n.', '時鐘'], ['rule', 'n.', '規定'], ['angry', 'adj.', '生氣的'], ['mad', 'adj.', '生氣的'],
      ['door', 'n.', '門'], ['sorry', 'adj.', '抱歉的'], ['break', 'n.', '休息'], ['test', 'n.', '考試'],
      ['homework', 'n.', '作業'], ['afraid', 'adj.', '害怕的'], ['study', 'v.', '讀書'], ['bag', 'n.', '書包'],
      ['safe', 'adj.', '安全的'], ['friends', 'n.', '朋友'], ['text', 'v./n.', '傳訊／訊息'], ['lunch', 'n.', '午餐'],
      ['money', 'n.', '金錢'], ['borrow', 'v.', '借入'], ['chat', 'n.', '聊天室'], ['fair', 'adj.', '公平的'],
      ['kind', 'adj.', '友善的'], ['knock', 'v.', '敲門'], ['dishes', 'n.', '碗盤'], ['desk', 'n.', '書桌'],
      ['alarm', 'n.', '鬧鐘'], ['helmet', 'n.', '安全帽'], ['fast', 'adv.', '快速地'], ['early', 'adv.', '提早'],
      ['love', 'n.', '愛'], ['family', 'n.', '家人'], ['school', 'n.', '學校'], ['plan', 'n.', '計畫'],
      ['help', 'v.', '幫忙'], ['honest', 'adj.', '誠實的'], ['check', 'v.', '檢查'], ['progress', 'n.', '進度']
    ],
    A2: [
      ['stay up late', 'phr.', '熬夜'], ['late for school', 'phr.', '上學遲到'], ['calm', 'adj.', '冷靜的'],
      ['stress', 'n.', '壓力'], ['living room', 'n.', '客廳'], ['alarm clock', 'n.', '鬧鐘'], ['recharge', 'v.', '充電／恢復體力'],
      ['energy', 'n.', '體力／精力'], ['gently', 'adv.', '溫和地'], ['healthy', 'adj.', '健康的'], ['patience', 'n.', '耐心'],
      ['support', 'v./n.', '支持'], ['responsibility', 'n.', '責任'], ['reflection', 'n.', '反思'], ['progress', 'n.', '進度'],
      ['hurtful', 'adj.', '傷人的'], ['rude', 'adj.', '沒禮貌的'], ['slammed', 'v.', '用力甩關'], ['apologize', 'v.', '道歉'],
      ['missing', 'adj.', '缺漏的'], ['scared', 'adj.', '害怕的'], ['shy', 'adj.', '害羞的'], ['honestly', 'adv.', '誠實地'],
      ['cram school', 'n.', '補習班'], ['safely', 'adv.', '平安地'], ['reach', 'v.', '聯絡上'], ['trust', 'v./n.', '信任'],
      ['borrow', 'v.', '借入'], ['separate', 'adj./v.', '分開'], ['debts', 'n.', '欠款'], ['argue', 'v.', '爭吵'],
      ['mean', 'adj.', '刻薄的'], ['private', 'adj.', '私下的'], ['unfair', 'adj.', '不公平的'], ['respect', 'v./n.', '尊重'],
      ['pocket money', 'n.', '零用錢'], ['excuses', 'n.', '藉口'], ['accidentally', 'adv.', '不小心'], ['chores', 'n.', '家務'],
      ['tidying', 'v.', '整理'], ['helmet', 'n.', '安全帽'], ['yellow light', 'n.', '黃燈'], ['rushing', 'v.', '趕時間'],
      ['guidance', 'n.', '輔導'], ['follow up', 'phr.', '追蹤'], ['silence', 'n.', '沉默']
    ],
    B1: [
      ['oversleep', 'v.', '睡過頭'], ['overslept', 'v.', '睡過頭'], ['prioritized', 'v.', '優先處理'], ['academic', 'adj.', '課業的'],
      ['boundary', 'n.', '界限'], ['rely on', 'phr.', '依賴'], ['established', 'v.', '建立'], ['punctual', 'adj.', '準時的'],
      ['exhausted', 'adj.', '筋疲力盡的'], ['recovery', 'n.', '恢復'], ['buffer', 'n.', '緩衝'], ['fatigue', 'n.', '疲勞'],
      ['proactively', 'adv.', '主動地'], ['mutual', 'adj.', '互相的'], ['determined', 'adj.', '下定決心的'], ['ownership', 'n.', '承擔責任'],
      ['monitor', 'v.', '追蹤觀察'], ['counseling', 'n.', '輔導諮商'], ['temper', 'n.', '脾氣'], ['frustration', 'n.', '挫折感'],
      ['sincerely', 'adv.', '誠懇地'], ['harsh', 'adj.', '刺耳嚴厲的'], ['submit', 'v.', '繳交'], ['concealed', 'v.', '隱瞞'],
      ['overdue', 'adj.', '逾期的'], ['anxiety', 'n.', '焦慮'], ['hesitation', 'n.', '猶豫'], ['acceptable', 'adj.', '可接受的'],
      ['notifying', 'v.', '通知'], ['refusal', 'n.', '拒絕'], ['underestimating', 'v.', '低估'], ['panicked', 'adj.', '恐慌的'],
      ['destination', 'n.', '目的地'], ['companions', 'n.', '同伴'], ['independence', 'n.', '自主獨立'], ['allowance', 'n.', '零用錢'],
      ['transparently', 'adv.', '透明坦誠地'], ['installments', 'n.', '分期'], ['consult', 'v.', '商量'], ['dispute', 'n.', '爭執'],
      ['sarcastic', 'adj.', '諷刺的'], ['awkward', 'adj.', '尷尬的'], ['principle', 'n.', '原則'], ['permission', 'n.', '許可'],
      ['privacy', 'n.', '隱私'], ['belongings', 'n.', '私人物品'], ['clutter', 'n.', '雜物'], ['mindset', 'n.', '心態'],
      ['independently', 'adv.', '獨立地'], ['commuted', 'v.', '通勤'], ['colliding', 'v.', '碰撞'], ['intersection', 'n.', '十字路口'],
      ['outweighs', 'v.', '比……更重要'], ['non-urgent', 'adj.', '非緊急的']
    ],
    B2: [
      ['inevitably', 'adv.', '不可避免地'], ['escalating', 'v.', '升級擴大'], ['hectic', 'adj.', '兵荒馬亂的'], ['composed', 'adj.', '鎮定冷靜的'],
      ['autonomy', 'n.', '自主權'], ['undermined', 'v.', '削弱'], ['recurrence', 'n.', '再次發生'], ['punctuality', 'n.', '準時'],
      ['restorative', 'adj.', '恢復元氣的'], ['consecutive', 'adj.', '連續的'], ['drained', 'adj.', '精力耗盡的'], ['depleted', 'adj.', '耗盡的'],
      ['exhaustion', 'n.', '筋疲力盡'], ['overexertion', 'n.', '過度硬撐'], ['empathy', 'n.', '同理心'], ['reinforce', 'v.', '強化鞏固'],
      ['accountable', 'adj.', '負起責任的'], ['setback', 'n.', '挫折'], ['guardians', 'n.', '監護人'], ['defensively', 'adv.', '防衛性地'],
      ['de-escalate', 'v.', '緩和降溫'], ['accumulated', 'adj.', '累積的'], ['constructive', 'adj.', '建設性的'], ['impulsive', 'adj.', '衝動的'],
      ['stonewalling', 'n.', '冷戰封閉'], ['withheld', 'v.', '隱瞞不報'], ['intervened', 'v.', '介入處理'], ['reprimand', 'n.', '斥責'],
      ['reluctance', 'n.', '顧慮不願'], ['procrastination', 'n.', '拖延'], ['transparent', 'adj.', '透明坦誠的'], ['non-negotiable', 'adj.', '絕不妥協的'],
      ['detoured', 'v.', '繞道'], ['itinerary', 'n.', '行程'], ['candidly', 'adv.', '坦白地'], ['apprehension', 'n.', '憂慮'],
      ['unreachable', 'adj.', '失聯的'], ['concise', 'adj.', '簡潔的'], ['diverted', 'v.', '挪用'], ['depleting', 'v.', '耗盡'],
      ['discretionary', 'adj.', '可自由支配的'], ['deliberation', 'n.', '審慎思考'], ['deficit', 'n.', '透支赤字'], ['inequities', 'n.', '不公'],
      ['retracted', 'v.', '收回撤回'], ['resentment', 'n.', '怨懟委屈'], ['ridicule', 'n.', '嘲諷'], ['grievances', 'n.', '不滿委屈'],
      ['dignity', 'n.', '尊嚴'], ['consent', 'n.', '同意'], ['inadvertently', 'adv.', '不慎地'], ['restitution', 'n.', '賠償修復'],
      ['inviolable', 'adj.', '不可侵犯的'], ['accountability', 'n.', '責任課責'], ['stagnate', 'v.', '堆積發臭'], ['postponement', 'n.', '拖延'],
      ['self-reliance', 'n.', '生活自理'], ['unhelmeted', 'adj.', '未戴安全帽的'], ['complacency', 'n.', '僥倖大意'], ['hazard', 'n.', '隱患'],
      ['supersedes', 'v.', '優先於']
    ]
  };

  function extractVocabFromEnglish(enText, lvl) {
    const lower = String(enText || '').toLowerCase();
    const order = lvl === 'A1' ? ['A1', 'A2'] : (lvl === 'A2' ? ['A2', 'A1', 'B1'] : (lvl === 'B1' ? ['B1', 'B2', 'A2'] : ['B2', 'B1', 'A2']));
    const picked = [];
    const seen = new Set();

    for (const tier of order) {
      for (const entry of (CEFR_GLOSSARY[tier] || [])) {
        const key = entry[0].toLowerCase();
        if (seen.has(key)) continue;
        const re = new RegExp(`\\b${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        if (re.test(lower)) {
          seen.add(key);
          picked.push(entry);
          if (picked.length >= 8) return picked;
        }
      }
    }
    return picked;
  }

  /* -------------------- 狀態管理 -------------------- */
  let activeTone = 'gentle_family';
  let activeCefr = 'A2';
  let activeRTab = 'article';
  let activeMobTab = 'draft';
  let isDemoing = false;
  let isComposingZh = false;
  let syncTimer = null;
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

  function extractActorAndTime(text) {
    const names = [
      '保健室阿姨', '導護老師', '補習班老師',
      '小宇', '小傑', '小華', '小明', '小強', '小美', '小凱', '阿凱', '阿明',
      '哥哥', '姊姊', '姐姐', '弟弟', '妹妹', '我', '媽媽', '爸爸', '爸媽', '導師', '老師', '同學'
    ].sort((a, b) => b.length - a.length);

    const found = [];
    for (const n of names) {
      if (n === '我') {
        if (text.startsWith('我') || /[，。、：:\s]我/.test(text)) found.push({ n: '我', pos: text.indexOf('我') });
        continue;
      }
      const pos = text.indexOf(n);
      if (pos !== -1 && !found.some(x => x.n.includes(n) || n.includes(x.n))) found.push({ n, pos });
    }
    found.sort((a, b) => a.pos - b.pos);

    let timeZh = '', timeEn = 'Recently';
    if (text.includes('昨晚') || text.includes('昨天晚上')) { timeZh = '昨晚'; timeEn = 'Last night'; }
    else if (text.includes('今天早上') || text.includes('今早')) { timeZh = '今天早上'; timeEn = 'This morning'; }
    else if (text.includes('昨天')) { timeZh = '昨天'; timeEn = 'Yesterday'; }
    else if (text.includes('這禮拜') || text.includes('這週')) { timeZh = '這週'; timeEn = 'This week'; }
    else if (text.includes('這個月') || text.includes('本月')) { timeZh = '這個月'; timeEn = 'This month'; }
    else if (text.includes('今天')) { timeZh = '今天'; timeEn = 'Today'; }

    return { actor: found[0] ? found[0].n : '', others: found.slice(1).map(x => x.n), timeZh, timeEn };
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
    const enPack = translateZhArticleToEn(out.articleZh, lvl, tone, out);
    out.articleEn = enPack.en;
    out.enVocab = enPack.vocab;
    return out;
  }

  // 即時根據中文文章更新英文（保留使用者在中文輸入框的游標焦點！）
  function syncEnglishFromZh(inPlace = false) {
    const enPack = translateZhArticleToEn(data.articleZh, data.cefrLevel || activeCefr, data.tone || activeTone, data);
    data.cefrLevel = enPack.level;
    data.articleEn = enPack.en;
    data.enVocab = enPack.vocab;
    updateCounters();

    if (typeof document === 'undefined') return enPack;
    if (inPlace) {
      const enBox = document.getElementById('en-article-box');
      if (enBox) enBox.value = data.articleEn;
      const vocabWrap = document.getElementById('en-vocab-list');
      if (vocabWrap) {
        vocabWrap.innerHTML = data.enVocab.map(v => `
          <button type="button" class="vocab-chip" data-word="${escapeHtml(v[0])}">
            <span class="vocab-word">${escapeHtml(v[0])}</span>
            <span class="vocab-pos">(${escapeHtml(v[1])})</span>
            <span>${escapeHtml(v[2])}</span>
          </button>`).join('');
      }
      const syncTag = document.getElementById('en-sync-tag');
      if (syncTag) syncTag.textContent = '已隨中文同步 ✓';
    } else {
      refreshAllViews(true);
    }
    return enPack;
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
    const enPack = translateZhArticleToEn(data.articleZh, activeCefr, data.tone || activeTone, data);
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
    if (data.articleZh || data.rawInput || data.d1.problemDesc) {
      if (!data.articleZh) data.articleZh = composeZhArticle(data);
      const enPack = translateZhArticleToEn(data.articleZh, newLevel, data.tone || activeTone, data);
      data.articleEn = enPack.en;
      data.enVocab = enPack.vocab;
    }
    refreshAllViews(true);
    showToast(`已切換英文難度：${CEFR_META[newLevel].title}`, 'success');
  }

  function applyToneSwitch(newTone) {
    if (!TONE_LABELS[newTone]) return;
    activeTone = newTone;
    if (typeof document !== 'undefined') {
      document.querySelectorAll('.seg-btn').forEach(b => {
        const act = b.dataset.tone === newTone;
        b.classList.toggle('active', act);
        b.setAttribute('aria-checked', String(act));
      });
    }
    if (!data.articleZh && !data.rawInput && !data.d1.problemDesc) return;
    data.tone = newTone;
    // 若使用者直接編輯過中文短文，保留其核心文字並置換語氣前綴與收尾，再連動翻譯英文！
    const prevZh = String(data.articleZh || '');
    const hadCustomZh = prevZh && prevZh !== composeZhArticle({ ...data, tone: data.tone });
    if (!hadCustomZh && data.d1.problemDesc) {
      data.articleZh = composeZhArticle(data);
    } else if (prevZh) {
      const stripped = prevZh.replace(/^(?:家人好好聊聊這次的事[：:]|回顧這次事件[，,]|本次輔導紀錄摘要[：:])/, '');
      const newPrefix = newTone === 'teen_growth'
        ? '回顧這次事件，'
        : (newTone === 'teacher_record' ? '本次輔導紀錄摘要：' : '家人好好聊聊這次的事：');
      let nextZh = `${newPrefix}${stripped}`;
      if (countZh(nextZh) > MAX_ZH_CHARS) nextZh = nextZh.slice(0, MAX_ZH_CHARS - 1).replace(/[，、；：]$/, '') + '。';
      data.articleZh = nextZh;
    }
    const enPack = translateZhArticleToEn(data.articleZh, activeCefr, newTone, data);
    data.articleEn = enPack.en;
    data.enVocab = enPack.vocab;
    refreshAllViews(true);
    showToast(`已切換為「${TONE_LABELS[newTone]}」，中英短文已同步更新！`, 'success');
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

  async function translateCurrentZhViaExternalAi(provider) {
    const apiKey = document.getElementById('llm-api-key').value.trim();
    const model = document.getElementById('llm-model-name').value.trim() || (provider === 'ollama' ? 'qwen2.5' : 'gemini-2.5-flash');
    if (provider === 'gemini' && !apiKey) {
      syncEnglishFromZh(false);
      showToast('未填 API Key，已改由離線連動引擎翻譯中文短文。', 'warning');
      return;
    }
    const cefrInfo = CEFR_META[activeCefr] || CEFR_META.A2;
    const prompt = `請將以下繁體中文短文忠實翻譯為英文，必須一字不漏對應中文的每一個句子意思，並符合【${cefrInfo.promptSpec}】與語氣「${TONE_LABELS[activeTone]}」。
同時回傳 6～8 個出現在譯文中的 CEFR ${cefrInfo.code} 重點單字陣列 enVocab，每項格式為 ["word", "詞性", "中文意思"]。
中文短文：${String(data.articleZh || '').slice(0, 600)}
請嚴格輸出純 JSON：{"articleEn":"...","enVocab":[...]}`;

    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 30000);
    try {
      let parsed;
      if (provider === 'gemini') {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          signal: ctrl.signal,
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json' } })
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
      if (parsed.articleEn) data.articleEn = parsed.articleEn;
      if (Array.isArray(parsed.enVocab) && parsed.enVocab.length) data.enVocab = parsed.enVocab;
      else data.enVocab = extractVocabFromEnglish(data.articleEn, activeCefr);
      refreshAllViews(true);
      showToast(`已由 ${provider === 'gemini' ? 'Gemini' : 'Ollama'} 依中文文章同步翻譯（${activeCefr}）！`, 'success');
    } catch (e) {
      clearTimeout(tid);
      syncEnglishFromZh(false);
      showToast('外部 AI 連線失敗或逾時，已改由離線引擎連動翻譯。', 'warning');
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
    const prompt = `你現在是「如果跟我這樣說.....」雙語對話整理助手。請將以下台灣國高中生口語白話情境，自動補足為完整結構（發生經過、當下處置、真正原因、改善補償、共同約定）的繁體中文短文與忠實對應的英文翻譯。
嚴格要求：
1. articleZh：流暢自然的完整結構中文文章，總字數絕對不可超過 300 字（建議 200～270 字），語氣為「${TONE_LABELS[activeTone]}」。
2. articleEn：必須忠實對應 articleZh 的完整中文內容逐句翻譯，並嚴格符合【${cefrInfo.promptSpec}】。
3. enVocab：列出實際出現在 articleEn 中的 6～8 個 CEFR ${cefrInfo.code} 重點單字陣列，每項格式為 ["word", "詞性", "中文意思"]。
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
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json' } })
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
          <p>系統會自動補足完整對話結構（發生經過、當下處置、背後原因、改善補償、共同約定），並即時連動 CEFR A1／A2／B1／B2 英文翻譯、單字卡與發音朗讀。</p>
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
            <textarea id="zh-article-box" rows="4" class="article-textarea" data-edit="articleZh">${escapeHtml(data.articleZh)}</textarea>
            <div class="check-pills">
              <span class="check-pill">✓ D1 發生經過</span>
              <span class="check-pill">✓ D2 當下處理</span>
              <span class="check-pill">✓ D3 背後原因</span>
              <span class="check-pill">✓ D4 改善補償</span>
              <span class="check-pill">✓ D5 共同約定</span>
              <span id="en-sync-tag" class="badge badge-confirmed">改字自動連動英文 ✓</span>
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
                <button type="button" class="btn btn-secondary btn-mini" data-sync-en="1" title="依目前中文文章重新翻譯">🔄 同步中文</button>
                <button type="button" class="btn btn-secondary btn-mini" data-speak="1.0">🔊 朗讀</button>
                <button type="button" class="btn btn-secondary btn-mini" data-speak="0.78">🐢 慢速</button>
                <button type="button" class="btn btn-secondary btn-mini" data-copy="en">複製英文</button>
              </div>
            </div>
            <textarea id="en-article-box" rows="4" class="article-textarea en-text" data-edit="articleEn">${escapeHtml(data.articleEn)}</textarea>
            <div>
              <div class="vocab-section-title">本篇 CEFR ${escapeHtml(cefr.code)}（${escapeHtml(cefr.short)}）核心單字（點擊發音）：</div>
              <div id="en-vocab-list" class="vocab-grid">
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
          <div><button type="button" class="btn btn-primary btn-touch" data-resync="1">套用修改並同步更新中英短文</button></div>
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

      const se = e.target.closest('[data-sync-en]');
      if (se) {
        const provider = document.getElementById('llm-provider').value;
        if (provider !== 'offline') {
          await translateCurrentZhViaExternalAi(provider);
        } else {
          syncEnglishFromZh(false);
          showToast(`已依中文文章同步更新 ${activeCefr} 英文翻譯！`, 'success');
        }
        return;
      }

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
        syncEnglishFromZh(false);
        switchRightTab('article', true);
        showToast(`已依結構重組中英短文（${countZh(data.articleZh)} / 300 字｜CEFR ${activeCefr}）！`, 'success');
      }
    });

    // 處理中文注音／拼音輸入法組字狀態，避免中斷輸入
    canvas.addEventListener('compositionstart', e => {
      if (e.target && e.target.dataset && e.target.dataset.edit === 'articleZh') isComposingZh = true;
    });
    canvas.addEventListener('compositionend', e => {
      if (e.target && e.target.dataset && e.target.dataset.edit === 'articleZh') {
        isComposingZh = false;
        setPath(data, 'articleZh', e.target.value);
        syncEnglishFromZh(true);
      }
    });

    canvas.addEventListener('input', e => {
      const ed = e.target.closest('[data-edit]');
      if (!ed) return;
      setPath(data, ed.dataset.edit, ed.value);
      updateCounters();
      if (ed.dataset.edit === 'articleZh' && !isComposingZh) {
        const syncTag = document.getElementById('en-sync-tag');
        if (syncTag) syncTag.textContent = '連動翻譯中...';
        clearTimeout(syncTimer);
        syncTimer = setTimeout(() => syncEnglishFromZh(true), 280);
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
      translateZhArticleToEn,
      syncEnglishFromZh,
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
