/**
 * 如果跟我這樣說..... — 口語白話 → ≤300 字完整結構短文 ＋ 國中程度 CEFR A2 英文翻譯
 * 支援 100% 離線雙語引擎 ＋ 選填 Gemini／Ollama，桌機單畫面零捲動 ＋ 手機底部 4 分頁導覽
 */
(() => {
  'use strict';

  const STORAGE_KEY = '5d_teen_bilingual_a2_v1';
  const MAX_ZH_CHARS = 300;
  const TAB_ORDER = ['article', 'd1', 'd2', 'd3', 'd4', 'd5', 'a4'];
  const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
  const TONE_LABELS = {
    gentle_family: '溫和親子對話版',
    teen_growth: '青春自律成長版',
    teacher_record: '師長輔導紀錄版'
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
    showToast(rate < 1 ? '慢速朗讀 A2 英文中...' : '朗讀 A2 英文中...');
  }

  /* -------------------- 9 大國高中情境範例與雙語知識庫 -------------------- */
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
      id: '3c_sleep', label: '3C 與睡眠作息', enLabel: 'phone habits and sleep',
      kw: /(手機|手遊|短影音|抖音|IG|YouTube|追劇|遊戲|Switch|平板|電腦|熬夜|凌晨|清晨|半夜|遲到|睡過頭|起不來|叫不醒|睡眠|打瞌睡)/g,
      title: a => `${a}夜間使用手機與作息調整`,
      when: '昨晚至今天早上', where: '家中臥室', item: '手機',
      why: '違反睡前收手機與準時上學的約定', how: '早上叫不醒上學遲到被發現', impact: '導致遲到、精神不濟也讓家人擔心',
      d2: '先協助整理出門確保平安到校，不於早晨擴大爭執，並約定放學後冷靜討論。',
      d3: '白天課業壓力大，想靠熬夜滑手機換取自由時間，加上手機放床邊缺少停損界限。',
      d4: '客廳設手機充電區，改用實體鬧鐘起床，並安排每天放學後 30 分鐘合法放鬆時間。',
      d5: '訂立作息公約：平日晚上固定時間手機放客廳充電，連續一週零遲到給予肯定。',
      en: {
        d1: (s, t) => `${t}, ${s.subj} stayed up very late playing on the phone, so ${s.subjLow} got up late and was late for school.`,
        d2: (s) => `First, ${s.we} stayed calm and made sure ${s.subjLow} got to school safely without fighting in the morning.`,
        d3: (s) => `The real reason was school stress. ${s.Subj} wanted some free time at night, and keeping the phone by the bed made it hard to stop.`,
        d4: (s) => `To make things better, ${s.subjLow} will put the phone in the living room before bed, use a real alarm clock, and take a 30-minute break after school.`,
        d5: (s) => `Finally, ${s.we} made a family rule: put the phone outside the bedroom on school nights and arrive at school on time.`
      },
      vocab: [
        ['stay up late', 'phr.', '熬夜'],
        ['late for school', 'phr.', '上學遲到'],
        ['calm', 'adj.', '冷靜的'],
        ['stress', 'n.', '壓力'],
        ['living room', 'n.', '客廳'],
        ['alarm clock', 'n.', '鬧鐘'],
        ['rule', 'n.', '規則／公約']
      ]
    },
    emotion_comm: {
      id: 'emotion_comm', label: '情緒與親子溝通', enLabel: 'anger and family talks',
      kw: /(發脾氣|大發脾氣|甩門|頂嘴|大吼|大叫|吵起來|冷戰|擺臭臉|嫌囉唆|嫌麻煩|不耐煩|罵髒話|摔東西|口氣差|嗆|生氣)/g,
      title: a => `${a}情緒管理與好好說話`,
      when: '今天溝通時段', where: '家中客廳與房門', item: '親子溝通',
      why: '違反理性表達、不甩門吼叫的尊重約定', how: '對話中情緒升高當場爆發', impact: '讓家人受傷且氣氛緊繃',
      d2: '雙方先暫停 15 分鐘各自深呼吸冷靜，避免在氣頭上說出傷人的話。',
      d3: '當下壓力與煩躁已達臨界點，又缺乏「喊暫停」的溝通暗號，才會用甩門防衛。',
      d4: '為衝動口氣誠懇道歉，並建立「我需要冷靜 15 分鐘」暫停暗號，大人也減少重複催促。',
      d5: '訂立溝通公約：生氣不甩門、不冷戰，先冷靜再說出心裡真正的感受。',
      en: {
        d1: (s, t) => `${t}, ${s.subj} got very angry during a talk at home, shouted back, and closed the door hard.`,
        d2: (s) => `First, everyone took a 15-minute break to calm down so nobody said hurtful words.`,
        d3: (s) => `The main reason was too much stress. ${s.Subj} felt pushed and did not know how to ask for space nicely.`,
        d4: (s) => `Next, ${s.subjLow} said sorry for being rude. We also made a quiet sign: anyone can say "I need 15 minutes" before a fight starts.`,
        d5: (s) => `Finally, we agreed on a family rule: no shouting or slamming doors, and always talk nicely after we cool down.`
      },
      vocab: [
        ['angry', 'adj.', '生氣的'],
        ['shout', 'v.', '大叫／吼叫'],
        ['take a break', 'phr.', '休息一下'],
        ['hurtful', 'adj.', '傷人的'],
        ['say sorry', 'phr.', '道歉'],
        ['rude', 'adj.', '沒禮貌的'],
        ['agree', 'v.', '同意／約定']
      ]
    },
    study_exam: {
      id: 'study_exam', label: '課業與誠信自律', enLabel: 'homework and school tests',
      kw: /(段考|期中考|期末考|考卷|成績單|不及格|考差|考很差|作業|功課|習作|聯絡簿|沒交|缺交|沒寫|抄襲|作弊|代簽|藏考卷|隱瞞成績)/g,
      title: a => `${a}課業面對與誠實求助`,
      when: '這週上課期間', where: '學校與家中書桌', item: '作業與考卷',
      why: '違反誠實面對成績與準時交作業的約定', how: '老師聯繫家長或檢查時發現', impact: '造成課業落後與信任受損',
      d2: '先一起攤開缺交作業與考卷盤點清單，並主動聯繫老師確認補交期限。',
      d3: '因為考差怕被責罵，加上不會寫不敢發問，才選擇拖延與藏起來逃避。',
      d4: '將作業拆成每天 25 分鐘小進度完成，睡前核對書包，遇到難題 24 小時內主動求助。',
      d5: '訂立學習公約：成績可以不完美，但考卷必誠實呈現；大人先協助找方法不情緒責罵。',
      en: {
        d1: (s, t) => `${t}, ${s.subj} did not hand in homework on time and hid a bad math test paper at home until the teacher called.`,
        d2: (s) => `First, we checked all the missing homework together and asked the teacher for a new date to turn it in.`,
        d3: (s) => `The real reason was fear. ${s.Subj} felt scared of getting scolded and felt shy about asking questions when the work was hard.`,
        d4: (s) => `Next, ${s.subjLow} will study for 25 minutes each evening without a phone and check the school bag before bed.`,
        d5: (s) => `Finally, we made an honest rule: always show test papers within one day, and parents will help find better study ways instead of yelling.`
      },
      vocab: [
        ['hand in', 'phr.', '繳交'],
        ['hide (hid)', 'v.', '藏起來'],
        ['missing', 'adj.', '缺漏的'],
        ['scared', 'adj.', '害怕的'],
        ['shy', 'adj.', '害羞的'],
        ['check', 'v.', '檢查'],
        ['honest', 'adj.', '誠實的']
      ]
    },
    outing_safety: {
      id: 'outing_safety', label: '外出與行蹤安全', enLabel: 'going out safely',
      kw: /(晚歸|沒回家|未歸|失聯|找不到人|翹課|翹補習|補習班|提早下課|逛街|西門町|網咖|KTV|宵夜|去玩|未報備|沒告知|沒傳訊息|報警)/g,
      title: a => `${a}課後外出與安全報備`,
      when: '昨晚課後至深夜', where: '校外商圈與返家途中', item: '課後行蹤報備',
      why: '違反行程變動必須事前報備的安全約定', how: '超過返家時間失聯經家人聯繫得知', impact: '讓家人極度焦慮並折損外出信任',
      d2: '確認平安返家無恙後，先安撫彼此情緒，並如實交代去向與同行朋友。',
      d3: '擔心先問會被拒絕而心存僥倖，也低估了聯絡不到人讓父母產生的恐慌。',
      d4: '養成 30 秒報備四要素（去哪、跟誰、幾點回、怎麼回），並設父母來電穿透靜音。',
      d5: '訂立外出公約：行程變動出發前必傳訊息報平安，連續準時報備即維持社交自主權。',
      en: {
        d1: (s, t) => `${t}, ${s.subj} went out with friends after cram school and came home very late without sending a message to family.`,
        d2: (s) => `First, we made sure ${s.subjLow} came home safely, calmed down, and talked clearly about where ${s.subjLow} went.`,
        d3: (s) => `The reason was worry about hearing "no." ${s.Subj} did not think about how scared parents feel when they cannot reach their child.`,
        d4: (s) => `Next, ${s.subjLow} will send a quick message with the place, friends, and time before going anywhere, and keep the phone ring on for parents.`,
        d5: (s) => `Finally, we agreed on a safety rule: always text before changing plans, and parents will trust ${s.obj} to enjoy time with friends.`
      },
      vocab: [
        ['cram school', 'n.', '補習班'],
        ['message', 'n.', '訊息'],
        ['safely', 'adv.', '平安地'],
        ['reach', 'v.', '聯絡上'],
        ['change plans', 'phr.', '改變計畫'],
        ['safety', 'n.', '安全'],
        ['trust', 'v.', '信任']
      ]
    },
    money_spend: {
      id: 'money_spend', label: '金錢與財務自律', enLabel: 'spending money wisely',
      kw: /([0-9一二兩三四五六七八九十百千萬]+元|塊錢|餐費|早餐錢|午餐錢|零用錢|壓歲錢|生活費|點數卡|儲值|課金|網購|蝦皮|刷卡|借錢|欠錢|透支|花光|超商)/g,
      title: a => `${a}零用錢管理與理性消費`,
      when: '這個月消費期間', where: '超商與學校', item: '餐費與零用錢',
      why: '違反專款專用與不私下借錢的理財約定', how: '月底沒錢吃飯或核對發票時發現', impact: '影響正常飲食並引發借貸困擾',
      d2: '先誠實盤點所有花費與欠款，並由家人陪同隔日立刻歸還同學借款。',
      d3: '餐費和娛樂費混放又沒記帳，面對遊戲點數限時誘惑時缺少冷靜緩衝。',
      d4: '改用分袋管理把吃飯錢與娛樂費分開，逾 300 元消費先等 24 小時，並分期償還透支。',
      d5: '訂立理財公約：每週日簡單記帳核對餘額，遇資金困難誠實找家人商量絕不私下借錢。',
      en: {
        d1: (s, t) => `${t}, ${s.subj} spent lunch money on game cards at a store, so there was no money left for food and ${s.subjLow} borrowed money from a classmate.`,
        d2: (s) => `First, we checked all the spending honestly and paid the classmate back the very next day.`,
        d3: (s) => `The reason was mixing meal money with fun money. Without keeping notes, it was easy to buy things too fast.`,
        d4: (s) => `Next, ${s.subjLow} will keep lunch money in a separate bag, wait 24 hours before buying fun things, and pay back the extra cost step by step.`,
        d5: (s) => `Finally, we made a money rule: write down weekly spending, never borrow big money from friends, and talk to parents when needing help.`
      },
      vocab: [
        ['spend (spent)', 'v.', '花費'],
        ['borrow', 'v.', '借入'],
        ['pay back', 'phr.', '還錢'],
        ['separate', 'adj.', '分開的'],
        ['cost', 'n.', '費用'],
        ['weekly', 'adj.', '每週的'],
        ['honestly', 'adv.', '誠實地']
      ]
    },
    peer_social: {
      id: 'peer_social', label: '同儕社群與手足', enLabel: 'talking kindly with friends',
      kw: /(群組|LINE|限動|截圖|酸|排擠|分組報告|同學吵架|口角|打架|推擠|搶|遙控器|電視|手足|吵架|說壞話|公審|霸凌|翻臉)/g,
      title: a => `${a}同儕群組與理性溝通`,
      when: '課餘互動時段', where: '班級群組與學校', item: '群組互動與分工',
      why: '違反對事不對人、不公開嘲諷截圖的界限', how: '群組口角傳開造成氣氛尷尬', impact: '傷害對方感受並破壞團體氣氛',
      d2: '立即停止筆戰並收回不當訊息，把公開爭執拉回私下理性對話。',
      d3: '因覺得分工不公累積委屈，隔著螢幕衝動想證明自己對，忘了公開酸人只會傷感情。',
      d4: '向對方誠懇道歉並重新列清楚分工表，養成生氣文字先存備忘錄放 10 分鐘的習慣。',
      d5: '訂立人際公約：私下溝通、公開尊重，生氣時絕不立刻按送出也不截圖公審。',
      en: {
        d1: (s, t) => `${t}, ${s.subj} argued with a classmate in the class group chat about team work and posted mean words that made everyone uncomfortable.`,
        d2: (s) => `First, ${s.subjLow} stopped fighting online, deleted the bad message, and moved the talk to a private chat.`,
        d3: (s) => `The real reason was feeling unfair about the work. Typing behind a screen made it too easy to send angry words without thinking.`,
        d4: (s) => `Next, ${s.subjLow} will say sorry nicely, make a clear work list with the team, and wait 10 minutes before sending any angry text.`,
        d5: (s) => `Finally, we agreed on a social rule: talk in private, be kind in public groups, and never post screenshots to hurt others.`
      },
      vocab: [
        ['argue', 'v.', '爭吵'],
        ['mean', 'adj.', '刻薄的'],
        ['delete', 'v.', '刪除'],
        ['private', 'adj.', '私下的'],
        ['unfair', 'adj.', '不公平的'],
        ['public', 'adj.', '公開的'],
        ['hurt', 'v.', '傷害']
      ]
    },
    boundary_item: {
      id: 'boundary_item', label: '物品與隱私界限', enLabel: 'respecting personal things',
      kw: /(擅自|沒問過|未經同意|沒經過同意|偷拿|偷看|翻看|日記|耳機|藍牙耳機|玩偶|彩色筆|文具|筆記本|化妝品|球鞋|模型|卡牌|弄壞|摔裂|摔壞|弄丟|隱私|私人物品)/g,
      title: a => `${a}尊重物品與隱私界限`,
      when: '昨天出門前', where: '家人房間與學校', item: '他人私人物品',
      why: '違反未經同意不得進入房間拿取私物的界限', how: '物主回家發現物品受損後抗議', impact: '造成財物受損與嚴重不被尊重感',
      d2: '立即雙手歸還物品並如實說明損壞情形，由家人先安撫物主情緒。',
      d3: '圖一時方便又怕被拒絕，抱持熟人借一下沒關係的僥倖心態，忽略他人安全感。',
      d4: '正式道歉不找藉口，以零用錢或家務存錢賠償維修費，落實進房先敲門、借物先問過。',
      d5: '訂立界限公約：全家人互相尊重私人空間與物品，對方有權說不，損壞一定負責。',
      en: {
        d1: (s, t) => `${t}, ${s.subj} took a family member's earphones without asking and accidentally broke the case at school.`,
        d2: (s) => `First, ${s.subjLow} gave the item back right away, told the truth about the damage, and listened to the owner's feelings.`,
        d3: (s) => `The reason was wanting a quick favor and feeling afraid of hearing "no." ${s.Subj} forgot that personal things need respect.`,
        d4: (s) => `Next, ${s.subjLow} will say sorry clearly, use pocket money to help fix or buy a new one, and always knock before entering a room.`,
        d5: (s) => `Finally, we made a respect rule: always ask first before borrowing anything, and accept "no" politely.`
      },
      vocab: [
        ['without asking', 'phr.', '沒先詢問'],
        ['accidentally', 'adv.', '不小心'],
        ['break (broke)', 'v.', '弄壞'],
        ['truth', 'n.', '實話'],
        ['respect', 'n./v.', '尊重'],
        ['pocket money', 'n.', '零用錢'],
        ['politely', 'adv.', '有禮貌地']
      ]
    },
    chore_self: {
      id: 'chore_self', label: '家務與生活自理', enLabel: 'home chores and tidying up',
      kw: /(倒垃圾|垃圾車|廚餘|洗碗|水槽|發臭|做家事|家務|打掃|整理房間|書桌|雜物|臭襪子|洗衣籃|長螞蟻|發霉|值日生|髒亂)/g,
      title: a => `${a}家務責任與生活自理`,
      when: '這週晚間家務時段', where: '家中廚房與書桌', item: '負責家務與整潔',
      why: '違反按時完成分工家務與維護整潔的約定', how: '家人發現碗盤發臭與桌面雜亂', impact: '影響環境衛生也增加家人負擔',
      d2: '立即放下螢幕花 15 分鐘洗清碗盤與整理桌面，並向善後的家人道謝致歉。',
      d3: '放學只想先追劇放鬆，抱持「等一下再做」拖延心態，且未設固定鬧鐘提醒。',
      d4: '設手機定時鬧鐘先做 10 分鐘家務再休息，睡前執行 3 分鐘桌面清零，忙時提前換班。',
      d5: '訂立分工公約：自己設鬧鐘完成分內家務、不拖過隔夜，大人也不反覆碎念催促。',
      en: {
        d1: (s, t) => `${t}, ${s.subj} kept watching videos after school and forgot to wash the dishes and clean the desk for two days.`,
        d2: (s) => `First, ${s.subjLow} put the screen away, spent 15 minutes cleaning the sink and desk right away, and thanked the family.`,
        d3: (s) => `The reason was waiting until "later." Without a set alarm, it was easy to forget chores while relaxing.`,
        d4: (s) => `Next, ${s.subjLow} will set a phone alarm to finish chores before playing, and spend 3 minutes tidying the desk every night.`,
        d5: (s) => `Finally, we made a home rule: finish daily chores before bed without reminders, and ask to trade turns early during exam weeks.`
      },
      vocab: [
        ['wash the dishes', 'phr.', '洗碗'],
        ['clean', 'v./adj.', '清理／乾淨的'],
        ['forget (forgot)', 'v.', '忘記'],
        ['chore', 'n.', '家務'],
        ['tidy', 'v.', '整理'],
        ['daily', 'adj.', '每日的'],
        ['trade turns', 'phr.', '輪流換班']
      ]
    },
    safety_health: {
      id: 'safety_health', label: '交通安全與健康', enLabel: 'road safety',
      kw: /(安全帽|腳踏車|單車|電動自行車|微電車|機車|闖紅燈|闖黃燈|搶快|過馬路|擦撞|摔車|導護|走廊奔跑|實驗室|手搖飲|不吃正餐|受傷|發燒|淋雨|雨衣)/g,
      title: a => `${a}通學交通安全與防護`,
      when: '今天早上上學途中', where: '通學路口與馬路', item: '安全帽與交通規則',
      why: '違反配戴安全帽與遵守號誌的安全紅線', how: '路口搶快被導護老師當場攔下勸導', impact: '潛藏嚴重車禍風險並讓家人後怕',
      d2: '立即停車確認平安無事，向導護老師道謝，並將安全帽固定放於玄關必拿處。',
      d3: '早上出門太趕怕遲到，心存「路很短不會出事」僥倖心態，把安全換成幾十秒方便。',
      d4: '每天提早 10 分鐘從容出門，安全帽放車上做到不戴不上路，路口確實停看聽。',
      d5: '訂立安全公約：安全永遠大於趕時間，寧可遲到報備，絕不沒戴安全帽或搶黃紅燈。',
      en: {
        d1: (s, t) => `${t}, ${s.subj} rode an e-bike to school without a helmet and tried to beat a yellow light until a teacher stopped ${s.obj}.`,
        d2: (s) => `First, ${s.subjLow} stopped safely, thanked the teacher for the warning, and put the helmet right by the front door.`,
        d3: (s) => `The reason was rushing for school. ${s.Subj} thought the trip was short and forgot that one mistake on the road can be very dangerous.`,
        d4: (s) => `Next, ${s.subjLow} will leave home 10 minutes earlier every morning, always wear the helmet, and slow down at every corner.`,
        d5: (s) => `Finally, we agreed on a safety rule: being safe is always more important than being fast. Never run a yellow or red light.`
      },
      vocab: [
        ['helmet', 'n.', '安全帽'],
        ['yellow light', 'n.', '黃燈'],
        ['warning', 'n.', '提醒／警告'],
        ['rush', 'v.', '趕時間／匆忙'],
        ['dangerous', 'adj.', '危險的'],
        ['slow down', 'phr.', '減速'],
        ['important', 'adj.', '重要的']
      ]
    }
  };

  /* -------------------- 狀態管理 -------------------- */
  let activeTone = 'gentle_family';
  let activeRTab = 'article';
  let activeMobTab = 'draft';
  let isDemoing = false;
  let data = blankData();

  function blankData() {
    const td = todayStr();
    return {
      reportId: `5D-A2-${td.replace(/-/g, '')}-${Math.floor(Math.random() * 900 + 100)}`,
      rawInput: '',
      tone: activeTone,
      primaryDomain: '',
      secondaryDomain: '',
      title: '',
      partName: '',
      owner: '',
      dateCreated: td,
      targetCloseDate: addDays(td, 7),
      articleZh: '',
      articleEn: '',
      a2Vocab: [],
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

  function getEnglishSubject(actor, tone) {
    if (tone === 'teen_growth' || actor === '我') {
      return { subj: 'I', subjLow: 'I', Subj: 'I', obj: 'me', we: 'my family and I' };
    }
    const map = {
      '弟弟': { subj: 'my younger brother', subjLow: 'he', Subj: 'He', obj: 'him', we: 'we' },
      '哥哥': { subj: 'my older brother', subjLow: 'he', Subj: 'He', obj: 'him', we: 'we' },
      '姊姊': { subj: 'my older sister', subjLow: 'she', Subj: 'She', obj: 'her', we: 'we' },
      '姐姐': { subj: 'my older sister', subjLow: 'she', Subj: 'She', obj: 'her', we: 'we' },
      '妹妹': { subj: 'my younger sister', subjLow: 'she', Subj: 'She', obj: 'her', we: 'we' }
    };
    if (map[actor]) return map[actor];
    if (tone === 'teacher_record') {
      return { subj: 'the student', subjLow: 'the student', Subj: 'The student', obj: 'the student', we: 'we' };
    }
    return { subj: 'the teenager', subjLow: 'he or she', Subj: 'He or she', obj: 'them', we: 'we' };
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
      : (d.tone === 'teacher_record' ? '本次輔導紀錄摘要：' : '');
    const s2 = String(d.d2 || '').replace(/[。！!]$/, '');
    const s3 = String(d.d3 || '').replace(/[。！!]$/, '');
    const s4 = String(d.d4 || '').replace(/[。！!]$/, '');
    const s5 = String(d.d5 || '').replace(/[。！!]$/, '');

    const assemble = (rawPart, p2, p3, p4, p5) =>
      `${prefix}${rawPart}。當下先${p2.replace(/^先/, '')}。細想背後原因，主要是${p3.replace(/^因為/, '')}。未來改善方面，${p4}。最後大家共同${p5}。`;

    let article = assemble(cleanRaw, s2, s3, s4, s5);
    if (countZh(article) > MAX_ZH_CHARS) {
      const trimClause = (str, maxLen) =>
        str.length <= maxLen ? str : str.slice(0, maxLen - 1).replace(/[，、；：]$/, '') + '等';
      article = assemble(
        trimClause(cleanRaw, 58),
        trimClause(s2, 42),
        trimClause(s3, 46),
        trimClause(s4, 52),
        trimClause(s5, 48)
      );
    }
    if (countZh(article) > MAX_ZH_CHARS) {
      article = article.slice(0, MAX_ZH_CHARS - 1).replace(/[，、；：]$/, '') + '。';
    }
    return article;
  }

  function translateRefinementA2(text) {
    if (/(道歉|對不起)/.test(text)) return 'Also, saying sorry nicely helped everyone feel much better.';
    if (/(段考|考試|壓力)/.test(text)) return 'The big test pressure made it even harder to stay relaxed.';
    if (/(11點|十一點|客廳|充電|約定|公約)/.test(text)) return 'We clearly agreed to put the phone in the living room before 11 p.m. on school nights.';
    if (/(洗碗|倒垃圾|家事|補償)/.test(text)) return 'To show responsibility, helping with dishes and trash this week is part of the plan.';
    if (/(提早|10分鐘)/.test(text)) return 'Getting up 10 minutes earlier will also keep mornings calm.';
    return 'We talked openly about this extra detail and added it to our plan.';
  }

  function composeA2English(d, actorInfo) {
    const dom1 = KB[d.primaryDomain] || KB['3c_sleep'];
    const dom2 = d.secondaryDomain ? KB[d.secondaryDomain] : null;
    const s = getEnglishSubject(actorInfo.actor, d.tone);
    const t = actorInfo.timeEn || 'Recently';

    const parts = [
      dom1.en.d1(s, t),
      dom2 ? `At the same time, ${dom2.id === 'emotion_comm' ? `${s.subjLow} also got angry and closed the door hard.` : `this also caused a problem with ${dom2.enLabel}.`}` : '',
      dom1.en.d2(s),
      dom1.en.d3(s),
      dom1.en.d4(s),
      dom1.en.d5(s),
      ...(d.refinements || []).map(translateRefinementA2)
    ].filter(Boolean);

    const vocabMap = new Map();
    dom1.vocab.forEach(v => vocabMap.set(v[0], v));
    if (dom2) dom2.vocab.slice(0, 2).forEach(v => vocabMap.set(v[0], v));

    return {
      en: parts.join(' '),
      vocab: Array.from(vocabMap.values()).slice(0, 8)
    };
  }

  function buildFromPlainText(rawText, tone = activeTone) {
    const clean = String(rawText || '').trim();
    if (!clean) return null;
    const actorInfo = extractActorAndTime(clean);
    const { primary, secondary } = detectDomains(clean);
    const d1 = KB[primary];
    const d2 = secondary ? KB[secondary] : null;
    const actor = actorInfo.actor || (tone === 'teen_growth' ? '我' : '同學');

    const out = blankData();
    out.rawInput = clean;
    out.tone = tone;
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
    const enPack = composeA2English(out, actorInfo);
    out.articleEn = enPack.en;
    out.a2Vocab = enPack.vocab;
    return out;
  }

  function applySpokenRefinement(sentence) {
    const s = String(sentence || '').trim();
    if (!s) return null;
    let label = '中英短文與 5D 結構';
    if (/(約定|公約|家規|11點|客廳)/.test(s)) {
      data.d5 = s;
      label = 'D5 生活公約與中英短文';
    } else if (/(因為|原因|壓力|段考)/.test(s)) {
      data.d3 = `${s}，${data.d3}`;
      label = 'D3 真正原因與中英短文';
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
    const enPack = composeA2English(data, extractActorAndTime(data.rawInput || data.d1.problemDesc));
    data.articleEn = enPack.en;
    data.a2Vocab = enPack.vocab;

    if (typeof document !== 'undefined') {
      if (isMobileView()) switchMobileTab('draft');
      switchRightTab('article', true);
    }
    return { label, zhLen: countZh(data.articleZh) };
  }

  /* -------------------- 雙軌外部 AI（Gemini / Ollama） -------------------- */
  async function runGenerate() {
    const rawEl = document.getElementById('raw-input');
    const txt = rawEl ? rawEl.value.trim() : '';
    if (!txt) { showToast('請先說說發生的事情！', 'warning'); return; }
    const provider = document.getElementById('llm-provider').value;
    const btn = document.getElementById('btn-generate');
    btn.disabled = true;
    btn.textContent = '整理短文與 A2 翻譯中...';
    try {
      if (provider === 'offline') {
        data = buildFromPlainText(txt, activeTone);
        if (isMobileView()) switchMobileTab('draft');
        switchRightTab('article', true);
        showToast(`已整理成 ${countZh(data.articleZh)} 字完整短文與國中 A2 英文！`, 'success');
      } else {
        await callExternalAi(provider, txt);
      }
    } finally {
      btn.disabled = false;
      btn.textContent = '幫我整理成 300字短文 ＋ A2 英文';
    }
  }

  async function callExternalAi(provider, rawText) {
    const apiKey = document.getElementById('llm-api-key').value.trim();
    const model = document.getElementById('llm-model-name').value.trim() || (provider === 'ollama' ? 'qwen2.5' : 'gemini-2.5-flash');
    if (provider === 'gemini' && !apiKey) {
      data = buildFromPlainText(rawText, activeTone);
      if (isMobileView()) switchMobileTab('draft');
      switchRightTab('article', true);
      showToast('未填 API Key，已改由離線雙語引擎生成。', 'warning');
      return;
    }

    const prompt = `你現在是「如果跟我這樣說.....」雙語對話整理助手。請將以下台灣國高中生口語白話情境，自動補足為完整結構（發生經過、當下處置、真正原因、改善補償、共同約定）的繁體中文短文與英文翻譯。
嚴格要求：
1. articleZh：流暢自然的完整結構中文文章，總字數絕對不可超過 300 字（建議 200～270 字），語氣為「${TONE_LABELS[activeTone]}」。
2. articleEn：對應的英文翻譯，必須使用台灣國中英文程度（CEFR A2 單字字彙與簡單清晰句型，避免艱深字）。
3. a2Vocab：列出本篇用到的 6～8 個 CEFR A2 重點單字陣列，每項格式為 ["word", "詞性", "中文意思"]。
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
      const base = buildFromPlainText(rawText, activeTone);
      data = Object.assign(base, parsed, {
        rawInput: rawText,
        tone: activeTone,
        d1: Object.assign(base.d1, parsed.d1 || {})
      });
      if (countZh(data.articleZh) > MAX_ZH_CHARS) {
        data.articleZh = data.articleZh.slice(0, MAX_ZH_CHARS - 1).replace(/[，、；：]$/, '') + '。';
      }
      if (isMobileView()) switchMobileTab('draft');
      switchRightTab('article', true);
      showToast(`${provider === 'gemini' ? 'Gemini' : 'Ollama'} 雙語短文生成完成！`, 'success');
    } catch (e) {
      clearTimeout(tid);
      data = buildFromPlainText(rawText, activeTone);
      if (isMobileView()) switchMobileTab('draft');
      switchRightTab('article', true);
      showToast('外部 AI 連線失敗或逾時，已改由離線雙語引擎生成。', 'warning');
    }
  }

  /* -------------------- 視圖渲染與手機/桌機導覽 -------------------- */
  function buildA4Html() {
    const zhLen = countZh(data.articleZh);
    const vocab = data.a2Vocab || [];
    return `
      <div class="a4-mini">
        <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:8px;border-bottom:2px solid #1b4d5c;padding-bottom:8px;margin-bottom:8px;flex-wrap:wrap;">
          <div>
            <div style="font-size:15px;font-weight:800;color:#1b4d5c;">如果跟我這樣說..... — 雙語短文與約定單</div>
            <div style="font-size:10.5px;color:#64748b;">${escapeHtml(data.title)}（${escapeHtml(TONE_LABELS[data.tone])}｜中文 ${zhLen} 字｜CEFR A2 英文）</div>
          </div>
          <div style="font-size:10.5px;color:#475569;">${escapeHtml(data.reportId)} ｜ ${escapeHtml(data.dateCreated)}</div>
        </div>
        <div class="a4-sec">一、如果跟我這樣說.....（中文完整短文 ${zhLen} / 300 字）</div>
        <div class="a4-essay">${escapeHtml(data.articleZh || '尚未生成')}</div>
        <div class="a4-sec">二、國中程度英文翻譯（CEFR A2）</div>
        <div class="a4-essay" style="font-family:Segoe UI,Arial,sans-serif;">${escapeHtml(data.articleEn || 'Not generated yet.')}</div>
        <div class="a4-sec">三、CEFR A2 核心單字庫</div>
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
    const pill = document.getElementById('char-count-pill');
    if (pill) {
      pill.textContent = `${len}/300字`;
      pill.classList.toggle('over-limit', len > MAX_ZH_CHARS);
    }
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
          <p>系統會自動補足完整對話結構（發生經過、當下處置、背後原因、改善補償、共同約定），並提供台灣國中程度 CEFR A2 英文翻譯、核心單字卡與語音朗讀。</p>
          <button type="button" class="btn btn-primary btn-touch mob-only" data-go-mob="input">先說說發生的事</button>
        </div>`;
      return;
    }

    if (activeRTab === 'article') {
      const len = countZh(data.articleZh);
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
                <strong>英文翻譯（國中程度・CEFR A2）</strong>
                <span class="badge badge-confirmed">A2 基礎字彙</span>
              </div>
              <div class="row-gap">
                <button type="button" class="btn btn-secondary btn-mini" data-speak="1.0">🔊 朗讀</button>
                <button type="button" class="btn btn-secondary btn-mini" data-speak="0.78">🐢 慢速</button>
                <button type="button" class="btn btn-secondary btn-mini" data-copy="en">複製英文</button>
              </div>
            </div>
            <textarea rows="4" class="article-textarea en-text" data-edit="articleEn">${escapeHtml(data.articleEn)}</textarea>
            <div>
              <div class="vocab-section-title">本篇國中 A2 核心單字（點擊發音）：</div>
              <div class="vocab-grid">
                ${(data.a2Vocab || []).map(v => `
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
    const enPack = composeA2English(data, extractActorAndTime(data.rawInput || data.d1.problemDesc));
    data.articleEn = enPack.en;
    refreshAllViews(true);
    showToast(`已切換為「${TONE_LABELS[newTone]}」`);
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
    const slides = [
      { bg: '14222B', tc: 'FFFFFF', bc: 'DCE7EC', t: d.title || '如果跟我這樣說.....', sub: `如果跟我這樣說..... | 中文 ${countZh(d.articleZh)}字 | CEFR A2`, lines: [`紀錄編號：${d.reportId}`, `建立日期：${d.dateCreated}`, `語氣風格：${TONE_LABELS[d.tone] || ''}`] },
      { bg: 'FFFFFF', tc: '1B4D5C', bc: '14222B', t: `如果跟我這樣說.....（${countZh(d.articleZh)} / 300 字）`, sub: 'STRUCTURED CHINESE ARTICLE', lines: [d.articleZh] },
      { bg: 'FFFFFF', tc: '1B4D5C', bc: '14222B', t: '國中程度英文翻譯（CEFR A2）', sub: 'JUNIOR HIGH A2 ENGLISH VERSION', lines: [d.articleEn] },
      { bg: 'FFFFFF', tc: '1B4D5C', bc: '14222B', t: 'CEFR A2 核心單字庫', sub: 'KEY A2 VOCABULARY', lines: (d.a2Vocab || []).map(v => `${v[0]} (${v[1]}) — ${v[2]}`) },
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
    const fileName = `如果跟我這樣說_雙語簡報_${sanitizeFilename(data.reportId)}.pptx`;
    try {
      if (typeof window !== 'undefined' && typeof window.PptxGenJS === 'function') {
        const pptx = new window.PptxGenJS();
        pptx.layout = 'LAYOUT_16x9';
        pptx.title = data.title || '如果跟我這樣說.....';

        const s1 = pptx.addSlide();
        s1.background = { color: '14222B' };
        s1.addText(data.title || '如果跟我這樣說.....', { x: 0.7, y: 1.5, w: 11.9, h: 1.2, fontSize: 30, bold: true, color: 'FFFFFF', fontFace: 'Microsoft JhengHei' });
        s1.addText(`如果跟我這樣說..... ｜ 中文 ${countZh(data.articleZh)} / 300 字 ｜ CEFR A2`, { x: 0.7, y: 2.8, w: 11.9, h: 0.6, fontSize: 15, color: 'A7DFD4', fontFace: 'Microsoft JhengHei' });
        s1.addText(`紀錄編號：${data.reportId}   建立日期：${data.dateCreated}   語氣：${TONE_LABELS[data.tone]}`, { x: 0.7, y: 3.6, w: 11.9, h: 0.6, fontSize: 13, color: 'DCE7EC', fontFace: 'Microsoft JhengHei' });

        const addCardSlide = (heading, sub, bodyText, font = 'Microsoft JhengHei', size = 18) => {
          const sl = pptx.addSlide();
          sl.background = { color: 'FFFFFF' };
          sl.addText(heading, { x: 0.6, y: 0.45, w: 12.1, h: 0.7, fontSize: 22, bold: true, color: '1B4D5C', fontFace: 'Microsoft JhengHei' });
          sl.addText(sub, { x: 0.6, y: 1.05, w: 12.1, h: 0.35, fontSize: 11, bold: true, color: '697A86', fontFace: 'Segoe UI' });
          sl.addText(bodyText, { x: 0.6, y: 1.6, w: 12.1, h: 5.1, fontSize: size, color: '14222B', fontFace: font, valign: 'top', lineSpacingMultiple: 1.35 });
        };

        addCardSlide(`如果跟我這樣說.....（${countZh(data.articleZh)} / 300 字）`, 'STRUCTURED CHINESE ARTICLE', data.articleZh, 'Microsoft JhengHei', 19);
        addCardSlide('國中程度英文翻譯（CEFR A2）', 'JUNIOR HIGH A2 ENGLISH VERSION', data.articleEn, 'Segoe UI', 18);
        addCardSlide('CEFR A2 核心單字庫', 'KEY A2 VOCABULARY', (data.a2Vocab || []).map(v => `• ${v[0]} (${v[1]}) — ${v[2]}`).join('\n'), 'Microsoft JhengHei', 17);
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
      data = buildFromPlainText(SCENARIOS.compound_3c_emotion, activeTone);
      if (isMobileView()) switchMobileTab('draft');
      switchRightTab('article', true);
      showToast(`已自動補足 ${countZh(data.articleZh)} 字結構短文 ＋ 國中 A2 英文！`, 'success');
      await sleep(1100);
      applySpokenRefinement('約定平日晚上11點手機放客廳充電');
      showToast('已融入新約定並即時更新中英雙語短文！', 'success');
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
        data = buildFromPlainText(t, activeTone);
        if (isMobileView()) switchMobileTab('draft');
        switchRightTab('article', true);
        showToast(`已補足 ${countZh(data.articleZh)} 字結構短文與國中 A2 英文！`, 'success');
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
      fb.textContent = `已融入【${res.label}】，目前中文 ${res.zhLen} / 300 字！`;
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
      const txt = `【${data.title}】\n\n${data.articleZh}\n\n[English - CEFR A2]\n${data.articleEn}`;
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

      const cp = e.target.closest('[data-copy]');
      if (cp) {
        const val = cp.dataset.copy === 'zh' ? data.articleZh : data.articleEn;
        try {
          await navigator.clipboard.writeText(val);
          showToast(cp.dataset.copy === 'zh' ? '已複製中文短文！' : '已複製 A2 英文翻譯！', 'success');
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
        const enPack = composeA2English(data, extractActorAndTime(data.rawInput || data.d1.problemDesc));
        data.articleEn = enPack.en;
        switchRightTab('article', true);
        showToast(`已依 5D 內容重組（${countZh(data.articleZh)} / 300 字）！`, 'success');
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
      if (!data.articleZh) { showToast('請先生成雙語短文！', 'warning'); return; }
      document.getElementById('print-mount').innerHTML = buildA4Html();
      window.print();
    };
    document.getElementById('btn-print').addEventListener('click', doPrint);
    document.getElementById('btn-mob-print').addEventListener('click', doPrint);

    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        data = Object.assign(blankData(), JSON.parse(saved));
        document.getElementById('raw-input').value = data.rawInput || '';
      } else {
        document.getElementById('raw-input').value = SCENARIOS.compound_3c_emotion;
        data = buildFromPlainText(SCENARIOS.compound_3c_emotion, activeTone);
      }
    } catch (e) {
      document.getElementById('raw-input').value = SCENARIOS.compound_3c_emotion;
      data = buildFromPlainText(SCENARIOS.compound_3c_emotion, activeTone);
    }

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
      composeA2English,
      buildFromPlainText,
      applySpokenRefinement,
      buildPptxUint8Array,
      getData: () => data,
      setData: d => { data = d; }
    };
  }
})();
