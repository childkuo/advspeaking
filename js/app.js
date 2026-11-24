'use strict';

/**
 * 5D 青春對話小幫手 — 核心應用程式邏輯
 * 專為國高中生、家長與師長設計：
 * 1. 預設 100% 離線智慧語意補完引擎（9 大國高中生活領域 + 複合情境融合）
 * 2. 原文事實 / 語意補完 / 已確認 三態視覺來源追蹤（sourceMap）
 * 3. 三種語氣即時切換（溫和親子對話 / 青春期自律成長 / 師長輔導紀錄）
 * 4. 口語追加微調（自然語言意圖分類並即時融入 5D 框架）
 * 5. 雙軌 AI 支援（選填 Google Gemini API / 本機 Ollama，共用 Schema Prompt + 自動降級）
 * 6. 單頁 A4 親筆簽名報告、原生 Word (.doc) 與 16:9 PowerPoint (.pptx) 匯出
 */

// ==========================================================================
// 1. 資安與基礎工具函式
// ==========================================================================
const STORAGE_KEY = '5D_TEEN_PRO_AUTOSAVE_V1';
const FORBIDDEN_PROTO_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeXml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
}

function sanitizeFilename(str) {
  if (!str || typeof str !== 'string') return 'DRAFT';
  const cleaned = str.replace(/[\/\\:*?"<>|\x00-\x1F]/g, '_').replace(/\.\.+/g, '_').trim();
  return (cleaned || 'DRAFT').slice(0, 60);
}

function getTodayStr() {
  return new Date().toISOString().slice(0, 10);
}

function getDefaultTargetDate(baseDateStr, daysOffset = 7) {
  const base = baseDateStr && /^\d{4}-\d{2}-\d{2}$/.test(baseDateStr)
    ? new Date(baseDateStr + 'T00:00:00Z')
    : new Date();
  if (isNaN(base.getTime())) {
    return new Date(Date.now() + daysOffset * 86400000).toISOString().slice(0, 10);
  }
  base.setUTCDate(base.getUTCDate() + daysOffset);
  return base.toISOString().slice(0, 10);
}

function setNestedValue(obj, path, value) {
  if (!obj || typeof path !== 'string') return;
  const parts = path.split('.');
  if (parts.some(p => FORBIDDEN_PROTO_KEYS.has(p))) return;
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    if (!Object.prototype.hasOwnProperty.call(current, key) || typeof current[key] !== 'object' || current[key] === null) {
      current[key] = {};
    }
    current = current[key];
  }
  current[parts[parts.length - 1]] = value;
}

function getNestedValue(obj, path) {
  if (!obj || typeof path !== 'string') return '';
  const parts = path.split('.');
  if (parts.some(p => FORBIDDEN_PROTO_KEYS.has(p))) return '';
  let current = obj;
  for (let i = 0; i < parts.length; i++) {
    if (current === undefined || current === null || !Object.prototype.hasOwnProperty.call(current, parts[i])) return '';
    current = current[parts[i]];
  }
  return current !== undefined && current !== null ? current : '';
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transition = 'opacity 0.2s ease';
    setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 220);
  }, 3200);
}

// ==========================================================================
// 2. 國高中生 9 大生活領域知識庫與 3 種語氣模板
// ==========================================================================
const TEEN_SCENARIOS = {
  '3c_sleep': '我昨天晚上躲在房間滑手機看短影音到凌晨兩點才睡，結果今天早上鬧鐘響了叫不起來，第一節課大遲到。',
  'compound_3c_emotion': '昨晚弟弟熬夜玩手遊到凌晨一點多不肯睡，今天早上媽媽叫他起床去學校遲到了，他還嫌媽媽囉唆直接甩門發脾氣。',
  'study_exam': '小宇這次段考數學考得很差，因為怕被爸媽罵，不僅把考卷藏在書包最底層，連這禮拜的數學習作也連續三天沒交，直到導師打電話通知家長才曝光。',
  'outing_safety': '高一的姊姊昨晚補習班提早下課，沒先傳訊息跟家裡說就和同學去西門町逛街吃宵夜，直到晚上十點半才回家，讓爸爸媽媽急得差點報警。',
  'money_spend': '阿凱這個月把爸媽給的兩千元餐費跟零用錢省下來，偷偷拿去超商買遊戲點數卡課金，結果月底沒錢吃午餐還跟同學借了五百元。',
  'peer_social': '小傑跟同班同學在班級 LINE 群組裡因為分組報告分工不均起口角，小傑一時衝動在群組裡截圖酸對方，造成全班氣氛尷尬、對方非常生氣。',
  'boundary_item': '弟弟昨天沒問過姊姊就私自進房間拿她的藍牙耳機帶去學校用，還不小心把充電盒摔裂，姊姊回家發現後非常生氣覺得隱私跟物品完全沒被尊重。',
  'chore_self': '哥哥這週輪到負責洗晚餐的碗跟整理書桌，但他放學回家只顧著追劇打電動，碗盤堆在水槽兩天發臭，書桌雜物也堆到找不到考卷。',
  'safety_health': '小華今天早上為了趕公車騎電動自行車上學沒有戴安全帽，還在路口搶黃燈差點跟轉彎機車擦撞，被學校導護老師當場攔下來勸導。'
};

const TONE_LABELS = {
  gentle_family: '溫和親子對話版',
  teen_growth: '青春期自律成長版',
  teacher_record: '師長輔導紀錄版'
};

const TEEN_DOMAIN_KB = {
  '3c_sleep': {
    id: '3c_sleep',
    label: '3C 使用與睡眠作息',
    keywords: /(手機|手遊|短影音|抖音|TikTok|IG|YouTube|追劇|遊戲|Switch|平板|電腦|筆電|熬夜|凌晨|清晨|半夜|遲到|睡過頭|起不來|叫不醒|睡眠|打瞌睡|充電)/g,
    title: (actor) => `${actor}夜間 3C 使用與睡眠作息失衡事件`,
    defaultItem: '手機／數位設備',
    defaultWhen: '昨晚睡前至今日早晨',
    defaultWhere: '家中個人臥室／學校教室',
    whyRule: {
      gentle_family: '未遵守「就寢前定時放下手機、維持充足睡眠與準時到校」的家庭作息共識',
      teen_growth: '未能自我控管睡前 3C 使用時間，打破自己應準時就寢與準時到校的自律底線',
      teacher_record: '違反日間正常就學作息規範，夜間過度使用數位裝置導致隔日上學遲到與學習精神不濟'
    },
    howFound: '早晨預定出門時間叫不醒或到校遲到，經家長／師長關心詢問後得知夜間熬夜使用手機',
    impact: '造成上學遲到與課堂精神不濟，影響日間學習專注力，同時打亂家人早晨節奏並引發擔憂',
    d2Options: [
      {
        actions: [
          { action: '先協助整理儀容快速出門確保平安到校，不於出門當下擴大爭執', owner: '家長／當事人', status: '已完成', result: '順利到校上課，避免早晨衝突升級' },
          { action: '約定放學後留出 20 分鐘心平氣和對話，暫時調整當晚手機使用時段', owner: '當事人／家長', status: '進行中', result: '雙方同意以冷靜狀態討論解方' }
        ],
        verification: '已確保當事人平安到校且情緒穩定，雙方約定放學後理性復盤，未衍生進一步衝突。'
      },
      {
        actions: [
          { action: '主動向導師說明遲到原因並補齊早自習進度，當晚手機先交由客廳統一保管一晚讓身體補眠', owner: '當事人', status: '已完成', result: '完成學校報備並優先恢復基本睡眠' },
          { action: '家人先暫停責備，改以關心隔天精神狀態為主，待晚間情緒平穩再訂新作息', owner: '家長', status: '已完成', result: '降低對立感，建立對話空間' }
        ],
        verification: '已優先處理到校報備與補眠需求，並開啟無指責的親子溝通視窗。'
      },
      {
        actions: [
          { action: '立即開啟手機螢幕使用時間紀錄，一起客觀檢視昨晚耗時最高的 App 與時段', owner: '當事人／家長', status: '進行中', result: '以數據代替爭論，看清熬夜主因' }
        ],
        verification: '雙方已透過客觀使用紀錄達成現況共識，準備進入原因探討與調整。'
      }
    ],
    d3Options: [
      {
        chain: [
          { level: 'Why 1', question: '為什麼會熬夜滑手機導致隔天遲到？', answer: '睡前把手機帶進房間，原本只想看 10 分鐘卻一路滑到深夜。' },
          { level: 'Why 2', question: '為什麼明知明天要上課卻停不下來？', answer: '短影音與遊戲推播容易讓人失去時間感，加上白天課業壓力大，想靠熬夜換取「屬於自己的自由時間」。' },
          { level: 'Why 3', question: '為什麼沒有在時間到時主動放下手機？', answer: '房間裡沒有實體的斷點機制（例如實體鬧鐘或客廳充電區），單靠睡前的意志力很難對抗演算法誘惑。' },
          { level: 'Why 4（核心真因）', question: '根本的習慣與環境漏洞是什麼？', answer: '白天缺少無壓力的合法放鬆時段，加上夜間 3C 缺乏「環境防呆界限」，導致報復性熬夜反覆發生。' }
        ],
        escaped: [
          { level: '環境漏洞 1', question: '為何當下缺乏提醒停損？', answer: '手機未開啟睡眠專注模式或夜間螢幕停用排程，房內亦無獨立鬧鐘可替代手機。' }
        ],
        summary: {
          gentle_family: '核心真因在於課業壓力下渴望深夜獨處放鬆，加上手機直接帶入臥室缺乏環境界限，使單純靠意志力喊停變得困難。',
          teen_growth: '我把深夜滑手機當成紓壓出口，卻沒有設好環境防線（把手機留房外＋設定停用時間），導致一時放鬆換來隔天遲到與疲累。',
          teacher_record: '個案因課業壓力產生報復性晚睡傾向，且居家缺乏夜間數位設備收納與睡眠排程機制，導致作息失衡。'
        }
      },
      {
        chain: [
          { level: 'Why 1', question: '為什麼昨晚睡覺時間大幅延後？', answer: '線上與同學打遊戲或聊天，怕先下線會錯過話題或被說掃興。' },
          { level: 'Why 2', question: '為什麼沒有事先告訴朋友幾點要下線？', answer: '平常沒有固定的上線與下線界限，臨時很難開口結束對話。' },
          { level: 'Why 3（核心真因）', question: '背後真正需要調整的是什麼？', answer: '需要事先與同儕建立清楚的晚間下線時間，並將手機充電位置移出床邊。' }
        ],
        escaped: [],
        summary: {
          gentle_family: '因同儕社交連結需求強，未預先設定夜間下線界限且手機置於床邊，導致難以準時收心就寢。',
          teen_growth: '因為在意朋友互動而不好意思提早下線，加上沒有固定收手機時間，影響了自己的睡眠與隔天表現。',
          teacher_record: '個案受夜間同儕線上互動影響，缺乏明確下線界限與就寢前數位離線規範。'
        }
      },
      {
        chain: [
          { level: 'Why 1', question: '為什麼早上叫不醒而遲到？', answer: '夜間睡眠不足 5 小時，手機鬧鐘被隨手按掉後又繼續睡著。' },
          { level: 'Why 2', question: '為什麼沒有提早上床睡覺？', answer: '放學後作業拖延到晚上 10 點才開始寫，寫完後已經太晚又想補玩手機。' },
          { level: 'Why 3（核心真因）', question: '整體作息失控的起點在哪裡？', answer: '放學後的時間區塊沒有先完成作業再放鬆，導致娛樂時間被擠壓到深夜。' }
        ],
        escaped: [],
        summary: {
          gentle_family: '放學後時間安排鬆散，作業拖到深夜才完成，進而將放鬆滑手機的時間延後至凌晨，形成惡性循環。',
          teen_growth: '因為放學後拖延寫作業，把原本屬於晚間的休息時間擠到半夜，結果熬夜又遲到。',
          teacher_record: '個案課後時間管理失序，作業拖延連動擠壓睡眠與休閒時間，造成隔日就學遲到。'
        }
      }
    ],
    d4Options: [
      {
        actions: [
          { action: '在客廳設置「全家手機充電區」，平日晚間 22:30（高中可調整至 23:00）統一放客廳充電，改用獨立實體鬧鐘起床', category: '環境防呆調整', owner: '當事人／家長', status: '進行中', verification: '連續 7 個上學日確實將手機放置客廳' },
          { action: '規劃每天放學後 30～45 分鐘「無打擾自由放鬆時間」，讓大腦合法喘氣，減少深夜報復性滑手機', category: '作息與壓力調適', owner: '當事人', status: '進行中', verification: '每週日檢視晚間入睡時間是否提前' },
          { action: '手機開啟「睡眠排程與 App 時間限制」，睡前 30 分鐘自動轉灰階提醒準備收心', category: '工具輔助自律', owner: '當事人', status: '進行中', verification: '檢視系統螢幕使用時間設定已啟用' }
        ],
        before: '手機帶進臥室無停損點，經常滑至凌晨 1～2 點，導致早起困難與遲到',
        after: '平日 22:30/23:00 手機固定留客廳充電，連續 1 週準時起床零遲到、白天精神明顯提升',
        conclusion: '透過環境界限取代純粹說教，兼顧青少年放鬆需求與健康作息，雙方均認同可行。'
      },
      {
        actions: [
          { action: '平日採「先完成課業與預習，再享固定 1 小時自由 3C 時段」，時間到即切換為離線休息模式', category: '時間管理習慣', owner: '當事人', status: '進行中', verification: '連續 5 天在晚間 10 點前完成當日課業' },
          { action: '提前跟常聊天的同學約好「平日 22:30 後手機放客廳不回訊息」，降低社交焦慮', category: '人際界限溝通', owner: '當事人', status: '規劃中', verification: '已於群組或好友說明作息時間' }
        ],
        before: '晚間作業拖延加上社交怕漏訊息，常常一拖就超過午夜',
        after: '明確切分課業與娛樂區塊，睡前不碰螢幕，睡眠時間穩定達 7.5 小時以上',
        conclusion: '透過提前溝通界限與重排晚間順序，有效降低夜間滑手機的心理拉扯。'
      },
      {
        actions: [
          { action: '實施「7 天作息挑戰卡」：每準時放手機並準時出門就打勾，達標 5 天週末可彈性增加 1 小時自由規劃時間', category: '正向激勵機制', owner: '當事人／家長', status: '進行中', verification: '週末共同核對挑戰卡並兌現約定' }
        ],
        before: '缺乏明確正向目標，靠長輩反覆催促反而引發反感',
        after: '改由自己勾選作息挑戰卡，主動管理睡眠並換取週末彈性自主權',
        conclusion: '以自主管理搭配正向回饋，提升青春期主動配合意願。'
      }
    ],
    d5Options: [
      {
        docs: [
          { docType: '家庭生活公約', docNumber: 'RULE-3C-01', docName: '平日晚間固定時間手機放客廳充電、改用實體鬧鐘；若因段考或特殊作業需延長使用，事前主動告知並約定結束時間', owner: '當事人與家長' },
          { docType: '每週檢核習慣', docNumber: 'CHK-3C-02', docName: '每週日晚間花 5 分鐘一起回顧本週睡眠與遲到次數，不秋後算帳，只微調下週作息', owner: '全家共同' }
        ],
        qaComment: {
          gentle_family: '感謝願意坦誠說出深夜想放鬆的心情，我們一起用環境幫忙而不是只靠催促，期待這週的新作息更有精神！',
          teen_growth: '我認同這份作息約定，願意連續 7 天把手機留客廳充電，用實際行動證明自己能管理好時間。',
          teacher_record: '個案與家長已就夜間 3C 收納與晨間作息達成具體共識，建議導師於下週協助追蹤到校準時度。'
        }
      },
      {
        docs: [
          { docType: '自律承諾卡', docNumber: 'RULE-3C-02', docName: '睡前 30 分鐘啟動數位離線模式，平日零遲到；若連續 2 週穩定達標，逐步放寬個人自主管理權限', owner: '當事人主導' }
        ],
        qaComment: {
          gentle_family: '願意為自己的睡眠與上學時間負責是很成熟的表現，大人也會尊重約定不過度盯場。',
          teen_growth: '用 2 週穩定零遲到換取更高的時間自主權，對自己負責也減少家裡摩擦。',
          teacher_record: '已建立階梯式自主管理公約，兼顧規範落實與青少年自主發展需求。'
        }
      },
      {
        docs: [
          { docType: '全家共用規範', docNumber: 'RULE-3C-03', docName: '全家一起執行「睡前客廳充電制」，大人也以身作則不在臥室滑手機熬夜，彼此溫和提醒', owner: '全體家庭成員' }
        ],
        qaComment: {
          gentle_family: '全家一起做到比只要求孩子更有力量，我們互相提醒、一起把睡眠顧好。',
          teen_growth: '全家一起遵守同樣的標準很公平，我會準時把手機放好。',
          teacher_record: '家庭成員共同參與作息示範，有助強化規範公平性與長期執行力。'
        }
      }
    ]
  },

  'emotion_comm': {
    id: 'emotion_comm',
    label: '情緒表達與親子溝通',
    keywords: /(發脾氣|大發脾氣|甩門|頂嘴|大吼|大叫|吵起來|冷戰|擺臭臉|嫌囉唆|嫌麻煩|不耐煩|罵髒話|摔東西|口氣差|嗆|不理人|生氣)/g,
    title: (actor) => `${actor}情緒失控與家庭理性溝通事件`,
    defaultItem: '親子溝通與情緒界限',
    defaultWhen: '今日出門前／晚間溝通時段',
    defaultWhere: '家中客廳／玄關／臥室門口',
    whyRule: {
      gentle_family: '未遵守「可以表達不滿與壓力，但不用甩門、吼叫或傷人言語溝通」的家庭尊重底線',
      teen_growth: '在煩躁與壓力下沒有先喊暫停，用甩門或衝動口氣傷害了關心我的家人',
      teacher_record: '於家庭互動中出現情緒爆發與不當表達行為（如甩門、頂嘴），影響家庭溝通安全感'
    },
    howFound: '現場對話過程中情緒瞬間升高爆發，造成雙方不歡而散或陷入冷戰',
    impact: '造成家人感到錯愕與受傷、溝通氣氛緊繃，當事人事後也容易陷入懊惱或更難開口求助',
    d2Options: [
      {
        actions: [
          { action: '啟動「情緒冷靜 15 分鐘」暫停鍵，雙方先分開各自喘口氣，不在情緒高點互相指責', owner: '雙方共同', status: '已完成', result: '避免言語進一步互相傷害' },
          { action: '待呼吸與心情平復後，由其中一方先釋出善意（如傳訊或敲門詢問「現在方便好好談嗎？」）', owner: '當事人／家長', status: '進行中', result: '重新打開安全對話的門' }
        ],
        verification: '雙方已先脫離高張力現場並冷靜情緒，同意用平靜語氣重新對話。'
      },
      {
        actions: [
          { action: '先確認現場沒有人受傷或物品損壞，並約定晚飯後坐下來用「我感覺…」而非「你總是…」各說 3 分鐘', owner: '家長／當事人', status: '進行中', result: '建立輪流傾聽的對話結構' }
        ],
        verification: '現場已穩定且建立平等輪流發言機制，防止演變為長期冷戰。'
      },
      {
        actions: [
          { action: '當事人先以簡訊或便條紙表達「剛才口氣不好對不起，但我當時真的很有壓力」，打破僵局', owner: '當事人', status: '進行中', result: '大幅降低當面低頭的尷尬，迅速修補氣氛' }
        ],
        verification: '已透過文字緩衝破冰，雙方恢復基本溝通意願。'
      }
    ],
    d3Options: [
      {
        chain: [
          { level: 'Why 1', question: '為什麼當時會瞬間發脾氣、甩門或口氣很衝？', answer: '當下已經覺得很煩或很趕，聽到重複提醒時感覺被否定、被催促，情緒立刻滿溢。' },
          { level: 'Why 2', question: '為什麼不直接用平靜的話說「我現在有點壓力」？', answer: '情緒上來時腦袋一片空白，習慣用強硬防衛的姿態把對方推開，想立刻結束對話。' },
          { level: 'Why 3', question: '背後真正想被理解的需求是什麼？', answer: '希望長輩在提醒時能給一點緩衝空間，不要在還沒講完前就連珠炮追問。' },
          { level: 'Why 4（核心真因）', question: '根本的溝通斷層在哪裡？', answer: '雙方缺少共同認同的「情緒暫停暗號」，當青少年壓力爆表又遇到高頻提醒時，就容易擦槍走火。' }
        ],
        escaped: [],
        summary: {
          gentle_family: '核心真因在於當事人當下壓力與煩躁已達臨界點，缺乏「安全喊暫停」的溝通暗號，只好用甩門或頂嘴作為防衛反應。',
          teen_growth: '我其實不是故意要傷害家人，而是當下覺得被壓迫又不知道怎麼好好說「請給我一點空間」，結果用最傷人的方式表達。',
          teacher_record: '個案面對家庭提醒時情緒耐受度偏低，雙方缺乏正向情緒降溫暗號與非暴力溝通習慣。'
        }
      },
      {
        chain: [
          { level: 'Why 1', question: '為什麼容易因為小事跟家人吵起來？', answer: '平常在學校累積了課業或人際壓力，回到最安全、最親近的家人面前反而卸下防備宣洩情緒。' },
          { level: 'Why 2', question: '為什麼沒有事前讓家人知道自己今天狀態不好？', answer: '習慣自己悶著忍耐，直到臨界點才一次爆發。' },
          { level: 'Why 3（核心真因）', question: '需要補上的能力是什麼？', answer: '練習在情緒到達 6 分（還沒炸掉）時就先開口預告「我今天很累，需要安靜半小時」。' }
        ],
        escaped: [],
        summary: {
          gentle_family: '校內壓力累積未獲出口，回家後缺乏「事前預告情緒狀態」的習慣，導致小摩擦成為引爆點。',
          teen_growth: '我把學校的壓力帶回家悶著，沒有提前告訴家人我需要喘息空間，才會一點小事就爆炸。',
          teacher_record: '個案承受校內外多重壓力，缺乏情緒自我覺察與提前預警表達能力。'
        }
      },
      {
        chain: [
          { level: 'Why 1', question: '為什麼對話會從提醒變成爭執？', answer: '雙方的語氣都帶著焦急與預設責備，變成「一個急著說教、一個急著防衛」。' },
          { level: 'Why 2（核心真因）', question: '如何打破這個溝通迴圈？', answer: '需要約定彼此都遵守的對話規則：大人減少重複碎念次數，孩子做到正面回應不甩門。' }
        ],
        escaped: [],
        summary: {
          gentle_family: '雙方在焦急情境下陷入「催促—防衛」的互動迴圈，需要同步調整雙邊的提醒方式與回應態度。',
          teen_growth: '當雙方語氣都太急時很容易吵架，我需要練會先深呼吸再回應，也希望家人給一次提醒就好。',
          teacher_record: '親子互動陷入焦慮催促與情緒防衛循環，需透過雙向溝通公約重建界限。'
        }
      }
    ],
    d4Options: [
      {
        actions: [
          { action: '針對甩門或傷人的口氣向家人誠懇致歉（可採口頭或手寫／訊息方式），同時清楚說出自己當下真實的感受', category: '誠意致歉與表達', owner: '當事人', status: '進行中', verification: '完成真誠致歉並讓對方聽見核心需求' },
          { action: '建立全家專屬「情緒暫停暗號」（例如說『我現在需要冷靜 15 分鐘』），說出暗號後雙方立即休戰不追問', category: '溝通機制建立', owner: '雙方共同', status: '進行中', verification: '下次遇摩擦時成功使用暗號避免大吵' },
          { action: '家長同步調整提醒方式：重要事項清楚提醒 1～2 次後留出執行空間，孩子則給予明確回覆（「好，我 10 分鐘後去處理」）', category: '雙向互動優化', owner: '家長／當事人', status: '進行中', verification: '連續 2 週未再發生甩門或大吼衝突' }
        ],
        before: '一煩躁就甩門頂嘴、互相提高音量，事後陷入冷戰兩敗俱傷',
        after: '能提前說出「我需要冷靜 15 分鐘」，冷靜後好好把話講完，家庭氣氛明顯和緩',
        conclusion: '尊重彼此界限並建立暫停暗號，讓情緒有出口而不再傷及關係。'
      },
      {
        actions: [
          { action: '練習「情緒溫度計」回報：回家若覺得壓力大（7 分以上），先主動說「我今天很累，先讓我休息 20 分鐘再聊」', category: '情緒覺察練習', owner: '當事人', status: '進行中', verification: '一週內至少成功練習 2 次事前預告' },
          { action: '改以「文字小紙條或 LINE」表達當下難以啟齒的委屈或道歉，降低面對面衝突壓力', category: '緩衝溝通管道', owner: '雙方共同', status: '進行中', verification: '有效化解尷尬並維持良性溝通' }
        ],
        before: '把壓力憋到爆發才用生氣表達',
        after: '能在生氣前預告狀態，讓家人理解而不是猜測',
        conclusion: '用事前預告取代事後道歉，大幅減少家庭情緒內耗。'
      },
      {
        actions: [
          { action: '若不小心口氣失控，約定在 24 小時內主動修復關係（倒杯水、說聲不好意思並重新講一次原本想說的話）', category: '關係修復習慣', owner: '當事人', status: '進行中', verification: '落實「不把氣留隔夜」的修復約定' }
        ],
        before: '吵完架拉不下臉道歉，冷戰好幾天',
        after: '懂得在冷靜後主動修復關係，展現成熟擔當',
        conclusion: '允許人有情緒，但學會為情緒後的行為負責與修復。'
      }
    ],
    d5Options: [
      {
        docs: [
          { docType: '家庭溝通公約', docNumber: 'RULE-COMM-01', docName: '「對事不對人、生氣不甩門」：任何一方覺得快吵起來時，可喊『暫停 15 分鐘』，另一方必須尊重不追打，冷靜後再理性溝通', owner: '全家共同' }
        ],
        qaComment: {
          gentle_family: '青春期情緒起伏很正常，我們一起練習好好說話、也互相留台階，謝謝你願意一起修補關係。',
          teen_growth: '我有權利表達壓力與不開心，但也會守住不甩門、不口出惡言的界限。',
          teacher_record: '家庭已建立「情緒暫停暗號」與雙向尊重公約，有助改善青春期親子溝通品質。'
        }
      },
      {
        docs: [
          { docType: '雙向約定卡', docNumber: 'RULE-COMM-02', docName: '大人一次說清重點不反覆碎念；孩子聽到後明確回應時間點，不擺臭臉、不甩門', owner: '當事人與家長' }
        ],
        qaComment: {
          gentle_family: '這份公約對大人與孩子都一樣有效，我們彼此提醒、一起做得更好。',
          teen_growth: '雙向約定很公平，我會做到正面回應，不再用冷漠或發脾氣逃避。',
          teacher_record: '雙方就溝通頻率與回應禮貌達成對等約定，後續持續觀察互動變化。'
        }
      },
      {
        docs: [
          { docType: '修復約定', docNumber: 'RULE-COMM-03', docName: '衝突後 24 小時內不冷戰，可透過口頭或傳訊息啟動修復對話，說清楚需求而非互相指責', owner: '全體家庭成員' }
        ],
        qaComment: {
          gentle_family: '吵架不可怕，願意回來把心裡話講開才是最珍貴的信任。',
          teen_growth: '我會練習在冷靜後主動把心裡話說出來，而不是用冷戰結束。',
          teacher_record: '已建立 24 小時衝突修復原則，降低家庭關係裂痕風險。'
        }
      }
    ]
  },

  'study_exam': {
    id: 'study_exam',
    label: '課業學習與誠信自律',
    keywords: /(段考|期中考|期末考|模擬考|考卷|成績單|不及格|考差|考很差|作業|功課|習作|報告|聯絡簿|沒交|缺交|沒寫|抄襲|作弊|代簽|藏考卷|隱瞞成績|補考)/g,
    title: (actor) => `${actor}課業學習管理與誠信溝通事件`,
    defaultItem: '作業／段考考卷與學習進度',
    defaultWhen: '本週上課與課後複習時段',
    defaultWhere: '學校教室／家中書桌',
    whyRule: {
      gentle_family: '未遵守「按時完成作業、遇到課業困難誠實求助、不隱瞞成績或代簽」的誠信學習約定',
      teen_growth: '因逃避課業壓力而拖延缺交或隱瞞結果，反而讓小落後滾成更大的信任危機',
      teacher_record: '違反學生學習常規與誠信規範（作業缺交、成績隱瞞或未實質簽核），影響學業進度與親師互信'
    },
    howFound: '任課老師或導師於課堂批改點名發現缺漏並致電家長，或整理書包時察覺',
    impact: '造成學科進度脫節與補交壓力倍增，更讓家長與師長因資訊被隱瞞而產生信任危機',
    d2Options: [
      {
        actions: [
          { action: '先拿出全部缺交作業與考卷攤在桌上盤點清單，不翻舊帳，專注看清目前待補項目', owner: '當事人／家長', status: '已完成', result: '掌握完整缺漏清單，消除隱瞞帶來的不安' },
          { action: '主動聯繫導師或任課老師確認補交期限與補考範圍，展現面對問題的誠意', owner: '當事人／家長', status: '進行中', result: '取得明確補救時程，止住學業繼續落後' }
        ],
        verification: '已完整盤點缺交與考卷現況並與老師對齊補救期限，學習焦慮獲得控制。'
      },
      {
        actions: [
          { action: '將積欠作業拆成 3 天小份量進度表，先從最容易完成的一科開始動筆建立成就感', owner: '當事人', status: '進行中', result: '克服面對大量作業的癱瘓感' }
        ],
        verification: '已將補救任務拆小並啟動執行，不再逃避擱置。'
      },
      {
        actions: [
          { action: '針對隱瞞或代簽行為先誠實致歉，承諾之後無論考幾分都如實拿出來一起看錯題', owner: '當事人', status: '已完成', result: '先修復誠信基礎再討論讀書方法' }
        ],
        verification: '已完成誠實溝通，家庭討論焦點從「責罵分數」轉向「解決不會的地方」。'
      }
    ],
    d3Options: [
      {
        chain: [
          { level: 'Why 1', question: '為什麼會缺交作業或把考卷藏起來？', answer: '覺得自己寫不出來或考太差很丟臉，害怕拿出來會立刻被責罵或沒收自由時間。' },
          { level: 'Why 2', question: '為什麼這科會跟不上進度？', answer: '前面幾個章節有聽不懂的地方，當下不敢舉手或問同學，越積越多就想直接放棄逃避。' },
          { level: 'Why 3', question: '為什麼拖延會變成隱瞞？', answer: '把「考不好／不會寫」和「我這個人很糟糕／一定會挨罵」劃上等號，只好選擇眼不見為淨。' },
          { level: 'Why 4（核心真因）', question: '根本需要解決的盲點是什麼？', answer: '缺乏「不會就求助的安全感」與「每天固定拆解作業的小步習慣」，導致課業卡關演變成誠信問題。' }
        ],
        escaped: [],
        summary: {
          gentle_family: '核心真因在於學科卡關加上害怕挨罵，選擇用拖延和隱瞞逃避壓力，缺少安全求助與每日小步檢核的習慣。',
          teen_growth: '面對不會的題目跟不好的成績，我因為怕被念而選擇逃避隱瞞，結果壓力更大；我需要學會早點求救並把任務拆小。',
          teacher_record: '個案面臨學科學習挫折與怕被責罰之心理壓力，進而以拖延與隱瞞因應，缺乏穩定課後學習追蹤機制。'
        }
      },
      {
        chain: [
          { level: 'Why 1', question: '為什麼作業常常拖到來不及交？', answer: '回家總覺得還有時間，滑手機或休息不知不覺就過了兩小時，最後乾脆放棄不寫。' },
          { level: 'Why 2', question: '為什麼沒有先把作業寫完再休息？', answer: '沒有固定的每日學習啟動儀式（例如 25 分鐘番茄鐘），容易被手機分心。' },
          { level: 'Why 3（核心真因）', question: '關鍵調整方向為何？', answer: '建立「先做 25 分鐘最難科目、手機放遠離書桌」的每日啟動流程。' }
        ],
        escaped: [],
        summary: {
          gentle_family: '課後缺乏固定啟動節奏且容易受手機分心，使作業一再延後至無法負荷而放棄。',
          teen_growth: '因為沒有固定開始讀書的時間，一分心就把黃金時間耗光，最後來不及只好缺交。',
          teacher_record: '個案課後專注力管理不足，缺乏結構化作業執行流程。'
        }
      },
      {
        chain: [
          { level: 'Why 1', question: '為什麼成績不理想時不敢主動說？', answer: '過去每次成績退步時，對話常常停在情緒責備，讓我覺得說實話只會更糟。' },
          { level: 'Why 2（核心真因）', question: '親子在學習溝通上可以怎麼一起改變？', answer: '約定「誠實拿出考卷就免於情緒責罵」，把力氣全部拿來分析錯題與找補強資源。' }
        ],
        escaped: [],
        summary: {
          gentle_family: '過去對成績的溝通壓力過大，導致孩子寧可冒險隱瞞；需轉向「誠實面對免責備、共同解題」的信任模式。',
          teen_growth: '如果能確定說實話後大家是來幫我想辦法而不是一直罵，我會更有勇氣第一時間把考卷拿出來。',
          teacher_record: '家庭對學業表現之溝通氛圍影響個案誠實回報意願，建議建立支持性檢討模式。'
        }
      }
    ],
    d4Options: [
      {
        actions: [
          { action: '於本週內依拆解進度表補完缺交作業與錯題訂正，並主動給老師與家長確認', category: '實質補救行動', owner: '當事人', status: '進行中', verification: '所有缺交項目全數補齊並簽認' },
          { action: '建立「番茄鐘 25 分鐘起步法」：每天回家休息 30 分鐘後，手機放書桌外先完成最卡關的 1 科作業', category: '學習習慣建立', owner: '當事人', status: '進行中', verification: '連續 1 週零缺交作業' },
          { action: '約定「誠實求助免挨罵機制」：遇到連續 2 題不會或考差，24 小時內主動告知，大人優先協助找解題影片、同學或老師輔導', category: '信任溝通機制', owner: '家長／當事人', status: '進行中', verification: '下次小考與作業均誠實主動呈現' }
        ],
        before: '遇難題拖延逃避、作業缺交並隱瞞成績，直到老師來電才曝光',
        after: '每天按小步完成課業、不會就主動求救，連續 2 週作業準時率 100% 且誠實溝通',
        conclusion: '把焦點從恐懼分數轉為拆解難題與誠實求助，學業與信任同步回穩。'
      },
      {
        actions: [
          { action: '每天睡前 3 分鐘對照聯絡簿／班級群組作業清單，勾選「已完成／已放書包」', category: '自我檢核習慣', owner: '當事人', status: '進行中', verification: '連續 10 天無漏帶或漏交' },
          { action: '每週三與週日各花 15 分鐘整理本週不會的重點，整理成 3 個問題直接問老師或同學', category: '主動提問習慣', owner: '當事人', status: '規劃中', verification: '每週至少主動解決 3 個課業盲點' }
        ],
        before: '靠印象記作業經常漏東漏西，考前才發現一大堆不會',
        after: '養成睡前清單打勾與每週清零盲點的習慣，段考前不再臨時抱佛腳',
        conclusion: '透過日常小檢核把大壓力化整為零。'
      },
      {
        actions: [
          { action: '針對弱科安排每週 2 次固定補強時段（如線上免費教學影片或校內課輔），並以進步幅度取代單看名次', category: '資源支持計畫', owner: '當事人／家長', status: '進行中', verification: '下次小考或段考該科分數穩步回升' }
        ],
        before: '弱科越考越沒信心，只想逃避',
        after: '有系統補強基礎觀念，逐步找回學習掌控感',
        conclusion: '給予具體資源支持而非空泛要求，有效降低逃避心態。'
      }
    ],
    d5Options: [
      {
        docs: [
          { docType: '學習誠信公約', docNumber: 'RULE-STD-01', docName: '「成績可以不完美，但態度要誠實」：考卷與通知單 24 小時內主動拿給家長看，不代簽、不藏卷；家長承諾先聽困難再找方法，不情緒性責罵', owner: '當事人與家長' },
          { docType: '每日檢查清單', docNumber: 'CHK-STD-02', docName: '睡前 3 分鐘核對隔日作業、課本與考試範圍，確認無缺漏再休息', owner: '當事人' }
        ],
        qaComment: {
          gentle_family: '分數只是一時的體檢表，願意誠實面對並一起找讀書方法，比一次考 100 分更重要。',
          teen_growth: '我會對自己的課業負責，遇到卡關早點說出口，不再用拖延和隱瞞讓事情變糟。',
          teacher_record: '親師生已建立誠實回報與課後檢核公約，後續配合導師追蹤作業繳交情形。'
        }
      },
      {
        docs: [
          { docType: '課後節奏約定', docNumber: 'RULE-STD-02', docName: '回家先休息 30 分鐘，再以番茄鐘完成當日作業；遇困難先標記並主動發問，不熬夜硬撐也不空白逃避', owner: '當事人主導' }
        ],
        qaComment: {
          gentle_family: '把節奏排順了，讀書就不再那麼痛苦，我們一起試跑這週看看效果！',
          teen_growth: '先做完該做的事，後面玩得也比較安心，我會試著堅持這套節奏。',
          teacher_record: '個案已擬定明確課後作息與發問機制，同意進入觀察追蹤階段。'
        }
      },
      {
        docs: [
          { docType: '親師溝通約定', docNumber: 'RULE-STD-03', docName: '每週五晚上共同花 10 分鐘盤點本週各科狀態與下週考試，有需要協助提前提出', owner: '當事人與家長' }
        ],
        qaComment: {
          gentle_family: '每週定期聊 10 分鐘，就不必等到段考炸開才緊張，謝謝你願意一起規劃。',
          teen_growth: '每週盤點一次可以提早發現哪科快跟不上，減少考前爆掉的焦慮。',
          teacher_record: '每週定期檢視有助早期介入學習困難，預防缺交與隱瞞再發。'
        }
      }
    ]
  },

  'outing_safety': {
    id: 'outing_safety',
    label: '課後外出與行蹤安全',
    keywords: /(晚歸|沒回家|未歸|失聯|找不到人|翹課|翹補習|補習班|提早下課|逛街|西門町|網咖|撞球|KTV|宵夜|去玩|出去玩|未報備|沒告知|沒傳訊息|報警|同學家)/g,
    title: (actor) => `${actor}課後外出晚歸未報備安全事件`,
    defaultItem: '課後行程與安全報備',
    defaultWhen: '放學／補習課後至晚間時段',
    defaultWhere: '校外商圈／補習班外／返家途中',
    whyRule: {
      gentle_family: '未遵守「放學後行程變動、與朋友續攤或延後返家，必須事前傳訊或致電報備」的家庭安全約定',
      teen_growth: '外出臨時改變行程卻沒有主動告知家人去向與預計回家時間，造成家人極度焦慮與安全風險',
      teacher_record: '違反學生課後安全歸家規範，未經報備擅自逗留校外導致家長失聯擔憂'
    },
    howFound: '超過預定返家時間未見人影、訊息未讀或電話未接，家人四處聯繫才確認行蹤',
    impact: '讓家人極度擔心人身安全與恐慌，同時大幅折損對青少年自主外出安排的信任度',
    d2Options: [
      {
        actions: [
          { action: '第一時間確認當事人已平安到家、身體無恙，先安撫彼此緊繃情緒再談經過', owner: '家長／當事人', status: '已完成', result: '確認人身安全無虞，消除恐慌' },
          { action: '完整說明今晚實際去向、同行同學與未接電話的原因，讓資訊透明不再猜疑', owner: '當事人', status: '已完成', result: '釐清完整經過，解除安全疑慮' }
        ],
        verification: '已確認當事人平安返家並清楚交代行程經過，現場情緒漸趨穩定。'
      },
      {
        actions: [
          { action: '立即檢查手機電量、靜音設定與緊急聯絡人快捷設定，排除「沒聽到或沒電」的技術死角', owner: '當事人', status: '已完成', result: '確保未來緊急來電能即時接通' }
        ],
        verification: '已完成通訊設定檢查，避免再次出現失聯狀況。'
      },
      {
        actions: [
          { action: '先暫停這週末的臨時晚間外出一次作為冷靜與信任重建期，下週起依新報備公約恢復自主外出', owner: '當事人／家長', status: '進行中', result: '以明確邊界承擔責任並保留重建信任的路徑' }
        ],
        verification: '已達成短期責任承擔共識，並清楚界定恢復信任的標準。'
      }
    ],
    d3Options: [
      {
        chain: [
          { level: 'Why 1', question: '為什麼放學後臨時跟朋友出去卻沒有先跟家裡說？', answer: '覺得只是逛一下、吃個東西馬上就回去了，心想說了可能會被拒絕或一直問東問西。' },
          { level: 'Why 2', question: '為什麼會覺得「說了會被拒絕」？', answer: '過去臨時想跟同學聚會時，擔心大人直接說不行，所以選擇「先去了再說」或乾脆不回訊息。' },
          { level: 'Why 3', question: '為什麼沒有意識到家人會這麼恐慌？', answer: '當事人覺得自己已經國／高中了很安全，沒有換位想到「聯絡不到人」對家長來說就像失去線索一樣可怕。' },
          { level: 'Why 4（核心真因）', question: '根本的信任盲點是什麼？', answer: '雙方尚未建立「事前報備即尊重自主」的透明門禁規則，導致青少年怕被管而隱瞞、大人越擔心就管越緊。' }
        ],
        escaped: [],
        summary: {
          gentle_family: '核心真因在於擔心報備遭拒而心存僥倖，加上低估失聯對家人造成的恐慌，缺乏「透明報備換取自主空間」的明確規則。',
          teen_growth: '我因為怕被念或被拒絕才沒先說，卻沒換位想到家人聯絡不到人有多害怕；只要把去哪裡、跟誰、幾點回家講清楚，反而能贏得更多信任。',
          teacher_record: '個案因追求同儕自主且擔憂家長否決而未事前報備，忽略晚間校外安全與失聯焦慮。'
        }
      },
      {
        chain: [
          { level: 'Why 1', question: '為什麼超過回家時間還沒有聯絡家裡？', answer: '跟同學聊天玩得太開心忘了看時間，加上手機轉靜音或快沒電沒注意到來電。' },
          { level: 'Why 2（核心真因）', question: '缺乏哪項外出的基本防呆習慣？', answer: '外出前未設定返家前 30 分鐘鬧鐘，也沒隨身攜帶行動電源與固定報備模板。' }
        ],
        escaped: [],
        summary: {
          gentle_family: '與同儕聚會投入而忽略時間，且手機靜音／低電量未備妥提醒，導致錯過返家與報備時機。',
          teen_growth: '跟朋友在一起時容易忘記時間又開靜音，應該設好回家鬧鐘並固定傳一句報備訊息。',
          teacher_record: '個案外出時間管理與通訊備援習慣不足，造成晚歸失聯。'
        }
      },
      {
        chain: [
          { level: 'Why 1', question: '為什麼在補習提早下課或臨時更改行程時沒報備？', answer: '覺得偶爾一次自由活動沒關係，沒有把「行程變動必報備」當成不可妥協的安全底線。' },
          { level: 'Why 2（核心真因）', question: '需要建立什麼共識？', answer: '把「報備」定義為保護人身安全的基本禮貌，而不是被監視。' }
        ],
        escaped: [],
        summary: {
          gentle_family: '尚未將行程報備內化為基本安全底線，容易把單純報平安誤解為受控。',
          teen_growth: '報平安是為了安全而不是被管，養成一分鐘報備習慣能讓自己外出更自在。',
          teacher_record: '需強化青少年安全意識，區分「安全報備」與「過度干預」。'
        }
      }
    ],
    d4Options: [
      {
        actions: [
          { action: '建立「30 秒安全報備四要素」：行程有變立即傳訊告知「地點、同行對象、預計返家時間、交通方式」', category: '安全報備習慣', owner: '當事人', status: '進行中', verification: '接下來 3 次課後外出皆事前 100% 報備' },
          { action: '手機將父母設定為「允許穿透勿擾／靜音模式」的緊急聯絡人，外出必帶行動電源並設返家前 20 分鐘鬧鐘', category: '環境防呆措施', owner: '當事人', status: '已完成', verification: '現場實測緊急來電響鈴正常' },
          { action: '家長同步承諾：只要事前報備清楚且在合理門禁內，給予尊重與彈性，不無故奪命連環叩', category: '互信對等原則', owner: '家長', status: '進行中', verification: '雙方感受外出溝通明顯輕鬆互信' }
        ],
        before: '臨時改行程未告知且手機靜音，晚歸失聯引發全家人恐慌與爭執',
        after: '養成 30 秒四要素報備習慣，準時返家零失聯，順利重建自主外出信任',
        conclusion: '用「透明報備換取合理自主權」，兼顧青少年社交需求與人身安全。'
      },
      {
        actions: [
          { action: '共同訂出明確的平日與假日門禁時間表（例如平日 21:30、假日 22:00），若需晚歸須於前 1 小時主動詢問確認', category: '明確界限訂定', owner: '雙方共同', status: '進行中', verification: '門禁時間明確寫入公約不再各說各話' },
          { action: '返家搭車或夜歸時傳一則「已上車／預計 X 分鐘到家」訊息報平安', category: '安全習慣養成', owner: '當事人', status: '進行中', verification: '連續 1 個月落實返家報平安' }
        ],
        before: '門禁時間模糊，每次外出都像在猜大人底線',
        after: '平日與假日時間白紙黑字清楚約定，照表操課彼此安心',
        conclusion: '規則清楚透明後，大幅減少猜忌與臨時衝突。'
      },
      {
        actions: [
          { action: '誠懇為讓家人焦急擔心致歉，並主動分擔本週一次家務或採買作為體貼補償', category: '誠意致歉補償', owner: '當事人', status: '進行中', verification: '完成道歉與補償行動' }
        ],
        before: '忽略家人等待的焦慮感',
        after: '同理家人擔憂並以實際行動修補信任',
        conclusion: '換位思考是青少年邁向成熟自主的重要一步。'
      }
    ],
    d5Options: [
      {
        docs: [
          { docType: '外出安全公約', docNumber: 'RULE-OUT-01', docName: '「行程變動 30 秒必報備」：只要離開原定路線或晚歸，出發前必傳「去哪裡、跟誰、幾點回、怎麼回」；連續準時報備即維持完整社交自主權', owner: '當事人與家長' }
        ],
        qaComment: {
          gentle_family: '我們支持你和朋友相處，只要提前一分鐘報平安，我們就能放心給你更多自由。',
          teen_growth: '我理解安全報備是對自己與家人的負責，以後行程變動一定先傳訊息並準時回家。',
          teacher_record: '家庭已建立具體外出四要素報備公約與門禁標準，有助兼顧青少年社交與安全防護。'
        }
      },
      {
        docs: [
          { docType: '通訊安全清單', docNumber: 'CHK-OUT-02', docName: '外出前確認手機電量 > 50% 或帶行動電源，並保持父母緊急來電可接通', owner: '當事人' }
        ],
        qaComment: {
          gentle_family: '找得到人就不會胡思亂想，這個簡單的小習慣能讓全家都安心。',
          teen_growth: '出門管好電量跟聯絡方式很基本，我會確實做到。',
          teacher_record: '已建立外出通訊安全防呆檢查機制。'
        }
      },
      {
        docs: [
          { docType: '門禁互信約定', docNumber: 'RULE-OUT-03', docName: '明確區分平日與假日返家時間，若遇特殊活動需晚歸，提前一天提出申請與規劃返家交通', owner: '雙方共同' }
        ],
        qaComment: {
          gentle_family: '提前商量什麼都好談，我們一起守護這份彼此尊重的信任。',
          teen_growth: '有清楚的規則可以遵守，我也比較好跟朋友安排聚會時間。',
          teacher_record: '雙向門禁與事前申請原則明確，同意進入執行觀察。'
        }
      }
    ]
  },

  'money_spend': {
    id: 'money_spend',
    label: '金錢消費與財務自律',
    keywords: /([0-9]+元|塊錢|餐費|早餐錢|午餐錢|零用錢|壓歲錢|生活費|班費|補習費|點數卡|儲值|課金|網購|蝦皮|刷卡|信用卡|借錢|欠錢|透支|花光|偷拿錢|超商)/g,
    title: (actor) => `${actor}零用錢管理與理性消費自律事件`,
    defaultItem: '零用錢／餐費與消費支出',
    defaultWhen: '本週／本月消費時段',
    defaultWhere: '超商門市／網路購物平台／學校',
    whyRule: {
      gentle_family: '未遵守「專款專用、量入為出、不私自挪用餐費課金或未告知向同儕借貸」的財務自律約定',
      teen_growth: '衝動消費或挪用原本該吃飯的錢，導致月底透支甚至需要向朋友借錢周轉',
      teacher_record: '出現非理性消費、挪用生活餐費或同儕金錢借貸情形，衍生健康與同儕財務糾紛風險'
    },
    howFound: '家長核對發票帳單、零用錢餘額，或因餐費不足／同學反映借錢而察覺',
    impact: '影響正常三餐飲食健康，容易引發同儕金錢糾紛，並動搖家庭對個人理財能力的信任',
    d2Options: [
      {
        actions: [
          { action: '立即誠實盤點目前剩餘金額、所有花費明細與是否尚有向同學借款', owner: '當事人／家長', status: '已完成', result: '完整掌握金流現況，不留隱藏債務' },
          { action: '若有向同學借錢，先由家長陪同或督導於隔日全數歸還，避免演變為校園人際糾紛', owner: '當事人／家長', status: '進行中', result: '優先止血同儕借貸問題' }
        ],
        verification: '已完整清點帳目並優先處理外部借貸，財務漏洞已止血。'
      },
      {
        actions: [
          { action: '立即關閉遊戲或網購 App 的一鍵付款／免密支付功能，設定消費冷靜門檻', owner: '當事人', status: '已完成', result: '阻斷衝動下單的即時管道' }
        ],
        verification: '已完成數位消費防呆設定，避免再度衝動扣款。'
      },
      {
        actions: [
          { action: '先確保本週正餐飲食費用採每日定額領取，不讓課業與身體營養受影響', owner: '家長／當事人', status: '進行中', result: '保障基本飲食健康' }
        ],
        verification: '已恢復正餐專款專用，進入理財觀念重建階段。'
      }
    ],
    d3Options: [
      {
        chain: [
          { level: 'Why 1', question: '為什麼會把餐費或零用錢拿去課金／網購？', answer: '看到限時抽卡、優惠活動或同學都在買，當下很怕錯過就衝動花下去了。' },
          { level: 'Why 2', question: '為什麼花錢時沒有想到月底會沒錢吃飯？', answer: '餐費跟自由零用錢混在同一個錢包裡，沒記帳就很容易高估自己能花的額度。' },
          { level: 'Why 3', question: '為什麼透支後不敢先找家人，反而去跟同學借錢？', answer: '怕被發現亂花錢挨罵，想先借錢撐過去，結果洞越補越大。' },
          { level: 'Why 4（核心真因）', question: '根本的理財習慣缺口是什麼？', answer: '缺乏「必要支出與娛樂預算分袋管理」以及「消費前 24 小時冷靜期」，在商業限時誘惑下容易失控。' }
        ],
        escaped: [],
        summary: {
          gentle_family: '核心真因在於餐費與娛樂費未分開管理、缺乏記帳習慣，加上面對限時課金或網購誘惑時缺少冷靜緩衝期。',
          teen_growth: '我把吃飯錢跟娛樂錢混在一起，又一時衝動被限時活動吸引才透支，以後應該分開管帳並練會先等 24 小時再買。',
          teacher_record: '個案缺乏預算分流與記帳概念，受限時行銷與同儕效應影響產生衝動消費與借貸行為。'
        }
      },
      {
        chain: [
          { level: 'Why 1', question: '為什麼容易在遊戲或網路上不知不覺花掉好幾百元？', answer: '每次都是小額 100、200 元，結帳太方便沒感覺，月底加總才嚇一跳。' },
          { level: 'Why 2（核心真因）', question: '如何讓消費重新有「痛感」與界限？', answer: '設定每月固定娛樂上限金額並逐筆記帳，花完就停，絕不動用正餐費。' }
        ],
        escaped: [],
        summary: {
          gentle_family: '小額無痛消費累積效應強，未設定單月娛樂上限與每週對帳機制，導致超支卻不自知。',
          teen_growth: '小額一直刷最容易不知不覺花光，設定固定娛樂預算並記帳才能真的守住錢包。',
          teacher_record: '個案對小額累計支出缺乏金錢敏感度，需建立預算上限與定期核帳習慣。'
        }
      },
      {
        chain: [
          { level: 'Why 1', question: '為什麼想靠花錢買點數或潮牌來獲得開心？', answer: '希望在遊戲或同儕圈裡跟上大家、獲得成就感或紓解壓力。' },
          { level: 'Why 2（核心真因）', question: '健康的平衡點在哪裡？', answer: '允許在合理預算內享受興趣，同時建立靠努力存錢換取大額願望的成就感。' }
        ],
        escaped: [],
        summary: {
          gentle_family: '將消費當成即時紓壓與同儕認同來源，需透過合法娛樂預算與存錢目標建立健康金錢觀。',
          teen_growth: '花錢確實會短暫開心，但透支後的焦慮更痛苦；我想學會存錢買真正想要的東西。',
          teacher_record: '個案具透過消費尋求同儕認同與紓壓傾向，宜結合預算管理與正向理財教育。'
        }
      }
    ],
    d4Options: [
      {
        actions: [
          { action: '實施「三信封／三帳戶分流法」：正餐交通費（不可動用）、每月固定娛樂預算、長期儲蓄目標分開存放', category: '理財工具建立', owner: '當事人', status: '進行中', verification: '連續 4 週正餐費零挪用' },
          { action: '針對透支或家人代墊的金額，制定分期償還計畫（從後續娛樂預算扣除＋協助家庭特定事務換取零用金）', category: '實質責任承擔', owner: '當事人', status: '進行中', verification: '按週紀錄償還進度直至結清' },
          { action: '執行「300 元以上消費 24 小時冷靜法則」：想課金或網購超過 300 元先放購物車等一天，隔天仍覺得值得再買', category: '消費自律習慣', owner: '當事人', status: '進行中', verification: '每週與家長簡單核對記帳本 5 分鐘' }
        ],
        before: '餐費與零用錢混用無記帳，衝動課金網購導致月底透支借錢',
        after: '帳目分流清楚、每週記帳零借貸，並靠自己規劃逐步清償透支金額',
        conclusion: '透過分流管理與自己承擔清償責任，將一次財務失誤轉化為珍貴的理財課。'
      },
      {
        actions: [
          { action: '下載免費手機記帳 App（或紙本記帳卡），每次消費隨手花 10 秒記錄，每週日晚上花 5 分鐘結算餘額', category: '記帳習慣養成', owner: '當事人', status: '進行中', verification: '連續 2 週完整記帳無漏記' },
          { action: '設定單月遊戲／娛樂消費硬上限，超過上限絕不透支，也絕不向同學借貸超過 50 元以上金額', category: '財務底線守則', owner: '當事人', status: '進行中', verification: '本月娛樂支出符合預算內' }
        ],
        before: '不知道錢花去哪裡，月底總是入不敷出',
        after: '清楚掌握每筆流向，主動控制開銷不透支',
        conclusion: '看見金流就能管住金流，建立受用一生的財務自律能力。'
      },
      {
        actions: [
          { action: '改採「每週定額發放零用錢」過渡 1 個月，待記帳與預算控制穩定後再恢復每月自主領取', category: '階段性過渡支持', owner: '家長／當事人', status: '進行中', verification: '穩定達標 4 週即恢復原制度' }
        ],
        before: '月初一次領一大筆容易前兩週就花光',
        after: '先以週為單位練習分配，順利過渡到月管理',
        conclusion: '縮短預算週期降低失控難度，循序建立財務信心。'
      }
    ],
    d5Options: [
      {
        docs: [
          { docType: '家庭理財公約', docNumber: 'RULE-FIN-01', docName: '「專款專用、記帳透明、不私下借貸」：餐費與娛樂預算嚴格分開；超過 300 元非必要消費冷靜 24 小時；若有臨時資金需求一律誠實向家人商量，絕不向同儕大額借錢', owner: '當事人與家長' }
        ],
        qaComment: {
          gentle_family: '年輕時學會管理幾百、幾千元，比長大後跌大跤更有價值。謝謝你誠實面對帳目，我們一起把理財習慣練好！',
          teen_growth: '我願意為這次透支負責並分期補回，也學會把吃飯錢跟娛樂費分開管理。',
          teacher_record: '個案與家長已建立預算分流、記帳追蹤與禁止私下借貸公約，有效預防校園金錢糾紛。'
        }
      },
      {
        docs: [
          { docType: '每週對帳習慣', docNumber: 'CHK-FIN-02', docName: '每週日晚間自主結算本週支出與儲蓄進度，誠實呈現不隱瞞', owner: '當事人' }
        ],
        qaComment: {
          gentle_family: '帳目清楚就能建立信任，期待看到你靠自己存下第一筆目標基金！',
          teen_growth: '每週花 5 分鐘對帳很輕鬆，能避免自己又不小心超支。',
          teacher_record: '已建立定期理財檢核習慣，持續觀察一個月。'
        }
      },
      {
        docs: [
          { docType: '消費冷靜約定', docNumber: 'RULE-FIN-03', docName: '遊戲儲值與網購設定單月固定額度，結帳前先停 24 小時確認是否真的需要', owner: '當事人主導' }
        ],
        qaComment: {
          gentle_family: '我們不禁止娛樂，但希望你當錢的主人而不是被限時活動牽著走。',
          teen_growth: '當錢的主人感覺踏實多了，我會遵守 24 小時冷靜期。',
          teacher_record: '已建立理性消費緩衝機制，有助提升自我控管力。'
        }
      }
    ]
  },

  'peer_social': {
    id: 'peer_social',
    label: '同儕社群與手足互動',
    keywords: /(群組|LINE|IG|限動|截圖|酸|排擠|分組報告|同學吵架|口角|打架|推擠|搶|遙控器|電視|手足|吵架|說壞話|公審|霸凌|翻臉|冷戰)/g,
    title: (actor) => `${actor}同儕社群／手足人際衝突處理事件`,
    defaultItem: '人際溝通與群組互動',
    defaultWhen: '課間／放學後線上或家中互動時段',
    defaultWhere: '班級社群群組／學校教室／家中客廳',
    whyRule: {
      gentle_family: '未遵守「就事論事、不在公開群組嘲諷截圖或動手推擠、尊重他人感受」的人際相處底線',
      teen_growth: '在生氣時衝動用公開酸言或肢體爭搶發洩情緒，讓原本可以溝通的小事變成傷害關係的衝突',
      teacher_record: '於班級同儕（含社群媒體）或手足互動中發生不當言語／肢體衝突，影響團體和諧與當事人權益'
    },
    howFound: '現場發生激烈口角哭鬧，或社群截圖傳開後由同學、師長或家人介入得知',
    impact: '造成對方尷尬受傷與班級／家庭氣氛緊張，公開社群紀錄更可能留下難以抹滅的誤會',
    d2Options: [
      {
        actions: [
          { action: '立即停止線上筆戰或現場爭執，若已發出不當貼文／訊息先收回或刪除，避免截圖持續擴散', owner: '當事人', status: '已完成', result: '阻止衝突在群組或現場繼續擴大' },
          { action: '先各自冷靜，避免在氣頭上拉攏其他同學選邊站，並請信任的師長或家人協助客觀釐清事實', owner: '當事人／師長或家長', status: '進行中', result: '避免誤會演變為群體對立' }
        ],
        verification: '已立即止住社群／現場衝突擴散，雙方暫停對立等待理性調解。'
      },
      {
        actions: [
          { action: '分開雙方冷靜 15 分鐘，確認無人員受傷後，分別聽取兩邊完整的看法不偏袒', owner: '家長／導師', status: '已完成', result: '雙方情緒降溫且感受被公平傾聽' }
        ],
        verification: '現場情緒已平復，雙方願意進入理性溝通。'
      },
      {
        actions: [
          { action: '私訊或當面先釋出善意：「剛才我太衝動了，那段話不該那樣說，我們私下把分工／事情講清楚好嗎？」', owner: '當事人', status: '進行中', result: '將公開衝突拉回一對一理性對話' }
        ],
        verification: '已啟動私下善意溝通，大幅降低尷尬與敵意。'
      }
    ],
    d3Options: [
      {
        chain: [
          { level: 'Why 1', question: '為什麼會在群組裡酸對方或現場大吵起來？', answer: '覺得對方不公平或沒盡到責任，累積了委屈卻沒地方說，一時氣不過就爆發了。' },
          { level: 'Why 2', question: '為什麼選擇在公開群組或用激烈語氣，而不是私下好好反映？', answer: '當下想讓大家評評理、證明自己是對的，沒有停下來想「公開點名只會讓對方惱羞成怒」。' },
          { level: 'Why 3', question: '文字訊息或當面搶奪為什麼特別容易引爆衝突？', answer: '線上文字少了語氣表情容易被過度解讀，而爭搶當下雙方都在爭一口氣。' },
          { level: 'Why 4（核心真因）', question: '這件事背後真正需要學會的人際功課是什麼？', answer: '區分「表達不滿」與「攻擊對方」，學會『私下溝通、對事不對人、必要時找中立第三方協調』。' }
        ],
        escaped: [],
        summary: {
          gentle_family: '核心真因在於覺得委屈不公時急著證明自己是對的，未先停下冷靜就直接以公開嘲諷或爭執回應，使焦點偏離原本要解決的問題。',
          teen_growth: '我原本只是覺得分工不公或不被尊重，但用公開酸人／動手的方式表達，反而讓自己站不住腳，也傷了同學／家人的感情。',
          teacher_record: '個案在面對團體分工或資源競爭挫折時，情緒衝動下採取公開非難或肢體衝突手段，缺乏私下協商與求助技巧。'
        }
      },
      {
        chain: [
          { level: 'Why 1', question: '為什麼會為了小事爭吵不休？', answer: '事先沒有講好輪流規則或明確分工表，遇到灰色地帶雙方都覺得自己吃虧。' },
          { level: 'Why 2（核心真因）', question: '根本的預防關鍵在哪裡？', answer: '事前把規則與分工白紙黑字講清楚，遇爭議先回到規則看而非比誰聲音大。' }
        ],
        escaped: [],
        summary: {
          gentle_family: '缺乏事前清楚的分工與輪流規則，遇到模糊地帶容易各執一詞引發衝突。',
          teen_growth: '把分工跟時間順序先講清楚，就不用事後吵得面紅耳赤。',
          teacher_record: '團體或手足間缺乏明確分工與資源輪替機制，導致爭議升高。'
        }
      },
      {
        chain: [
          { level: 'Why 1', question: '為什麼在網路上打字比面對面更容易說出重話？', answer: '隔著螢幕看不到對方難過的表情，加上當下想迅速反擊，沒經過三思就按了送出。' },
          { level: 'Why 2（核心真因）', question: '數位時代必備的自我保護習慣是什麼？', answer: '建立「生氣時不按送出、先打在備忘錄放 10 分鐘」的數位發言防呆習慣。' }
        ],
        escaped: [],
        summary: {
          gentle_family: '隔著螢幕降低同理心與煞車感，在衝動下送出傷人文字並留下永久數位足跡。',
          teen_growth: '生氣打的字永遠不該直接送出，先放備忘錄 10 分鐘能救自己免於很多後悔。',
          teacher_record: '個案於社群媒體互動中缺乏情緒緩衝與數位足跡風險意識。'
        }
      }
    ],
    d4Options: [
      {
        actions: [
          { action: '針對不當的公開言論或推擠行為，向對方正式誠懇道歉（公開傷人則在適當場合澄清，私下也表達歉意）', category: '誠意修復關係', owner: '當事人', status: '進行中', verification: '完成真誠道歉並化解公開尷尬' },
          { action: '回到事情本質：重新用客觀清單確認分組進度或共用物品輪流表，讓規則公平透明', category: '問題本質解決', owner: '雙方／組員', status: '進行中', verification: '分工或輪流機制雙方均點頭同意' },
          { action: '養成「社群發言 10 分鐘冷靜法則」：感到生氣想反擊時，先把字打在備忘錄 10 分鐘，確定對事不對人再決定要不要傳', category: '數位人際自律', owner: '當事人', status: '進行中', verification: '不再於群組情緒性發言或截圖公審' }
        ],
        before: '遇不公或誤會就在群組開酸／現場推擠，把小摩擦升級為公開對立',
        after: '學會先冷靜、私下對事溝通並訂出公平分工，成功化解衝突維持人際信用',
        conclusion: '學會成熟處理衝突不是忍氣吞聲，而是用不傷害自己與他人的方式把事情解決。'
      },
      {
        actions: [
          { action: '練習「事實＋感受＋請求」三步驟溝通（例如：『這部分還沒完成我有點焦慮，我們能今天八點前補齊嗎？』）', category: '正向溝通技巧', owner: '當事人', status: '進行中', verification: '實際運用於本次後續協調' },
          { action: '若私下溝通仍無效，依正常管道找組長、老師或家長客觀介入，不私下公審或動手', category: '正確求助管道', owner: '當事人', status: '進行中', verification: '遇爭議改以理性求助處理' }
        ],
        before: '直接指責貼標籤，讓對方立刻進入防禦狀態',
        after: '改用具體事實與請求溝通，更容易達成雙贏結果',
        conclusion: '升級溝通工具後，既能維護自己權益又不破壞團體關係。'
      },
      {
        actions: [
          { action: '手足共用資源（電視、遊戲機、空間）全面改用計時器與輪流表，時間到自動交換不爭搶', category: '環境公平機制', owner: '手足共同', status: '進行中', verification: '連續 2 週和平輪流零推擠' }
        ],
        before: '誰先搶到算誰的，天天為了輪流吵架',
        after: '照計時器與輪流表走，公平清楚零爭執',
        conclusion: '用透明規則代替力量與音量競爭。'
      }
    ],
    d5Options: [
      {
        docs: [
          { docType: '人際與社群公約', docNumber: 'RULE-SOC-01', docName: '「私下溝通、公開尊重、生氣不按送出、爭議不動手」：遇摩擦先冷靜 10 分鐘，不截圖公審、不拉幫結派，對事提出具體解決方案', owner: '當事人與師長／家長' }
        ],
        qaComment: {
          gentle_family: '願意承認衝動並主動修復關係非常有勇氣，學會「對事不對人」會讓你未來在班級和社會都更受信任。',
          teen_growth: '我會記住網路跟現場說出口的話都會留下影響，以後生氣先停 10 分鐘再處理。',
          teacher_record: '個案已理解數位言論與同儕互動界限，並完成修復溝通規劃，建議持續關注班級互動氣氛。'
        }
      },
      {
        docs: [
          { docType: '團隊／手足公平約定', docNumber: 'RULE-SOC-02', docName: '分組合作與共用資源一律事前講清分工與時段，遇進度落後提前反映協調', owner: '相關成員共同' }
        ],
        qaComment: {
          gentle_family: '把規則談在前面，關係就能長長久久，很高興看到你們和平找到方法。',
          teen_growth: '事前把規則講清楚，對彼此都最公平也最省力。',
          teacher_record: '已建立明確分工與協商規範，降低同類衝突復發率。'
        }
      },
      {
        docs: [
          { docType: '數位禮儀檢核', docNumber: 'CHK-SOC-03', docName: '發文與群組留言前問自己三件事：「是真的嗎？有必要公開說嗎？如果是自己被這樣說會舒服嗎？」', owner: '當事人' }
        ],
        qaComment: {
          gentle_family: '這三個問題很棒，能保護別人，更能保護你自己不捲入網路風波。',
          teen_growth: '發文前三思能避開超多無謂的麻煩，我會放在心上。',
          teacher_record: '已建立正向數位公民自律思維。'
        }
      }
    ]
  },

  'boundary_item': {
    id: 'boundary_item',
    label: '物品借用與隱私界限',
    keywords: /(擅自|沒問過|未經同意|沒經過同意|偷拿|偷看|翻看|日記|耳機|藍牙耳機|玩偶|彩色筆|文具|筆記本|化妝品|香水|衣服|球鞋|水壺|模型|卡牌|弄壞|摔裂|摔壞|弄丟|隱私|私人物品)/g,
    title: (actor) => `${actor}物品借用與個人隱私界限事件`,
    defaultItem: '他人私人物品／私人空間',
    defaultWhen: '事發當日出門前或課餘時段',
    defaultWhere: '家人房間／學校教室座位',
    whyRule: {
      gentle_family: '未遵守「未獲物主本人明確同意，不得進入私人空間、翻看或取用私人物品」的尊重界限',
      teen_growth: '圖一時方便未事先詢問就動用他人心愛物品（甚至造成損壞），侵犯了對方的界限與信任',
      teacher_record: '未經所有權人同意擅自取用或接觸他人私有財物／隱私空間，造成物品損壞風險與關係信任受損'
    },
    howFound: '物主發現物品遺失、被動過或受損後提出抗議，經詢問確認實情',
    impact: '造成物主強烈不被尊重與不安全感，心愛物品面臨損壞遺失風險，嚴重傷害彼此信任',
    d2Options: [
      {
        actions: [
          { action: '立即停止使用並將物品雙手完整歸還，如實告知現況與受損細節，絕不隱瞞推託', owner: '當事人', status: '已完成', result: '物品已歸還物主，實情清楚交代' },
          { action: '由家長或師長陪同承接物主的委屈與生氣情緒，明確肯定「你的界限與所有權應該被尊重」', owner: '家長／師長', status: '已完成', result: '物主感受被重視，情緒獲得安撫' }
        ],
        verification: '物品已安全歸還且受損狀況已清點，物主權益與情緒獲得正式承認。'
      },
      {
        actions: [
          { action: '拍照記錄受損部位並立即查詢原廠維修或同規格新品價格，展現負責態度', owner: '當事人', status: '進行中', result: '明確估算賠償成本，展現誠意' }
        ],
        verification: '已進入實質責任評估，不再爭辯對錯。'
      },
      {
        actions: [
          { action: '先暫停進入物主房間／使用相關共用設備，讓對方重新感到私人空間安全', owner: '當事人', status: '已完成', result: '立即恢復對方的空間安全感' }
        ],
        verification: '已立即重設空間界限，穩定現場氣氛。'
      }
    ],
    d3Options: [
      {
        chain: [
          { level: 'Why 1', question: '為什麼沒有先問過對方就直接拿走或翻看？', answer: '當下很想用（或很好奇），覺得反正只是借一下、很快放回去應該沒關係。' },
          { level: 'Why 2', question: '為什麼不傳訊息或開口問一聲？', answer: '心裡預期問了對方大概會拒絕，所以抱持僥倖心態「先拿了再說」。' },
          { level: 'Why 3', question: '為什麼低估了對方會這麼生氣？', answer: '覺得是自己家人或熟人不用那麼見外，沒有換位思考「東西沒經過同意被動過」會讓人非常沒有安全感。' },
          { level: 'Why 4（核心真因）', question: '核心界限盲點是什麼？', answer: '把「親近關係」誤以為「不用遵守界限」，忽略了即使是家人朋友，個人空間、物品與隱私依然是神聖不可侵犯的。' }
        ],
        escaped: [
          { level: '環境漏洞 1', question: '為何未建立清楚標示？', answer: '家中未明確區分「公共物品區」與「個人專屬不可碰區」。' }
        ],
        summary: {
          gentle_family: '核心真因在於抱持「熟人借一下沒關係」的僥倖心態，加上怕被拒絕而省略詢問，忽略了個人物品與隱私界限的重要性。',
          teen_growth: '我因為怕被拒絕又圖一時方便，沒問過就拿走別人的東西；換作是我的東西被亂動我也會很生氣，這件事讓我真的體會到界限的重要。',
          teacher_record: '個案因僥倖心態與所有權界限意識薄弱，未經授權擅用他人財物，造成財損與信任破壞。'
        }
      },
      {
        chain: [
          { level: 'Why 1', question: '為什麼會拿別人的東西去學校用？', answer: '自己的設備沒電、忘了帶，或覺得對方的物品比較好用／體面。' },
          { level: 'Why 2（核心真因）', question: '下次遇到自己缺少物品時該怎麼辦？', answer: '提前準備好自己的物品，若真的急需必須徵得本人明確點頭，對方說不行就要完全尊重。' }
        ],
        escaped: [],
        summary: {
          gentle_family: '因自身事前準備不足或羨慕他人用品，在未獲同意下便宜行事，需建立自備物品與尊重拒絕的習慣。',
          teen_growth: '下次自己的東西沒準備好就自己承擔不便，不能把方便建立在侵犯別人的界限上。',
          teacher_record: '個案因自備不足而便宜行事動用他人私物，須強化自我管理與尊重拒絕權。'
        }
      },
      {
        chain: [
          { level: 'Why 1', question: '為什麼即使是一點小刮傷或翻動也會嚴重傷害信任？', answer: '對方在意的往往不只是價錢，而是「在自己家裡或座位上居然不能安心」。' },
          { level: 'Why 2（核心真因）', question: '重建信任的關鍵是什麼？', answer: '除了賠償物品本身，更要用長期的「先敲門、先詢問、不越界」重新累積安全感。' }
        ],
        escaped: [],
        summary: {
          gentle_family: '破壞的核心不只是物品價值，更是安全感與互信；唯有誠懇賠償加上長期嚴守界限才能修復。',
          teen_growth: '我懂了這不只是錢的問題，而是有沒有尊重對方，我會用長期守規矩把信任贏回來。',
          teacher_record: '需引導個案同理被害方之心理安全感需求，並透過實質賠償與界限公約修復關係。'
        }
      }
    ],
    d4Options: [
      {
        actions: [
          { action: '向物主正式誠懇道歉，不找藉口（「我錯在沒問過你就拿／碰，也弄壞了你的東西，真的很對不起」）', category: '誠意致歉修復', owner: '當事人', status: '進行中', verification: '物主收到真誠道歉並確認態度' },
          { action: '承擔實質賠償責任：以個人零用錢、壓歲錢或勞動服務存錢，負擔維修費用或購置同規格全新物品歸還', category: '實質賠償負責', owner: '當事人', status: '進行中', verification: '完成維修或新品交付確認' },
          { action: '落實「進房先敲門、借物先傳訊／開口、被拒不生氣」三原則，並對等尊重雙方私人空間與手機隱私', category: '界限習慣建立', owner: '全體成員', status: '進行中', verification: '連續 1 個月零未經同意拿取紀錄' }
        ],
        before: '未經詢問擅入房間拿取他人私物並造成損壞，導致關係嚴重裂痕',
        after: '完成誠懇道歉與合理賠償，徹底落實「先問過才碰」，彼此空間安全感順利恢復',
        conclusion: '負起實質賠償責任並建立對等界限，讓越界事件轉化為尊重他人的成長契機。'
      },
      {
        actions: [
          { action: '在家中明確劃分「公共共用區」（文具、充電線、常備品）與「個人專屬禁區」，清楚區隔不再模糊', category: '環境界限防呆', owner: '全家共同', status: '進行中', verification: '完成居家公共與私有物品分區' },
          { action: '為自己準備基本備用品（如備用耳機線或個人文具），不再臨時依賴拿取他人東西', category: '自理準備習慣', owner: '當事人', status: '規劃中', verification: '完成個人常用物品盤點自備' }
        ],
        before: '公私物品界限模糊，急用時順手就拿別人的',
        after: '公私分明且自備齊全，徹底杜絕順手牽羊的誤會與衝突',
        conclusion: '環境清楚分界加上自備習慣，從源頭消除借物爭議。'
      },
      {
        actions: [
          { action: '承擔對方一週份的指定家務作為額外補償，用具體行動表達重視與誠意', category: '誠意行動補償', owner: '當事人', status: '進行中', verification: '確實完成一週補償家務並獲物主認可' }
        ],
        before: '口頭說抱歉卻沒讓對方感受到誠意',
        after: '透過具體付出讓對方真正感受到尊重與修補心意',
        conclusion: '行動勝於空口承諾，有效加快信任修復速度。'
      }
    ],
    d5Options: [
      {
        docs: [
          { docType: '界限與隱私公約', docNumber: 'RULE-BND-01', docName: '「敲門才進房、同意才借物、隱私不窺探、損壞必賠償」：家庭所有成員（含長輩與手足）一體適用，對方有權說不且不需理由', owner: '全體家庭成員' }
        ],
        qaComment: {
          gentle_family: '尊重界限是家裡每個人都該享有的安全感，感謝你勇於認錯並願意用自己的方式負責賠償。',
          teen_growth: '我會嚴格守住別人的空間與物品界限，先問過得到同意才碰，也為這次造成的損失負全責。',
          teacher_record: '已建立明確之所有權尊重與實質賠償公約，建議後續確認賠償落實與手足關係回溫。'
        }
      },
      {
        docs: [
          { docType: '借物三步驟規範', docNumber: 'CHK-BND-02', docName: '借用他人用品必做三步驟：1. 事前取得本人同意 2. 約定歸還時間 3. 完好清潔歸還', owner: '當事人' }
        ],
        qaComment: {
          gentle_family: '好借好還，再借不難；把這三步驟養成習慣，不管在家裡還是學校都會很受歡迎。',
          teen_growth: '照借物三步驟做很清楚，不會再因為粗心破壞跟身邊人的信任。',
          teacher_record: '借物標準流程明確，便於日常自我檢核。'
        }
      },
      {
        docs: [
          { docType: '對等尊重約定', docNumber: 'RULE-BND-03', docName: '賦予家中每位成員對等的個人書桌／抽屜與隱私主權，彼此守護不越線', owner: '全體家庭成員' }
        ],
        qaComment: {
          gentle_family: '當每個人的界限都被同等守護，彼此就更能真心同理對方。',
          teen_growth: '彼此都互相尊重隱私跟空間，家裡住起來會更舒服。',
          teacher_record: '採對等空間主權公約，有效建立青少年同理心與界限感。'
        }
      }
    ]
  },

  'chore_self': {
    id: 'chore_self',
    label: '家務分工與生活自理',
    keywords: /(倒垃圾|垃圾車|廚餘|洗碗|水槽|發臭|做家事|家務|打掃|整理房間|書桌|雜物|臭襪子|衣服|洗衣籃|長螞蟻|發霉|寵物|值日生|髒亂)/g,
    title: (actor) => `${actor}家務責任分工與生活自理事件`,
    defaultItem: '負責家務與個人環境整潔',
    defaultWhen: '晚間課後與家務分工時段',
    defaultWhere: '家中廚房／客廳／個人房間',
    whyRule: {
      gentle_family: '未遵守「按時完成自己認領的家庭分工、維持基本環境衛生」的共同生活約定',
      teen_growth: '把該做的家務與房間整理一再拖延，不僅弄亂環境，也把自己的責任無形轉嫁給其他家人',
      teacher_record: '未落實既定家務或班級環境整潔責任，影響公共衛生與團體分工公平性'
    },
    howFound: '家人返家或使用空間時發現髒亂異味、碗盤堆積或漏倒垃圾而察覺',
    impact: '造成環境發臭滋生蚊蟲、找課本物品耗時，也讓其他承擔家務的家人感到疲憊與不被體諒',
    d2Options: [
      {
        actions: [
          { action: '立即放下手邊娛樂，花 15 分鐘先把最緊急的髒亂源（如堆積碗盤、廚餘垃圾或散落衣物）清理歸位', owner: '當事人', status: '已完成', result: '環境衛生立即恢復清爽，消除異味' }
        ],
        verification: '積欠之家務與環境異味已立即清理完成，現場恢復整潔。'
      },
      {
        actions: [
          { action: '向這兩天辛苦善後的家人說聲謝謝與抱歉，並立即接手完成當日家務項目', owner: '當事人', status: '已完成', result: '肯定家人付出並展現擔當' }
        ],
        verification: '已主動致謝並接手完成家務，家庭氣氛緩和。'
      },
      {
        actions: [
          { action: '與家人用 5 分鐘重新確認本週分工項目與明確完成時間點，不再模糊拖延', owner: '當事人／家長', status: '進行中', result: '明確責任歸屬與截止時點' }
        ],
        verification: '已完成分工時間對齊，進入習慣建立階段。'
      }
    ],
    d3Options: [
      {
        chain: [
          { level: 'Why 1', question: '為什麼負責的家務或整理總是一拖再拖？', answer: '放學或吃完飯只想先滑手機、追劇放鬆一下，心想「等一下再去洗／去倒」。' },
          { level: 'Why 2', question: '為什麼「等一下」最後變成忘記或不想做？', answer: '一進入娛樂狀態就會徹底忘記時間，等到很晚覺得累了就乾脆放到明天。' },
          { level: 'Why 3', question: '為什麼每次都要大人催好幾遍才動？', answer: '家務缺乏明確的「觸發時間點」（例如吃完飯立刻洗、垃圾車前 15 分鐘鬧鐘），一直靠大人嘴巴提醒反而產生逆反心態。' },
          { level: 'Why 4（核心真因）', question: '根本的習慣設計盲點是什麼？', answer: '沒有把家務綁定在既有作息節點上，並錯估「累積兩天的髒亂」其實比「每天順手花 5 分鐘」更痛苦。' }
        ],
        escaped: [],
        summary: {
          gentle_family: '核心真因在於抱持「等一下再做」的拖延心態，且家務未綁定固定鬧鐘或作息觸發點，導致需依賴長輩反覆催促。',
          teen_growth: '其實每天花 5 分鐘順手收完最輕鬆，但每次先坐下來看螢幕就會拖到發臭，應該設好手機提醒並在放鬆前先速戰速決。',
          teacher_record: '個案具家務拖延慣性，缺乏固定執行時點與自我提醒工具，進而影響居家／班級整潔。'
        }
      },
      {
        chain: [
          { level: 'Why 1', question: '為什麼房間或書桌總是堆到找不到東西？', answer: '用完的講義、飲料杯和衣服沒有固定「回家的位置」，隨手放就越堆越高。' },
          { level: 'Why 2（核心真因）', question: '最省力的整理方式是什麼？', answer: '在桌邊放一個「待歸位收納籃」＋每天睡前 3 分鐘清零桌面。' }
        ],
        escaped: [],
        summary: {
          gentle_family: '缺乏簡易收納動線與每日 3 分鐘歸位習慣，使小雜物快速堆積成難以收拾的負擔。',
          teen_growth: '書桌太亂找考卷超浪費時間，每天睡前花 3 分鐘歸位比週末大掃除輕鬆一百倍。',
          teacher_record: '個人空間缺少明確收納配置與每日微整理習慣。'
        }
      },
      {
        chain: [
          { level: 'Why 1', question: '為什麼會覺得做家務很煩、很想逃避？', answer: '覺得自己課業已經很忙了，家務像額外的苦差事。' },
          { level: 'Why 2（核心真因）', question: '怎麼重新定位家務分工？', answer: '家務不是幫忙別人，而是共同住在這個家裡每個人應分擔的生活自理能力，也是未來獨立生活的基本功。' }
        ],
        escaped: [],
        summary: {
          gentle_family: '將家務視為額外負擔而非共同生活責任，透過合理減量與自主挑選時段可大幅提升認同感。',
          teen_growth: '大家每天都在忙，分擔一兩項固定家務其實只要十幾分鐘，做完也能理直氣壯休息。',
          teacher_record: '需引導建立家庭共同體意識與生活自理責任感。'
        }
      }
    ],
    d4Options: [
      {
        actions: [
          { action: '建立「先做 10 分鐘再放鬆」鐵則＋手機固定鬧鐘提醒（例如垃圾車前 15 分鐘、晚餐後 20 分鐘內清完水槽）', category: '觸發習慣設計', owner: '當事人', status: '進行中', verification: '連續 7 天免長輩催促自動完成' },
          { action: '每天睡前執行「3 分鐘桌面清零」：廚餘垃圾丟掉、衣物進洗衣籃、隔日課本收妥', category: '個人自理習慣', owner: '當事人', status: '進行中', verification: '書桌保持可隨時寫作業的整潔狀態' },
          { action: '若因段考前夕真的時間緊迫，學會提前開口與家人換班（「這兩天準備考試，週末我來負責多倒兩次垃圾」）', category: '彈性責任溝通', owner: '當事人／家長', status: '進行中', verification: '落實事前協調而非直接放著不管' }
        ],
        before: '靠大人反覆催促仍拖延漏做，造成廚餘碗盤發臭與房間雜亂',
        after: '透過手機鬧鐘與 3 分鐘清零習慣，自動完成負責家務零催促，家庭氣氛更輕鬆',
        conclusion: '用固定觸發鬧鐘取代碎念催促，讓生活自理變得輕鬆可控。'
      },
      {
        actions: [
          { action: '重新檢視家務分工表，讓當事人自主選擇 1～2 項最順手的固定任務並設定明確完成死線', category: '自主參與分工', owner: '全家共同', status: '進行中', verification: '分工表張貼於冰箱或群組記事本' }
        ],
        before: '被指派不順手或時間衝突的家務容易抗拒',
        after: '自己挑選認領的任務更有意願準時完成',
        conclusion: '給予選擇權與明確死線，有效提升責任感。'
      },
      {
        actions: [
          { action: '做家務時允許搭配聽自己喜歡的音樂或 Podcast 15 分鐘，讓整理過程變得輕鬆不無聊', category: '正向習慣綁定', owner: '當事人', status: '進行中', verification: '順利養成每日順手整理習慣' }
        ],
        before: '覺得洗碗收房間很枯燥，能躲就躲',
        after: '邊聽歌邊快速收拾，10 分鐘就搞定超有成就感',
        conclusion: '把家務和愉悅小習慣綁定，大幅降低啟動阻力。'
      }
    ],
    d5Options: [
      {
        docs: [
          { docType: '家庭分工公約', docNumber: 'RULE-CHR-01', docName: '「自己的任務鬧鐘提醒、不拖過隔夜、忙時提前換班」：每日負責家務於約定時段內自主完成，大人不再提前碎念催促', owner: '當事人與家長' }
        ],
        qaComment: {
          gentle_family: '謝謝你願意一起維護大家住的環境，用鬧鐘代替催促，家裡會少掉很多不必要的摩擦！',
          teen_growth: '把分內家務速戰速決只要十幾分鐘，不用被催感覺也自在多了。',
          teacher_record: '已建立明確家務分工觸發機制與彈性換班原則，培養青少年生活自理能力。'
        }
      },
      {
        docs: [
          { docType: '每日 3 分鐘清零卡', docNumber: 'CHK-CHR-02', docName: '睡前 3 分鐘：飲料空杯進水槽、衣物進洗衣籃、桌面清出明天唸書空間', owner: '當事人' }
        ],
        qaComment: {
          gentle_family: '每天 3 分鐘的小習慣，能讓房間一直維持舒服的樣子，很棒！',
          teen_growth: '3 分鐘真的不難，乾淨的書桌也讓我比較不想拖延。',
          teacher_record: '微習慣設計具高度可行性，同意執行追蹤。'
        }
      },
      {
        docs: [
          { docType: '每週家務互助表', docNumber: 'RULE-CHR-03', docName: '每週輪值家務明列於冰箱白板，完成自己打勾，段考週可申請與家人互換班次', owner: '全體家庭成員' }
        ],
        qaComment: {
          gentle_family: '分工透明又有彈性，這才是互相體諒的家人團隊！',
          teen_growth: '段考週可以提前換班很合理，平常週我會確實完成自己的份。',
          teacher_record: '家務分工兼顧課業彈性，有助長期穩定執行。'
        }
      }
    ]
  },

  'safety_health': {
    id: 'safety_health',
    label: '交通安全與健康習慣',
    keywords: /(安全帽|腳踏車|單車|電動自行車|微電車|機車|闖紅燈|闖黃燈|搶快|過馬路|低頭看手機|擦撞|摔車|導護|走廊奔跑|護目鏡|實驗室|手搖飲|不吃正餐|抽菸|電子煙|受傷|發燒|淋雨|雨衣)/g,
    title: (actor) => `${actor}通學交通安全與健康防護事件`,
    defaultItem: '安全防護裝備與健康常規',
    defaultWhen: '上下學通勤／日常活動時段',
    defaultWhere: '通學馬路路口／校園／戶外場所',
    whyRule: {
      gentle_family: '未遵守「配戴安全防護裝備、遵守交通號誌、不搶快不冒險，保護自身生命健康」的最高安全紅線',
      teen_growth: '因為趕時間或嫌麻煩而省略安全帽／搶黃燈，拿自己的身體安全去賭那短短幾十秒',
      teacher_record: '違反通學交通與校園健康安全守則，產生高度人身意外或健康受損風險'
    },
    howFound: '現場經導護老師、路人或家人目擊攔下勸導，或事發出現身體不適／險象環生才得知',
    impact: '潛藏嚴重交通事故或身體受傷風險，一秒疏忽可能造成無法挽回的傷害，也讓家人極度後怕',
    d2Options: [
      {
        actions: [
          { action: '立即停止危險行為並全面檢查身體是否有擦挫傷或不適，確認人員平安無事', owner: '當事人／師長或家長', status: '已完成', result: '確認無外傷與立即危險' },
          { action: '立即清點並補齊安全防護裝備（如安全帽、車燈、雨具），放置於玄關出門必拿處', owner: '當事人／家長', status: '已完成', result: '安全裝備就位隨時可用' }
        ],
        verification: '已確認當事人身體平安無恙，並將必備防護裝備歸位於出門動線。'
      },
      {
        actions: [
          { action: '針對導護老師或家人的及時提醒誠懇道謝並認錯，冷靜復盤剛才最驚險的 5 秒鐘', owner: '當事人', status: '已完成', result: '正視風險嚴重性，不再心存僥倖' }
        ],
        verification: '已充分認知潛在危險，並展現配合改善態度。'
      },
      {
        actions: [
          { action: '重新盤點出門時間表，明日立刻提早 10 分鐘出門，消除因趕時間而搶快的誘因', owner: '當事人', status: '進行中', result: '從時間源頭移除冒險動機' }
        ],
        verification: '已調整晨間緩衝時間，準備落實安全通學。'
      }
    ],
    d3Options: [
      {
        chain: [
          { level: 'Why 1', question: '為什麼會沒戴安全帽／搶黃燈或忽略防護？', answer: '出門太趕了怕遲到，覺得戴安全帽會壓壞頭髮或很麻煩，心想「路程很短應該不會那麼剛好出事」。' },
          { level: 'Why 2', question: '為什麼總是出門很趕？', answer: '前一天晚睡或早上拖延，把通勤緩衝時間壓縮到一分鐘都不剩。' },
          { level: 'Why 3', question: '為什麼容易低估路口搶快或未防護的風險？', answer: '過去幾次僥倖沒出事，讓人產生「自己反應夠快」的錯覺，忽略馬路上還有其他車輛的死角。' },
          { level: 'Why 4（核心真因）', question: '最核心的觀念與習慣漏洞是什麼？', answer: '安全紅線不能拿來換取 30 秒的方便；加上早晨時間沒有預留緩衝，導致每次趕時間就優先犧牲安全。' }
        ],
        escaped: [],
        summary: {
          gentle_family: '核心真因在於出門缺乏緩衝時間加上「路程短不會出事」的僥倖心態，把自身安全拿來換取短暫便利。',
          teen_growth: '遲到頂多扣分或補做，但出車禍或受傷是無法重來的；我不能再用趕時間或嫌麻煩當藉口省略安全裝備。',
          teacher_record: '個案因通學時間緊迫與風險意識不足，產生僥倖心理而忽略安全裝備與交通號誌規範。'
        }
      },
      {
        chain: [
          { level: 'Why 1', question: '為什麼明知不安全還是嫌麻煩不配合？', answer: '裝備放太遠不順手，或覺得同學都沒戴自己戴有點尷尬。' },
          { level: 'Why 2（核心真因）', question: '如何化解這個心理與環境阻力？', answer: '挑一頂自己喜歡、透氣好看的安全裝備固定掛在車把或玄關，保護自己是最帥也最負責任的事。' }
        ],
        escaped: [],
        summary: {
          gentle_family: '因裝備取用不便與同儕眼光顧慮而省略防護，透過挑選合意裝備與放於順手位置可有效改善。',
          teen_growth: '選一頂舒服好戴的安全帽掛在車上，保護自己根本沒什麼好尷尬的。',
          teacher_record: '受便利性與同儕印象影響而未確實穿戴防護裝備，宜從裝備配置與觀念引導著手。'
        }
      },
      {
        chain: [
          { level: 'Why 1', question: '為什麼身體已經發出警訊卻還是硬撐或飲食作息亂？', answer: '覺得自己年輕體力好，喝飲料撐一下或淋點雨沒關係。' },
          { level: 'Why 2（核心真因）', question: '長期的健康管理盲點在哪裡？', answer: '缺乏把身體當成重要資產照顧的意識，等到發燒生病才發現更耽誤課業與玩樂。' }
        ],
        escaped: [],
        summary: {
          gentle_family: '輕忽日常防護與均衡作息對健康的累積影響，直到生病才付出更大代價。',
          teen_growth: '生病發燒超難受又耽誤所有事，平常花 1 分鐘做好防護划算太多了。',
          teacher_record: '個案健康自我照顧意識待加強，需建立日常預防性健康習慣。'
        }
      }
    ],
    d4Options: [
      {
        actions: [
          { action: '建立「提早 10 分鐘出門緩衝制」，並明確共識：「寧可遲到 2 分鐘，絕不搶快闖黃紅燈」', category: '安全優先原則', owner: '當事人／家長', status: '進行中', verification: '連續 2 週通學從容不趕路、零違規' },
          { action: '安全帽／雨具固定放置於玄關車鑰匙旁（或鎖在車架上），做到「不戴裝備不啟動車輛」', category: '環境防呆配置', owner: '當事人', status: '已完成', verification: '出門裝備穿戴率 100%' },
          { action: '過馬路與騎車全程收起手機與降噪耳機，保持對周遭車流與轉彎車死角的警覺', category: '防禦交通習慣', owner: '當事人', status: '進行中', verification: '養成路口減速停看聽習慣' }
        ],
        before: '常因趕時間省去安全裝備、路口搶快，讓自己身處高度意外風險',
        after: '提早 10 分鐘從容出門，安全裝備穿戴率 100% 且確實遵守號誌零搶快',
        conclusion: '安全是所有成長與自由的底線，絕不妥協也不心存僥倖。'
      },
      {
        actions: [
          { action: '與家長共同挑選合頭型、透氣且外觀滿意的安全防護裝備，提高主動配戴意願', category: '裝備升級優化', owner: '當事人／家長', status: '規劃中', verification: '完成合適裝備更換並每日配戴' },
          { action: '每週檢查一次車輛煞車、胎壓與夜間前後燈光是否正常', category: '載具安全檢核', owner: '當事人', status: '進行中', verification: '車輛保持最佳安全狀態' }
        ],
        before: '裝備不合身或不好看導致排斥配戴',
        after: '裝備舒適順手，出門自然戴上不覺麻煩',
        conclusion: '降低使用阻力讓安全習慣自然落地。'
      },
      {
        actions: [
          { action: '建立「出門前看天氣與備妥水壺正餐」30 秒習慣，減少手搖飲替代正餐與淋雨受寒機率', category: '健康生活常規', owner: '當事人', status: '進行中', verification: '連續 2 週規律飲食與依天氣備妥衣物' }
        ],
        before: '忽略天氣與正常飲食，頻繁感冒或精神不振',
        after: '自主照顧身體，體力與專注力穩定維持',
        conclusion: '把照顧自己變成成熟的日常習慣。'
      }
    ],
    d5Options: [
      {
        docs: [
          { docType: '生命安全紅線公約', docNumber: 'RULE-SAF-01', docName: '「安全永遠大於趕時間」：騎車必戴安全帽、路口不搶黃紅燈、移動不滑手機；寧可遲到報備，絕不冒險搶快', owner: '當事人與家長' }
        ],
        qaComment: {
          gentle_family: '平安回家永遠是全家最重要的事，就算真的快遲到也千萬別搶快，我們完全支持你把安全擺第一。',
          teen_growth: '命只有一條不能重來，我會提早 10 分鐘出門並確實戴好安全帽、遵守號誌。',
          teacher_record: '已完成交通安全紅線公約宣導與裝備防呆配置，建議導護與家長共同關注後續落實。'
        }
      },
      {
        docs: [
          { docType: '出門安全檢核表', docNumber: 'CHK-SAF-02', docName: '出門玄關三確認：1. 安全帽／護具戴妥 2. 天氣雨具確認 3. 提早 10 分鐘從容出發', owner: '當事人' }
        ],
        qaComment: {
          gentle_family: '玄關前花 10 秒確認，換來一整天平平安安，非常值得！',
          teen_growth: '把裝備放玄關出門順手拿，很快就能變成反射動作。',
          teacher_record: '出門檢核步驟簡明易執行。'
        }
      },
      {
        docs: [
          { docType: '健康自律約定', docNumber: 'RULE-SAF-03', docName: '三餐定時均衡、每週手搖飲限量，天候不佳確實做好防雨保暖', owner: '當事人主導' }
        ],
        qaComment: {
          gentle_family: '懂得愛惜自己身體，就是邁向獨立成年最重要的能力。',
          teen_growth: '把身體顧好才有力氣做想做的事，我會好好落實。',
          teacher_record: '已建立日常健康自我照顧共識。'
        }
      }
    ]
  }
};

// ==========================================================================
// 3. 狀態模型與正規化
// ==========================================================================
let reportData = getBlankReportData();
let activeTone = 'gentle_family';
let activePrimaryDomainId = '3c_sleep';
let activeSecondaryDomainId = null;
let variantIndices = { d2: 0, d3: 0, d4: 0, d5: 0 };
let inlineOpenSteps = new Set();
let lastUpdatedStep = '';
let isAutoDemoRunning = false;

function getBlankReportData() {
  const today = getTodayStr();
  const suffix = Math.floor(Math.random() * 900 + 100);
  return {
    reportId: `5D-TEEN-${today.replace(/-/g, '')}-${suffix}`,
    rawInput: '',
    tone: 'gentle_family',
    primaryDomain: '',
    secondaryDomain: '',
    title: '',
    partName: '',
    severity: '重大影響（違反約定、作息失衡或信任受損）',
    owner: '',
    approver: '當事人與家長／師長共同見證',
    dateCreated: today,
    targetCloseDate: getDefaultTargetDate(today, 7),
    sourceMap: {},
    d1: {
      problemDesc: '',
      who: '',
      when: '',
      where: '',
      what: '',
      why: '',
      how: '',
      impactScope: ''
    },
    d2: {
      containmentActions: [],
      containmentVerification: ''
    },
    d3: {
      whyMadeChain: [],
      whyEscapedChain: [],
      rootCauseSummary: ''
    },
    d4: {
      correctiveActions: [],
      beforeMetric: '',
      afterMetric: '',
      validationConclusion: ''
    },
    d5: {
      standardDocs: [],
      horizontalDeployment: [],
      signOff: {
        qaComment: '',
        qaStatus: '觀察改善中',
        signDate: today
      }
    }
  };
}

function normalizeReportData(raw) {
  const blank = getBlankReportData();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return blank;
  const toStr = (v, fb = '') => (v !== null && v !== undefined && typeof v !== 'object') ? String(v) : fb;
  const today = getTodayStr();

  const out = {
    reportId: toStr(raw.reportId, blank.reportId),
    rawInput: toStr(raw.rawInput),
    tone: TONE_LABELS[raw.tone] ? raw.tone : 'gentle_family',
    primaryDomain: toStr(raw.primaryDomain),
    secondaryDomain: toStr(raw.secondaryDomain),
    title: toStr(raw.title),
    partName: toStr(raw.partName),
    severity: toStr(raw.severity, blank.severity),
    owner: toStr(raw.owner),
    approver: toStr(raw.approver, blank.approver),
    dateCreated: toStr(raw.dateCreated, today),
    targetCloseDate: toStr(raw.targetCloseDate, getDefaultTargetDate(toStr(raw.dateCreated, today), 7)),
    sourceMap: (raw.sourceMap && typeof raw.sourceMap === 'object' && !Array.isArray(raw.sourceMap)) ? { ...raw.sourceMap } : {},
    d1: {},
    d2: {},
    d3: {},
    d4: {},
    d5: {}
  };

  const d1 = (raw.d1 && typeof raw.d1 === 'object' && !Array.isArray(raw.d1)) ? raw.d1 : {};
  ['problemDesc', 'who', 'when', 'where', 'what', 'why', 'how', 'impactScope'].forEach(k => {
    out.d1[k] = toStr(d1[k]);
  });

  const d2 = (raw.d2 && typeof raw.d2 === 'object' && !Array.isArray(raw.d2)) ? raw.d2 : {};
  out.d2.containmentVerification = toStr(d2.containmentVerification);
  out.d2.containmentActions = Array.isArray(d2.containmentActions)
    ? d2.containmentActions.filter(a => a && typeof a === 'object').map(a => ({
        action: toStr(a.action),
        owner: toStr(a.owner),
        dueDate: toStr(a.dueDate, out.dateCreated),
        status: toStr(a.status, '進行中'),
        result: toStr(a.result)
      }))
    : [];

  const d3 = (raw.d3 && typeof raw.d3 === 'object' && !Array.isArray(raw.d3)) ? raw.d3 : {};
  out.d3.rootCauseSummary = toStr(d3.rootCauseSummary);
  out.d3.whyMadeChain = Array.isArray(d3.whyMadeChain)
    ? d3.whyMadeChain.filter(w => w && typeof w === 'object').map((w, i) => ({
        level: toStr(w.level, `Why ${i + 1}`),
        question: toStr(w.question),
        answer: toStr(w.answer)
      }))
    : [];
  out.d3.whyEscapedChain = Array.isArray(d3.whyEscapedChain)
    ? d3.whyEscapedChain.filter(w => w && typeof w === 'object').map((w, i) => ({
        level: toStr(w.level, `環境漏洞 ${i + 1}`),
        question: toStr(w.question),
        answer: toStr(w.answer)
      }))
    : [];

  const d4 = (raw.d4 && typeof raw.d4 === 'object' && !Array.isArray(raw.d4)) ? raw.d4 : {};
  out.d4.beforeMetric = toStr(d4.beforeMetric);
  out.d4.afterMetric = toStr(d4.afterMetric);
  out.d4.validationConclusion = toStr(d4.validationConclusion);
  out.d4.correctiveActions = Array.isArray(d4.correctiveActions)
    ? d4.correctiveActions.filter(c => c && typeof c === 'object').map(c => ({
        action: toStr(c.action),
        category: toStr(c.category, '習慣調整'),
        owner: toStr(c.owner),
        dueDate: toStr(c.dueDate, out.targetCloseDate),
        status: toStr(c.status, '進行中'),
        verification: toStr(c.verification)
      }))
    : [];

  const d5 = (raw.d5 && typeof raw.d5 === 'object' && !Array.isArray(raw.d5)) ? raw.d5 : {};
  out.d5.standardDocs = Array.isArray(d5.standardDocs)
    ? d5.standardDocs.filter(d => d && typeof d === 'object').map(d => ({
        docType: toStr(d.docType, '家庭生活公約'),
        docNumber: toStr(d.docNumber),
        docName: toStr(d.docName),
        revDate: toStr(d.revDate, out.dateCreated),
        owner: toStr(d.owner)
      }))
    : [];
  out.d5.horizontalDeployment = Array.isArray(d5.horizontalDeployment)
    ? d5.horizontalDeployment.filter(h => h && typeof h === 'object').map(h => ({
        target: toStr(h.target),
        action: toStr(h.action),
        dueDate: toStr(h.dueDate, out.targetCloseDate),
        owner: toStr(h.owner)
      }))
    : [];
  const signOff = (d5.signOff && typeof d5.signOff === 'object' && !Array.isArray(d5.signOff)) ? d5.signOff : {};
  out.d5.signOff = {
    qaComment: toStr(signOff.qaComment),
    qaStatus: toStr(signOff.qaStatus, '觀察改善中'),
    signDate: toStr(signOff.signDate, out.dateCreated)
  };

  return out;
}

function saveDraft() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(reportData));
  } catch (e) {
    // 忽略儲存容量異常
  }
}

// ==========================================================================
// 4. 離線語意自動補完引擎（事實萃取 + 複合情境融合 + 全框架生成）
// ==========================================================================
function extractFactsFromPlainText(text) {
  const facts = {
    actor: '',
    affected: '',
    whoText: '',
    item: '',
    when: '',
    where: '',
    why: '',
    how: '',
    impact: '',
    explicitD2: '',
    explicitD3: '',
    explicitD4: '',
    explicitD5: ''
  };

  // (A) 人物與稱謂
  const matchedActors = [];
  const knownNames = [
    '保健室阿姨', '輔導老師', '安親班老師', '補習班老師', '導護老師', '任課老師', '科任老師',
    '班導師', '副班長', '體育股長', '風紀股長', '衛生股長', '班長', '組長',
    '國一', '國二', '國三', '高一', '高二', '高三',
    '小宇', '小傑', '小華', '小明', '小強', '小美', '小凱', '小芳', '阿凱', '阿明', '阿豪', '阿哲', '大毛',
    '表哥', '表姊', '表姐', '表弟', '表妹', '堂哥', '堂姊', '堂弟', '堂妹',
    '哥哥', '姊姊', '姐姐', '弟弟', '妹妹', '兒子', '女兒', '自己', '我',
    '媽媽', '爸爸', '爸媽', '父母', '母親', '父親', '阿公', '阿嬤', '外公', '外婆', '爺爺', '奶奶',
    '導師', '老師', '教練', '教官', '主任', '護理師', '家長', '家人', '同學', '朋友', '室友', '隊友'
  ];
  knownNames.sort((a, b) => b.length - a.length);
  for (const name of knownNames) {
    if (name === '我' || name === '自己') {
      if (text.startsWith('我') || /[，。、\s]我/.test(text)) {
        const pos = text.indexOf('我');
        if (!matchedActors.some(e => e.name === '我')) matchedActors.push({ name: '我', pos });
      }
      continue;
    }
    const pos = text.indexOf(name);
    if (pos !== -1) {
      if (['國一', '國二', '國三', '高一', '高二', '高三'].includes(name)) continue;
      if (!matchedActors.some(e => e.name.includes(name) || name.includes(e.name))) {
        matchedActors.push({ name, pos });
      }
    }
  }
  const nickBlacklist = new Set([
    '小心', '小時', '小考', '小組', '小學', '小聲', '小事', '小氣', '小說', '小題', '小步', '小額', '小狗', '小貓', '阿姨', '阿伯'
  ]);
  const nickRe = /(?:小|阿)[\u4e00-\u9fa5]/g;
  let m;
  while ((m = nickRe.exec(text)) !== null) {
    if (!nickBlacklist.has(m[0]) && !matchedActors.some(e => e.name.includes(m[0]) || m[0].includes(e.name))) {
      matchedActors.push({ name: m[0], pos: m.index });
    }
  }
  matchedActors.sort((a, b) => a.pos - b.pos);
  const specificElders = new Set(['媽媽', '爸爸', '爸媽', '父母', '母親', '父親', '阿公', '阿嬤']);
  const hasSpecificElder = matchedActors.some(x => specificElders.has(x.name));
  const filtered = matchedActors
    .map(x => x.name)
    .filter((n, i) => !(i > 0 && hasSpecificElder && (n === '家長' || n === '家人')));

  if (filtered.length > 0) {
    facts.actor = filtered[0];
    facts.affected = filtered.slice(1).join('、');
    facts.whoText = `當事人：${facts.actor}${facts.affected ? `；關係人／受影響對象：${facts.affected}` : ''}`;
  }

  // (B) 物品 / 關鍵事項
  const itemRe = /(藍牙耳機|無線耳機|耳機|充電盒|電動自行車|微電車|腳踏車|單車|機車|安全帽|手機遊戲點數卡|遊戲點數卡|點數卡|手機|平板|筆電|電腦|Switch|PS5|手遊|短影音|遙控器|電視|段考考卷|數學考卷|考卷|成績單|數學習作|習作|作業|分組報告|報告|聯絡簿|通知單|LINE\s*群組|班級群組|群組|零用錢|壓歲錢|餐費|早餐錢|午餐錢|生活費|班費|[0-9一二兩三四五六七八九十百千萬]+元|信用卡|日記|化妝品|球鞋|玩偶|彩色筆|碗盤|垃圾|廚餘|書桌|雨衣|雨傘)/;
  const itemM = text.match(itemRe);
  if (itemM) facts.item = itemM[0];

  // (C) 時間
  const nightM = text.match(/(?:晚上|傍晚|凌晨|清晨|半夜)\s*[0-9一二兩三四五六七八九十]+(?:\s*點(?:半|[0-9]+分)?|\s*:\s*[0-9]+)/);
  if ((text.includes('昨晚') || text.includes('昨天晚上') || text.includes('昨天')) && nightM) {
    facts.when = `昨天夜間至${nightM[0]}` + (text.includes('今天早上') ? '、今天早上' : '');
  } else if ((text.includes('放學') || text.includes('下課') || text.includes('補習')) && nightM) {
    facts.when = `${text.includes('昨晚') ? '昨晚' : (text.includes('今天') ? '今天' : '')}課後至${nightM[0]}`;
  } else {
    const tM = text.match(/((?:上週|這週|上禮拜|這禮拜|這個月|本月|昨天|昨晚|昨日|今天|今早|前天|最近|連續[一二三四五六七兩0-9]+天|平日|週末|這次段考|段考期間)\s*(?:早上|上午|中午|下午|傍晚|晚上|深夜|凌晨|清晨|睡前|放學後|下課後|補習班下課後)?\s*(?:[0-9一二兩三四五六七八九十]+點(?:半|[0-9]+分)?)?)/);
    if (tM && tM[0].trim()) facts.when = tM[0].trim();
  }

  // (D) 地點（優先「在 + 地點」並支援雙場域）
  const placeRe = /(班級\s*LINE\s*群組|班級群組|群組裡|群組|補習班|西門町|學校教室|教室|學校|操場|走廊|實驗室|保健室|超商|便利商店|網咖|KTV|商圈|夜市|公園|同學家|公車站|馬路路口|路口|馬路|路上|客廳|房間|臥室|書房|書桌|廚房|水槽|玄關|家裡|家中|網路)/g;
  const places = [];
  let pm;
  while ((pm = placeRe.exec(text)) !== null) {
    const cleanP = pm[0].replace(/裡$/, '');
    const isAt = pm.index > 0 && text[pm.index - 1] === '在';
    if (!places.some(p => p.name.includes(cleanP) || cleanP.includes(p.name))) {
      places.push({ name: cleanP, isAt, pos: pm.index });
    }
  }
  if (places.length > 0) {
    places.sort((a, b) => (b.isAt ? 1 : 0) - (a.isAt ? 1 : 0) || a.pos - b.pos);
    facts.where = places.slice(0, 2).map(p => p.name).join('／');
  }

  // (E) 影響 / 發現 / 明確因果與對策子句
  const impM = text.match(/(?:結果|造成|導致|害|讓(?:爸爸媽媽|爸媽|媽媽|爸爸|老師|全班|對方|家人|姊姊|哥哥|弟弟|妹妹))[^，。；\n]+/);
  if (impM) facts.impact = impM[0].trim();

  const howM = text.match(/((?:直到|被)[^，。；\n]*(?:發現|通知|攔下|看到|抓到|勸導|曝光|叫不醒)[^，。；\n]*|[^，。；\n]*(?:打電話通知|當場攔下|回家發現|整理發票|才發現|叫不醒)[^，。；\n]*)/);
  if (howM) facts.how = howM[0].trim();

  const ruleM = text.match(/(?:違反|沒有遵守|沒遵守)[^，。；\n]+/);
  if (ruleM) facts.why = ruleM[0].trim();

  const d2M = text.match(/(?:當下|立刻|馬上|第一時間|事後先)[：:為是]?([^，。；\n]+)/);
  if (d2M) facts.explicitD2 = d2M[1].trim();

  const d3M = text.match(/(?:因為|真正原因是|原因是|由於)[：:為是]?([^，。；\n]+)/);
  if (d3M) facts.explicitD3 = d3M[1].trim();

  const d4M = text.match(/(?:以後要|以後會|願意|決定改|打算|改善方式)[：:為是]?([^，。；\n]+)/);
  if (d4M) facts.explicitD4 = d4M[1].trim();

  const d5M = text.match(/(?:約定|生活公約|家規|講好)[：:為是]?([^，。；\n]+)/);
  if (d5M) facts.explicitD5 = d5M[1].trim();

  return facts;
}

function detectTeenDomains(text) {
  const scores = [];
  Object.values(TEEN_DOMAIN_KB).forEach(dom => {
    const matches = text.match(dom.keywords);
    const count = matches ? matches.length : 0;
    if (count > 0) {
      scores.push({ id: dom.id, count });
    }
  });
  scores.sort((a, b) => b.count - a.count);
  const primary = scores[0] ? scores[0].id : 'emotion_comm';
  const secondary = (scores[1] && scores[1].count >= 1) ? scores[1].id : null;
  return { primary, secondary };
}

function pickToneText(objOrStr, tone) {
  if (typeof objOrStr === 'string') return objOrStr;
  if (!objOrStr || typeof objOrStr !== 'object') return '';
  return objOrStr[tone] || objOrStr.gentle_family || '';
}

function autoEnrichTo5D(rawText, tone = activeTone) {
  const cleanText = String(rawText || '').trim();
  if (!cleanText) return null;

  const facts = extractFactsFromPlainText(cleanText);
  const { primary, secondary } = detectTeenDomains(cleanText);
  activePrimaryDomainId = primary;
  activeSecondaryDomainId = secondary;
  variantIndices = { d2: 0, d3: 0, d4: 0, d5: 0 };

  const dom1 = TEEN_DOMAIN_KB[primary];
  const dom2 = secondary ? TEEN_DOMAIN_KB[secondary] : null;
  const actor = facts.actor || (tone === 'teen_growth' ? '我' : '當事同學');
  const today = getTodayStr();
  const targetDue = getDefaultTargetDate(today, 7);

  const data = getBlankReportData();
  data.rawInput = cleanText;
  data.tone = tone;
  data.primaryDomain = primary;
  data.secondaryDomain = secondary || '';
  data.dateCreated = today;
  data.targetCloseDate = targetDue;
  data.owner = tone === 'teen_growth' ? actor : (tone === 'teacher_record' ? '導師／輔導老師' : '家長與當事人共同記錄');

  // 標題（複合領域自動整合）
  data.title = dom2
    ? `${actor}${dom1.label}與${dom2.label}複合事件分析`
    : dom1.title(actor);

  // 涉及物品
  if (facts.item) {
    data.partName = facts.item;
    data.sourceMap.partName = 'fact';
  } else {
    data.partName = dom1.defaultItem;
    data.sourceMap.partName = 'inferred';
  }

  // 嚴重程度推估
  if (/(擦撞|車禍|受傷|摔車|打架|霸凌|報警|離家)/.test(cleanText)) {
    data.severity = '極重大事件（人身安全、重大損壞）';
  } else if (/(發脾氣|忘記|口角|髒亂)/.test(cleanText) && !/(遲到|課金|藏|甩門|摔裂|晚歸)/.test(cleanText)) {
    data.severity = '一般提醒（溝通摩擦、習慣疏忽）';
  } else {
    data.severity = '重大影響（違反約定、作息失衡或信任受損）';
  }

  // --- D1 語意萃取與補完 ---
  data.d1.problemDesc = cleanText;
  data.d1.what = cleanText;
  data.sourceMap['d1.problemDesc'] = 'fact';

  if (facts.whoText) {
    data.d1.who = facts.whoText;
    data.sourceMap['d1.who'] = 'fact';
  } else {
    data.d1.who = `當事人：${actor}；受影響對象：家庭成員／班級師生`;
    data.sourceMap['d1.who'] = 'inferred';
  }

  if (facts.when) {
    data.d1.when = facts.when;
    data.sourceMap['d1.when'] = 'fact';
  } else {
    data.d1.when = dom1.defaultWhen;
    data.sourceMap['d1.when'] = 'inferred';
  }

  if (facts.where) {
    data.d1.where = facts.where;
    data.sourceMap['d1.where'] = 'fact';
  } else {
    data.d1.where = dom1.defaultWhere;
    data.sourceMap['d1.where'] = 'inferred';
  }

  if (facts.why) {
    data.d1.why = facts.why;
    data.sourceMap['d1.why'] = 'fact';
  } else {
    const baseRule = pickToneText(dom1.whyRule, tone);
    data.d1.why = dom2 ? `${baseRule}；同時涉及「${dom2.label}」互動界限` : baseRule;
    data.sourceMap['d1.why'] = 'inferred';
  }

  if (facts.how) {
    data.d1.how = facts.how;
    data.sourceMap['d1.how'] = 'fact';
  } else {
    data.d1.how = dom1.howFound;
    data.sourceMap['d1.how'] = 'inferred';
  }

  if (facts.impact) {
    data.d1.impactScope = facts.impact;
    data.sourceMap['d1.impactScope'] = 'fact';
  } else {
    data.d1.impactScope = dom2 ? `${dom1.impact}，並進一步引發${dom2.label}緊張` : dom1.impact;
    data.sourceMap['d1.impactScope'] = 'inferred';
  }

  // --- D2 / D3 / D4 / D5 依領域與語氣自動補完 ---
  fillStepFromDomain(data, 'd2', dom1, dom2, tone, 0, facts);
  fillStepFromDomain(data, 'd3', dom1, dom2, tone, 0, facts);
  fillStepFromDomain(data, 'd4', dom1, dom2, tone, 0, facts);
  fillStepFromDomain(data, 'd5', dom1, dom2, tone, 0, facts);

  return data;
}

function fillStepFromDomain(data, step, dom1, dom2, tone, variantIdx, facts = {}) {
  const today = data.dateCreated || getTodayStr();
  const due = data.targetCloseDate || getDefaultTargetDate(today, 7);

  if (step === 'd2') {
    const opt = dom1.d2Options[variantIdx % dom1.d2Options.length];
    const actions = opt.actions.map(a => ({
      action: a.action,
      owner: a.owner,
      dueDate: today,
      status: a.status,
      result: a.result
    }));
    if (dom2 && dom2.d2Options[0] && dom2.d2Options[0].actions[0]) {
      const extra = dom2.d2Options[0].actions[0];
      actions.push({
        action: `【${dom2.label}配套】${extra.action}`,
        owner: extra.owner,
        dueDate: today,
        status: extra.status,
        result: extra.result
      });
    }
    if (facts.explicitD2) {
      actions.unshift({
        action: facts.explicitD2,
        owner: data.owner || '當事人／家長',
        dueDate: today,
        status: '已完成',
        result: '依當事人原文陳述已執行'
      });
      data.sourceMap['d2.actions'] = 'fact';
    } else {
      data.sourceMap['d2.actions'] = 'inferred';
    }
    data.d2.containmentActions = actions;
    data.d2.containmentVerification = opt.verification;
    data.sourceMap['d2.verify'] = 'inferred';
  }

  if (step === 'd3') {
    const opt = dom1.d3Options[variantIdx % dom1.d3Options.length];
    const chain = opt.chain.map(w => ({ ...w }));
    if (facts.explicitD3) {
      chain.unshift({
        level: '原文線索',
        question: '事件原文提及的直接觸發原因為何？',
        answer: facts.explicitD3
      });
      data.sourceMap['d3.why'] = 'fact';
    } else {
      data.sourceMap['d3.why'] = 'inferred';
    }
    data.d3.whyMadeChain = chain;
    data.d3.whyEscapedChain = (opt.escaped || []).map(w => ({ ...w }));
    const baseSummary = pickToneText(opt.summary, tone);
    const secSummary = dom2 ? `（併同關聯：${pickToneText(dom2.d3Options[0].summary, tone)}）` : '';
    data.d3.rootCauseSummary = facts.explicitD3
      ? `除原文所述「${facts.explicitD3}」外，進一步歸納：${baseSummary}${secSummary}`
      : `${baseSummary}${secSummary}`;
    data.sourceMap['d3.summary'] = facts.explicitD3 ? 'confirmed' : 'inferred';
  }

  if (step === 'd4') {
    const opt = dom1.d4Options[variantIdx % dom1.d4Options.length];
    const actions = opt.actions.map(c => ({
      action: c.action,
      category: c.category,
      owner: c.owner,
      dueDate: due,
      status: c.status,
      verification: c.verification
    }));
    if (dom2 && dom2.d4Options[0] && dom2.d4Options[0].actions[0]) {
      const extra = dom2.d4Options[0].actions[0];
      actions.push({
        action: `【${dom2.label}同步改善】${extra.action}`,
        category: extra.category,
        owner: extra.owner,
        dueDate: due,
        status: extra.status,
        verification: extra.verification
      });
    }
    if (facts.explicitD4) {
      actions.unshift({
        action: facts.explicitD4,
        category: '當事人主動提出',
        owner: '當事人',
        dueDate: due,
        status: '進行中',
        verification: '依約持續追蹤落實'
      });
      data.sourceMap['d4.actions'] = 'fact';
    } else {
      data.sourceMap['d4.actions'] = 'inferred';
    }
    data.d4.correctiveActions = actions;
    data.d4.beforeMetric = opt.before;
    data.d4.afterMetric = opt.after;
    data.d4.validationConclusion = opt.conclusion;
    data.sourceMap['d4.metrics'] = 'inferred';
  }

  if (step === 'd5') {
    const opt = dom1.d5Options[variantIdx % dom1.d5Options.length];
    const docs = opt.docs.map(d => ({
      docType: d.docType,
      docNumber: d.docNumber,
      docName: d.docName,
      revDate: today,
      owner: d.owner
    }));
    if (dom2 && dom2.d5Options[0] && dom2.d5Options[0].docs[0]) {
      const extra = dom2.d5Options[0].docs[0];
      docs.push({
        docType: extra.docType,
        docNumber: extra.docNumber,
        docName: extra.docName,
        revDate: today,
        owner: extra.owner
      });
    }
    if (facts.explicitD5) {
      docs.unshift({
        docType: '雙方口頭共識',
        docNumber: 'RULE-CUSTOM-01',
        docName: facts.explicitD5,
        revDate: today,
        owner: '雙方共同'
      });
      data.sourceMap['d5.docs'] = 'fact';
    } else {
      data.sourceMap['d5.docs'] = 'inferred';
    }
    data.d5.standardDocs = docs;
    data.d5.signOff.qaComment = pickToneText(opt.qaComment, tone);
    data.d5.signOff.signDate = today;
    data.sourceMap['d5.comment'] = 'inferred';
  }
}

// ==========================================================================
// 5. 語氣即時切換（保留已確認與原文事實，重寫語意補完區）
// ==========================================================================
function switchTone(newTone) {
  if (!TONE_LABELS[newTone]) return;
  activeTone = newTone;
  reportData.tone = newTone;

  if (typeof document !== 'undefined') {
    document.querySelectorAll('.seg-btn').forEach(btn => {
      const isAct = btn.dataset.tone === newTone;
      btn.classList.toggle('active', isAct);
      btn.setAttribute('aria-checked', String(isAct));
    });
  }

  if (!reportData.title && !reportData.d1.problemDesc) return;

  const dom1 = TEEN_DOMAIN_KB[reportData.primaryDomain || activePrimaryDomainId] || TEEN_DOMAIN_KB['3c_sleep'];
  const dom2 = (reportData.secondaryDomain && TEEN_DOMAIN_KB[reportData.secondaryDomain]) ? TEEN_DOMAIN_KB[reportData.secondaryDomain] : null;

  if (reportData.sourceMap['d1.why'] === 'inferred') {
    const baseRule = pickToneText(dom1.whyRule, newTone);
    reportData.d1.why = dom2 ? `${baseRule}；同時涉及「${dom2.label}」互動界限` : baseRule;
  }
  if (reportData.sourceMap['d3.summary'] === 'inferred') {
    const opt = dom1.d3Options[variantIndices.d3 % dom1.d3Options.length];
    const baseS = pickToneText(opt.summary, newTone);
    const secS = dom2 ? `（併同關聯：${pickToneText(dom2.d3Options[0].summary, newTone)}）` : '';
    reportData.d3.rootCauseSummary = `${baseS}${secS}`;
  }
  if (reportData.sourceMap['d5.comment'] === 'inferred') {
    const opt = dom1.d5Options[variantIndices.d5 % dom1.d5Options.length];
    reportData.d5.signOff.qaComment = pickToneText(opt.qaComment, newTone);
  }

  reportData.owner = newTone === 'teen_growth'
    ? (reportData.d1.who.replace(/^當事人[：:]/, '').split('；')[0] || '本人')
    : (newTone === 'teacher_record' ? '導師／輔導老師' : '家長與當事人共同記錄');

  refreshAllViews();
  showToast(`已切換為「${TONE_LABELS[newTone]}」（保留你已確認與修改過的內容）`, 'success');
}

// ==========================================================================
// 6. 口語追加微調引擎（「再補一句話，自動融入對應 5D 欄位」）
// ==========================================================================
function applySpokenRefinement(sentence) {
  const s = String(sentence || '').trim();
  if (!s) return null;

  const today = reportData.dateCreated || getTodayStr();
  const due = reportData.targetCloseDate || getDefaultTargetDate(today, 7);
  const updatedTargets = [];

  if (/(約定|公約|家規|講好|規則|以後平日|以後每晚|每天晚上[0-9一二兩十]+點)/.test(s)) {
    reportData.d5.standardDocs.unshift({
      docType: '共同口語約定',
      docNumber: `RULE-NEW-0${reportData.d5.standardDocs.length + 1}`,
      docName: s,
      revDate: today,
      owner: '雙方共同'
    });
    reportData.sourceMap['d5.docs'] = 'confirmed';
    updatedTargets.push({ step: 'd5', label: 'D5 生活公約' });
  } else if (/(原因|因為|其實是|壓力|害怕|怕被|覺得|心情|想逃避|想放鬆)/.test(s)) {
    reportData.d3.whyMadeChain.unshift({
      level: '補充真因',
      question: '當事人補充的核心心聲或原因為何？',
      answer: s
    });
    reportData.d3.rootCauseSummary = `${s}（結合情境分析：${reportData.d3.rootCauseSummary}）`;
    reportData.sourceMap['d3.why'] = 'confirmed';
    reportData.sourceMap['d3.summary'] = 'confirmed';
    updatedTargets.push({ step: 'd3', label: 'D3 根本原因與 5 Why' });
  } else if (/(補償|負責|倒垃圾|洗碗|陪|還錢|分期|以後會|以後要|答應|願意|改用|提早[0-9]+分鐘)/.test(s)) {
    reportData.d4.correctiveActions.unshift({
      action: s,
      category: '補充改善與補償',
      owner: '當事人',
      dueDate: due,
      status: '進行中',
      verification: '雙方共同檢視落實狀況'
    });
    reportData.sourceMap['d4.actions'] = 'confirmed';
    updatedTargets.push({ step: 'd4', label: 'D4 改善與補償行動' });
  } else if (/(當下|後來有|主動|道歉|說對不起|冷靜|歸還|態度|軟化|先讓|立刻|馬上)/.test(s)) {
    reportData.d2.containmentActions.unshift({
      action: s,
      owner: '當事人／雙方',
      dueDate: today,
      status: '已完成',
      result: '口語補充之現場實際表現'
    });
    reportData.d2.containmentVerification = `${s}；${reportData.d2.containmentVerification}`;
    reportData.sourceMap['d2.actions'] = 'confirmed';
    reportData.sourceMap['d2.verify'] = 'confirmed';
    updatedTargets.push({ step: 'd2', label: 'D2 當下緊急處置' });
  } else if (/(地點|在.+發生|其實是在)/.test(s)) {
    const cleaned = s.replace(/^(地點是|地點在|其實是在|發生在)/, '').trim();
    reportData.d1.where = cleaned || s;
    reportData.sourceMap['d1.where'] = 'confirmed';
    updatedTargets.push({ step: 'd1', label: 'D1 事發地點' });
  } else if (/(時間|其實是昨天|其實是今天|禮拜|晚上|早上|點)/.test(s)) {
    const cleaned = s.replace(/^(時間是|其實是)/, '').trim();
    reportData.d1.when = cleaned || s;
    reportData.sourceMap['d1.when'] = 'confirmed';
    updatedTargets.push({ step: 'd1', label: 'D1 發生時間' });
  } else if (/(造成|影響|害|擔心|難過|生氣)/.test(s)) {
    reportData.d1.impactScope = `${reportData.d1.impactScope ? reportData.d1.impactScope + '；' : ''}${s}`;
    reportData.sourceMap['d1.impactScope'] = 'confirmed';
    updatedTargets.push({ step: 'd1', label: 'D1 影響範圍' });
  } else {
    reportData.d1.problemDesc = `${reportData.d1.problemDesc} ${s}`.trim();
    reportData.sourceMap['d1.problemDesc'] = 'confirmed';
    updatedTargets.push({ step: 'd1', label: 'D1 事件經過補充' });
  }

  lastUpdatedStep = updatedTargets[0].step;
  refreshAllViews();
  return updatedTargets;
}

// ==========================================================================
// 7. 雙軌 AI 支援（共用完整 Schema Prompt + 自動降級）
// ==========================================================================
function build5DPrompt(rawText, tone) {
  const toneDesc = {
    gentle_family: '溫和親子對話版：尊重國高中生自主性，平等對話不說教，聚焦理解與互信。',
    teen_growth: '青春期自律成長版：以國高中生第一人稱「我」撰寫，務實負責、具體可行。',
    teacher_record: '師長輔導紀錄版：客觀中立、結構嚴謹，適合班級導師與輔導老師存檔溝通。'
  }[tone] || '溫和親子對話版';

  const schemaExample = {
    title: '事件簡明標題',
    partName: '涉及物品或核心事項',
    severity: '重大影響（違反約定、作息失衡或信任受損）',
    sourceMap: {
      'd1.who': 'fact 或 inferred',
      'd1.when': 'fact 或 inferred',
      'd1.where': 'fact 或 inferred',
      'd1.why': 'fact 或 inferred',
      'd1.how': 'fact 或 inferred',
      'd1.impactScope': 'fact 或 inferred',
      'd2.actions': 'fact 或 inferred',
      'd3.why': 'fact 或 inferred',
      'd4.actions': 'fact 或 inferred',
      'd5.docs': 'fact 或 inferred'
    },
    d1: { problemDesc: '', who: '', when: '', where: '', what: '', why: '', how: '', impactScope: '' },
    d2: { containmentActions: [{ action: '', owner: '', dueDate: getTodayStr(), status: '已完成', result: '' }], containmentVerification: '' },
    d3: { whyMadeChain: [{ level: 'Why 1', question: '', answer: '' }], whyEscapedChain: [], rootCauseSummary: '' },
    d4: { correctiveActions: [{ action: '', category: '習慣調整', owner: '', dueDate: getDefaultTargetDate(getTodayStr(), 7), status: '進行中', verification: '' }], beforeMetric: '', afterMetric: '', validationConclusion: '' },
    d5: { standardDocs: [{ docType: '家庭生活公約', docNumber: 'RULE-01', docName: '', revDate: getTodayStr(), owner: '雙方共同' }], horizontalDeployment: [], signOff: { qaComment: '', qaStatus: '觀察改善中', signDate: getTodayStr() } }
  };

  return `你是一位專為台灣「國中生與高中生、家長及師長」設計的 5D 青春對話分析師。
請將以下白話生活事件，自動進行「事實萃取＋語意補完」，輸出完整 5D 結構化初稿（繁體中文台灣用語）。
表達語氣要求：${toneDesc}
重要原則：
1. 原文已提及的細節請忠實保留，並在 sourceMap 標記為 "fact"。
2. 原文未提及但 5D 框架需要的步驟（如當下處置、3~4 層 5 Why、具體改善與補償、生活公約），請依國高中生真實生活脈絡合理補完，並在 sourceMap 標記為 "inferred"。
3. 絕不使用幼稚說教語氣，也絕不使用工廠品保術語。

白話情境：
${String(rawText || '').slice(0, 4000)}

請嚴格輸出純 JSON（不得包含 markdown 圍欄），結構如下：
${JSON.stringify(schemaExample, null, 2)}`;
}

async function runGeneration() {
  const rawEl = document.getElementById('raw-input');
  const rawText = rawEl ? rawEl.value.trim() : '';
  if (!rawText) {
    showToast('請先輸入 1～2 句白話事件經過，或點選上方國高中情境範例！', 'warning');
    if (rawEl) rawEl.focus();
    return;
  }

  const provider = document.getElementById('llm-provider')?.value || 'offline';
  const btn = document.getElementById('btn-generate');
  if (btn) { btn.disabled = true; btn.textContent = '語意補完生成中...'; }

  try {
    if (provider === 'gemini') {
      await callGeminiApi(rawText);
    } else if (provider === 'ollama') {
      await callOllamaApi(rawText);
    } else {
      reportData = autoEnrichTo5D(rawText, activeTone);
      lastUpdatedStep = '';
      refreshAllViews();
      showToast('已完成 5D 語意自動補完！可檢視初步完整陳述或用口語微調。', 'success');
    }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '一鍵語意補完完整 5D 初稿'; }
  }
}

async function callGeminiApi(rawText) {
  const apiKey = document.getElementById('llm-api-key')?.value.trim();
  const rawModel = document.getElementById('llm-model-name')?.value.trim() || 'gemini-2.5-flash';
  const modelName = /^[a-zA-Z0-9._-]+$/.test(rawModel) ? rawModel : 'gemini-2.5-flash';

  if (!apiKey) {
    showToast('未輸入 Gemini API Key，已自動切換為本機離線語意補完。', 'warning');
    reportData = autoEnrichTo5D(rawText, activeTone);
    refreshAllViews();
    return;
  }

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeoutId = controller ? setTimeout(() => controller.abort(), 30000) : null;

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      signal: controller ? controller.signal : undefined,
      body: JSON.stringify({
        contents: [{ parts: [{ text: build5DPrompt(rawText, activeTone) }] }],
        generationConfig: { responseMimeType: 'application/json' }
      })
    });
    if (timeoutId) clearTimeout(timeoutId);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const result = await res.json();
    const textOut = result?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const parsed = JSON.parse(textOut);
    parsed.rawInput = rawText;
    parsed.tone = activeTone;
    const det = detectTeenDomains(rawText);
    parsed.primaryDomain = det.primary;
    parsed.secondaryDomain = det.secondary || '';
    reportData = normalizeReportData(parsed);
    refreshAllViews();
    showToast('Gemini AI 已完成深度 5D 語意補完！', 'success');
  } catch (err) {
    if (timeoutId) clearTimeout(timeoutId);
    console.warn('Gemini 連線或解析失敗，降級回本機離線引擎:', err);
    reportData = autoEnrichTo5D(rawText, activeTone);
    refreshAllViews();
    showToast('Gemini 連線失敗或逾時，已無縫改由本機離線引擎完成補完。', 'warning');
  }
}

async function callOllamaApi(rawText) {
  const rawModel = document.getElementById('llm-model-name')?.value.trim() || 'qwen2.5';
  const modelName = /^[a-zA-Z0-9._:-]+$/.test(rawModel) ? rawModel : 'qwen2.5';
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeoutId = controller ? setTimeout(() => controller.abort(), 30000) : null;

  try {
    const res = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller ? controller.signal : undefined,
      body: JSON.stringify({
        model: modelName,
        prompt: build5DPrompt(rawText, activeTone),
        stream: false,
        format: 'json'
      })
    });
    if (timeoutId) clearTimeout(timeoutId);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const result = await res.json();
    const parsed = JSON.parse(result.response || '{}');
    parsed.rawInput = rawText;
    parsed.tone = activeTone;
    const det = detectTeenDomains(rawText);
    parsed.primaryDomain = det.primary;
    parsed.secondaryDomain = det.secondary || '';
    reportData = normalizeReportData(parsed);
    refreshAllViews();
    showToast('本機 Ollama 模型已完成深度 5D 語意補完！', 'success');
  } catch (err) {
    if (timeoutId) clearTimeout(timeoutId);
    console.warn('Ollama 連線失敗，降級回本機離線引擎:', err);
    reportData = autoEnrichTo5D(rawText, activeTone);
    refreshAllViews();
    showToast('本機 Ollama 無法連線，已無縫改由離線引擎完成補完。', 'warning');
  }
}

// ==========================================================================
// 8. 評分與來源統計
// ==========================================================================
function computeAuditScore() {
  let score = 0;
  if (reportData.title && reportData.title.trim().length > 2) score += 5;
  if (reportData.d1.problemDesc && reportData.d1.problemDesc.trim().length > 6) score += 10;
  const d1Fields = ['who', 'when', 'where', 'why', 'how', 'impactScope'];
  const filledD1 = d1Fields.filter(k => reportData.d1[k] && reportData.d1[k].trim().length > 0).length;
  score += Math.round((filledD1 / d1Fields.length) * 20);

  if (reportData.d2.containmentActions.some(a => a.action && a.action.trim())) score += 15;
  if (reportData.d2.containmentVerification && reportData.d2.containmentVerification.trim().length > 2) score += 5;

  if (reportData.d3.whyMadeChain.some(w => (w.answer && w.answer.trim()) || (w.question && w.question.trim()))) score += 8;
  if (reportData.d3.rootCauseSummary && reportData.d3.rootCauseSummary.trim().length > 4) score += 7;

  if (reportData.d4.correctiveActions.some(c => c.action && c.action.trim())) score += 10;
  if ((reportData.d4.afterMetric && reportData.d4.afterMetric.trim()) || (reportData.d4.validationConclusion && reportData.d4.validationConclusion.trim())) score += 5;

  if (reportData.d5.standardDocs.some(d => d.docName && d.docName.trim())) score += 15;
  return score;
}

function getSourceStats() {
  const vals = Object.values(reportData.sourceMap || {});
  return {
    fact: vals.filter(v => v === 'fact').length,
    inferred: vals.filter(v => v === 'inferred').length,
    confirmed: vals.filter(v => v === 'confirmed').length
  };
}

function renderBadge(key) {
  const state = (reportData.sourceMap && reportData.sourceMap[key]) || 'inferred';
  if (state === 'fact') return '<span class="badge badge-fact">原文事實</span>';
  if (state === 'confirmed') return '<span class="badge badge-confirmed">已確認</span>';
  return '<span class="badge badge-inferred">語意補完</span>';
}

// ==========================================================================
// 9. 畫面渲染：初步完整陳述 + 5D 互動卡片 + 細部編輯 + A4 預覽
// ==========================================================================
function hasReportContent() {
  return Boolean((reportData.title && reportData.title.trim()) || (reportData.d1.problemDesc && reportData.d1.problemDesc.trim()));
}

function buildNarrativePlainText() {
  const d2First = reportData.d2.containmentActions.map(a => a.action).filter(Boolean).join('；');
  const d4First = reportData.d4.correctiveActions.map(c => c.action).filter(Boolean).join('；');
  const d5First = reportData.d5.standardDocs.map(d => d.docName).filter(Boolean).join('；');
  return [
    `【${reportData.title || '5D 生活問題分析'}】（${TONE_LABELS[reportData.tone] || '溫和親子對話版'}）`,
    `一、發生經過與影響（D1）：${reportData.d1.problemDesc}（${reportData.d1.who}｜時間：${reportData.d1.when}｜地點：${reportData.d1.where}）。違反約定：${reportData.d1.why}；造成影響：${reportData.d1.impactScope}。`,
    `二、當下緊急處理（D2）：${d2First || '尚無'}。確認結果：${reportData.d2.containmentVerification || '待確認'}`,
    `三、深入原因總結（D3）：${reportData.d3.rootCauseSummary || '尚未總結'}`,
    `四、未來改善與補償（D4）：${d4First || '尚無'}。目標：${reportData.d4.afterMetric || '-'}`,
    `五、共同生活約定（D5）：${d5First || '尚無'}。見證評語：${reportData.d5.signOff.qaComment || '-'}`
  ].join('\n\n');
}

const RIGHT_TAB_ORDER = ['overview', 'd1', 'd2', 'd3', 'd4', 'd5', 'a4'];
let activeRightTab = 'overview';

function buildA4Markup() {
  const hasEscaped = reportData.d3.whyEscapedChain.some(w => w && (w.answer || w.question));
  return `
    <div class="a4-mini">
      <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:10px;border-bottom:2px solid #1b4d5c;padding-bottom:8px;margin-bottom:10px;">
        <div>
          <div style="font-size:16px;font-weight:800;color:#1b4d5c;">5D 青春對話與生活共識分析報告</div>
          <div style="font-size:10.5px;color:#64748b;">5D Youth Dialogue & Mutual Agreement Sheet（${escapeHtml(TONE_LABELS[reportData.tone] || TONE_LABELS.gentle_family)}）</div>
        </div>
        <div style="font-size:10.5px;color:#475569;text-align:right;">
          <div><strong>編號：</strong>${escapeHtml(reportData.reportId)} ｜ <strong>日期：</strong>${escapeHtml(reportData.dateCreated)}</div>
        </div>
      </div>
      <table class="a4-table">
        <tr><th style="width:14%;">事件主題</th><td colspan="3"><strong>${escapeHtml(reportData.title || '（尚未生成）')}</strong></td></tr>
        <tr><th>涉及事項</th><td style="width:36%;">${escapeHtml(reportData.partName || '-')}</td><th style="width:14%;">記錄／見證</th><td style="width:36%;">${escapeHtml(reportData.owner || '-')}</td></tr>
      </table>
      <div class="a4-sec">D1：發生什麼事（5W2H 事實與影響）</div>
      <table class="a4-table">
        <tr><th style="width:14%;">事情經過</th><td colspan="3">${escapeHtml(reportData.d1.problemDesc || '尚未填寫')}</td></tr>
        <tr><th>Who 人物</th><td style="width:36%;">${escapeHtml(reportData.d1.who || '-')}</td><th style="width:14%;">When 時間</th><td style="width:36%;">${escapeHtml(reportData.d1.when || '-')}</td></tr>
        <tr><th>Where 地點</th><td>${escapeHtml(reportData.d1.where || '-')}</td><th>How 察覺</th><td>${escapeHtml(reportData.d1.how || '-')}</td></tr>
        <tr><th>Why 約定</th><td>${escapeHtml(reportData.d1.why || '-')}</td><th>影響範圍</th><td>${escapeHtml(reportData.d1.impactScope || '-')}</td></tr>
      </table>
      <div class="a4-sec">D2：緊急怎麼做（當下應變處置）</div>
      <table class="a4-table">
        <tr><th>具體處置作為</th><th style="width:18%;">負責</th><th style="width:12%;">進度</th></tr>
        ${reportData.d2.containmentActions.map(a => `<tr><td>${escapeHtml(a.action)}</td><td>${escapeHtml(a.owner)}</td><td>${escapeHtml(a.status)}</td></tr>`).join('') || '<tr><td colspan="3">尚無記錄</td></tr>'}
        <tr><th>整體確認</th><td colspan="2">${escapeHtml(reportData.d2.containmentVerification || '-')}</td></tr>
      </table>
      <div class="a4-sec">D3：為什麼會這樣（深入原因 5 Why）</div>
      <table class="a4-table">
        <tr><th style="width:15%;">層級</th><th style="width:35%;">提問</th><th>洞察與原因</th></tr>
        ${reportData.d3.whyMadeChain.map(w => `<tr><td><strong>${escapeHtml(w.level)}</strong></td><td>${escapeHtml(w.question)}</td><td>${escapeHtml(w.answer)}</td></tr>`).join('') || '<tr><td colspan="3">尚無推導</td></tr>'}
        ${hasEscaped ? reportData.d3.whyEscapedChain.map(w => `<tr><td><strong>${escapeHtml(w.level)}</strong></td><td>${escapeHtml(w.question)}</td><td>${escapeHtml(w.answer)}</td></tr>`).join('') : ''}
        <tr><th>真正原因</th><td colspan="2"><strong>${escapeHtml(reportData.d3.rootCauseSummary || '-')}</strong></td></tr>
      </table>
      <div class="a4-sec">D4：以後怎麼改善（具體作法、補償與目標）</div>
      <table class="a4-table">
        <tr><th>改善與補償作法</th><th style="width:15%;">類別</th><th style="width:16%;">負責</th></tr>
        ${reportData.d4.correctiveActions.map(c => `<tr><td>${escapeHtml(c.action)}</td><td>${escapeHtml(c.category)}</td><td>${escapeHtml(c.owner)}</td></tr>`).join('') || '<tr><td colspan="3">尚無行動</td></tr>'}
        <tr><th>前後對比</th><td colspan="2">改善前：${escapeHtml(reportData.d4.beforeMetric || '-')} → <strong>目標：${escapeHtml(reportData.d4.afterMetric || '-')}</strong></td></tr>
      </table>
      <div class="a4-sec">D5：訂立生活約定（共同公約與親筆簽認）</div>
      <table class="a4-table">
        <tr><th style="width:16%;">編號</th><th>生活公約條文</th><th style="width:18%;">提醒人</th></tr>
        ${reportData.d5.standardDocs.map(d => `<tr><td><strong>${escapeHtml(d.docNumber)}</strong></td><td>${escapeHtml(d.docName)}</td><td>${escapeHtml(d.owner)}</td></tr>`).join('') || '<tr><td colspan="3">尚無公約</td></tr>'}
      </table>
      <table class="a4-table" style="margin-bottom:0;">
        <tr><th style="width:16%;">見證評語</th><td colspan="3">${escapeHtml(reportData.d5.signOff.qaComment || '-')}（判定：<strong>${escapeHtml(reportData.d5.signOff.qaStatus)}</strong>｜${escapeHtml(reportData.d5.signOff.signDate)}）</td></tr>
        <tr><th>當事人承諾簽名</th><td style="width:34%;height:36px;color:#94a3b8;font-size:10.5px;vertical-align:bottom;">（請親筆簽名）</td><th style="width:16%;">家長／師長見證簽名</th><td style="width:34%;height:36px;color:#94a3b8;font-size:10.5px;vertical-align:bottom;">（請親筆簽名）</td></tr>
      </table>
    </div>`;
}

function updateTopStatusOnly() {
  saveDraft();
  if (typeof document === 'undefined') return;
  const has = hasReportContent();
  const stats = getSourceStats();
  const scoreEl = document.getElementById('score-num');
  const statsEl = document.getElementById('source-stats');
  if (scoreEl) scoreEl.textContent = `${computeAuditScore()}%`;
  if (statsEl) {
    statsEl.textContent = has
      ? `事實 ${stats.fact}・補完 ${stats.inferred}・已確認 ${stats.confirmed}`
      : '等待輸入';
  }
  const pm = document.getElementById('print-mount');
  if (pm) pm.innerHTML = buildA4Markup();
}

function renderRightCanvas() {
  if (typeof document === 'undefined') return;
  updateTopStatusOnly();

  const domWrap = document.getElementById('domain-badges');
  if (domWrap) {
    const tags = [];
    if (TEEN_DOMAIN_KB[reportData.primaryDomain]) {
      tags.push(`<span class="dom-tag">${escapeHtml(TEEN_DOMAIN_KB[reportData.primaryDomain].label)}</span>`);
    }
    if (TEEN_DOMAIN_KB[reportData.secondaryDomain]) {
      tags.push(`<span class="dom-tag">＋${escapeHtml(TEEN_DOMAIN_KB[reportData.secondaryDomain].label)}</span>`);
    }
    domWrap.innerHTML = tags.join('');
  }

  const canvas = document.getElementById('right-canvas');
  if (!canvas) return;

  if (!hasReportContent()) {
    canvas.innerHTML = `
      <div style="height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:24px;">
        <div style="font-size:15px;font-weight:800;margin-bottom:6px;">在左側輸入 1～2 句白話，右側立即展開 5D 完整初稿</div>
        <p class="footer-tip" style="max-width:420px;">所有步驟都在這個單一畫面內切換微調，免上下滑動網頁。系統清楚區分原文事實與語意補完，完成後直接切換至「A4 簽名報告」列印或匯出 Word／PPT。</p>
      </div>`;
    return;
  }

  if (activeRightTab === 'overview') {
    const d2s = reportData.d2.containmentActions.map(a => a.action).filter(Boolean).slice(0, 2).join('；');
    const d4s = reportData.d4.correctiveActions.map(c => c.action).filter(Boolean).slice(0, 2).join('；');
    const d5s = reportData.d5.standardDocs.map(d => d.docName).filter(Boolean).slice(0, 2).join('；');
    canvas.innerHTML = `
      <div class="overview-list">
        <div class="panel-head" style="padding-bottom:8px;border-bottom:1px solid var(--border-light);">
          <div>
            <div class="footer-tip">初步完整陳述（${escapeHtml(TONE_LABELS[reportData.tone] || TONE_LABELS.gentle_family)}）</div>
            <div style="font-size:15px;font-weight:800;">${escapeHtml(reportData.title)}</div>
          </div>
          <button type="button" class="btn btn-primary btn-xs" data-jump="a4">預覽 A4 簽名單</button>
        </div>
        <div class="ov-card" data-jump="d1">
          <div class="ov-top"><strong>D1 事實與影響</strong>${renderBadge('d1.who')}</div>
          <div>${escapeHtml(reportData.d1.problemDesc)}（${escapeHtml(reportData.d1.who)}｜${escapeHtml(reportData.d1.when)}｜${escapeHtml(reportData.d1.where)}）。影響：${escapeHtml(reportData.d1.impactScope)}。</div>
        </div>
        <div class="ov-card" data-jump="d2">
          <div class="ov-top"><strong>D2 當下緊急處置</strong>${renderBadge('d2.actions')}</div>
          <div>${escapeHtml(d2s)}。<em>${escapeHtml(reportData.d2.containmentVerification)}</em></div>
        </div>
        <div class="ov-card" data-jump="d3">
          <div class="ov-top"><strong>D3 背後真正原因</strong>${renderBadge('d3.summary')}</div>
          <div>${escapeHtml(reportData.d3.rootCauseSummary)}</div>
        </div>
        <div class="ov-card" data-jump="d4">
          <div class="ov-top"><strong>D4 改善與補償作法</strong>${renderBadge('d4.actions')}</div>
          <div>${escapeHtml(d4s)}；目標：<strong>${escapeHtml(reportData.d4.afterMetric)}</strong></div>
        </div>
        <div class="ov-card" data-jump="d5">
          <div class="ov-top"><strong>D5 共同生活公約與見證</strong>${renderBadge('d5.docs')}</div>
          <div>${escapeHtml(d5s)}。<em>（${escapeHtml(reportData.d5.signOff.qaComment)}）</em></div>
        </div>
      </div>`;
  } else if (activeRightTab === 'd1') {
    canvas.innerHTML = `
      <div class="grid-2">
        <div class="field col-span-2">
          <div class="field-top"><label>事件標題</label></div>
          <input class="control" style="font-weight:700;" data-edit="title" value="${escapeHtml(reportData.title)}">
        </div>
        <div class="field">
          <div class="field-top"><label>Who 人物關係</label>${renderBadge('d1.who')}</div>
          <input class="control" data-edit="d1.who" value="${escapeHtml(reportData.d1.who)}">
        </div>
        <div class="field">
          <div class="field-top"><label>When 發生時間</label>${renderBadge('d1.when')}</div>
          <input class="control" data-edit="d1.when" value="${escapeHtml(reportData.d1.when)}">
        </div>
        <div class="field">
          <div class="field-top"><label>Where 發生場所</label>${renderBadge('d1.where')}</div>
          <input class="control" data-edit="d1.where" value="${escapeHtml(reportData.d1.where)}">
        </div>
        <div class="field">
          <div class="field-top"><label>How 察覺過程</label>${renderBadge('d1.how')}</div>
          <input class="control" data-edit="d1.how" value="${escapeHtml(reportData.d1.how)}">
        </div>
        <div class="field col-span-2">
          <div class="field-top"><label>Why 違反的規矩或約定</label>${renderBadge('d1.why')}</div>
          <input class="control" data-edit="d1.why" value="${escapeHtml(reportData.d1.why)}">
        </div>
        <div class="field col-span-2">
          <div class="field-top"><label>對情緒、作息與信任的具體影響</label>${renderBadge('d1.impactScope')}</div>
          <input class="control" data-edit="d1.impactScope" value="${escapeHtml(reportData.d1.impactScope)}">
        </div>
      </div>`;
  } else if (activeRightTab === 'd2') {
    canvas.innerHTML = `
      <div class="panel-head" style="margin-bottom:10px;flex-wrap:wrap;">
        <div class="row-gap"><h3>D2：緊急怎麼做</h3>${renderBadge('d2.actions')}</div>
        <div class="row-gap">
          <button type="button" class="btn btn-secondary btn-xs" data-cycle="d2">換個建議</button>
          <button type="button" class="btn btn-ghost btn-xs" data-add="d2">＋ 新增</button>
        </div>
      </div>
      ${reportData.d2.containmentActions.map((a, i) => `
        <div class="item-card">
          <textarea class="control" rows="2" style="resize:none;" data-arr="d2" data-i="${i}" data-k="action">${escapeHtml(a.action)}</textarea>
          <div class="item-card-top">
            <input class="control" style="max-width:160px;" data-arr="d2" data-i="${i}" data-k="owner" value="${escapeHtml(a.owner)}" placeholder="負責對象">
            <button type="button" class="btn-del" data-del="d2" data-i="${i}">刪除</button>
          </div>
        </div>`).join('')}
      <div class="field" style="margin-top:8px;">
        <label>緊急處置整體確認結果</label>
        <input class="control" data-edit="d2.containmentVerification" value="${escapeHtml(reportData.d2.containmentVerification)}">
      </div>`;
  } else if (activeRightTab === 'd3') {
    canvas.innerHTML = `
      <div class="panel-head" style="margin-bottom:10px;flex-wrap:wrap;">
        <div class="row-gap"><h3>D3：為什麼會這樣（5 Why）</h3>${renderBadge('d3.why')}</div>
        <div class="row-gap">
          <button type="button" class="btn btn-secondary btn-xs" data-cycle="d3">換個角度</button>
          <button type="button" class="btn btn-ghost btn-xs" data-add="why">＋ 多問一層</button>
        </div>
      </div>
      ${reportData.d3.whyMadeChain.map((w, i) => `
        <div class="item-card">
          <div class="item-card-top">
            <span class="why-lvl">${escapeHtml(w.level)}</span>
            <button type="button" class="btn-del" data-del="why" data-i="${i}">刪除</button>
          </div>
          <div class="grid-2">
            <input class="control" data-arr="why" data-i="${i}" data-k="question" value="${escapeHtml(w.question)}" placeholder="提問">
            <input class="control" data-arr="why" data-i="${i}" data-k="answer" value="${escapeHtml(w.answer)}" placeholder="原因洞察">
          </div>
        </div>`).join('')}
      <div class="field" style="margin-top:8px;">
        <div class="field-top"><label>真正原因總結</label>${renderBadge('d3.summary')}</div>
        <textarea class="control" rows="2" data-edit="d3.rootCauseSummary">${escapeHtml(reportData.d3.rootCauseSummary)}</textarea>
      </div>`;
  } else if (activeRightTab === 'd4') {
    canvas.innerHTML = `
      <div class="panel-head" style="margin-bottom:10px;flex-wrap:wrap;">
        <div class="row-gap"><h3>D4：以後怎麼改善與補償</h3>${renderBadge('d4.actions')}</div>
        <div class="row-gap">
          <button type="button" class="btn btn-secondary btn-xs" data-cycle="d4">換個方案</button>
          <button type="button" class="btn btn-ghost btn-xs" data-add="d4">＋ 新增</button>
        </div>
      </div>
      ${reportData.d4.correctiveActions.map((c, i) => `
        <div class="item-card">
          <div class="item-card-top">
            <input class="control" style="max-width:150px;font-weight:700;" data-arr="d4" data-i="${i}" data-k="category" value="${escapeHtml(c.category)}">
            <button type="button" class="btn-del" data-del="d4" data-i="${i}">刪除</button>
          </div>
          <textarea class="control" rows="2" style="resize:none;" data-arr="d4" data-i="${i}" data-k="action">${escapeHtml(c.action)}</textarea>
        </div>`).join('')}
      <div class="grid-2" style="margin-top:8px;">
        <div class="field"><label>改善前（Before）</label><input class="control" data-edit="d4.beforeMetric" value="${escapeHtml(reportData.d4.beforeMetric)}"></div>
        <div class="field"><label>改善目標（After）</label><input class="control" data-edit="d4.afterMetric" value="${escapeHtml(reportData.d4.afterMetric)}"></div>
      </div>`;
  } else if (activeRightTab === 'd5') {
    canvas.innerHTML = `
      <div class="panel-head" style="margin-bottom:10px;flex-wrap:wrap;">
        <div class="row-gap"><h3>D5：訂立生活約定（共同公約）</h3>${renderBadge('d5.docs')}</div>
        <div class="row-gap">
          <button type="button" class="btn btn-secondary btn-xs" data-cycle="d5">換個公約</button>
          <button type="button" class="btn btn-ghost btn-xs" data-add="d5">＋ 新增</button>
        </div>
      </div>
      ${reportData.d5.standardDocs.map((d, i) => `
        <div class="item-card">
          <div class="item-card-top">
            <input class="control" style="max-width:150px;font-weight:700;" data-arr="d5" data-i="${i}" data-k="docNumber" value="${escapeHtml(d.docNumber)}">
            <button type="button" class="btn-del" data-del="d5" data-i="${i}">刪除</button>
          </div>
          <textarea class="control" rows="2" style="resize:none;" data-arr="d5" data-i="${i}" data-k="docName">${escapeHtml(d.docName)}</textarea>
        </div>`).join('')}
      <div class="grid-2" style="margin-top:8px;">
        <div class="field">
          <div class="field-top"><label>家長／師長見證評語</label>${renderBadge('d5.comment')}</div>
          <input class="control" data-edit="d5.signOff.qaComment" value="${escapeHtml(reportData.d5.signOff.qaComment)}">
        </div>
        <div class="field">
          <label>處理判定</label>
          <select class="control" data-edit="d5.signOff.qaStatus">
            <option value="觀察改善中"${reportData.d5.signOff.qaStatus === '觀察改善中' ? ' selected' : ''}>觀察改善中</option>
            <option value="同意圓滿結案"${reportData.d5.signOff.qaStatus === '同意圓滿結案' ? ' selected' : ''}>同意圓滿結案</option>
            <option value="需再共同調整"${reportData.d5.signOff.qaStatus === '需再共同調整' ? ' selected' : ''}>需再共同調整</option>
          </select>
        </div>
      </div>`;
  } else if (activeRightTab === 'a4') {
    canvas.innerHTML = buildA4Markup();
  }
  canvas.scrollTop = 0;
}

let activeMobTab = 'input';
function isMobileView() {
  return typeof window !== 'undefined' && window.innerWidth < 768;
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

  paneIn?.classList.toggle('mob-active', mTab === 'input');
  paneRef?.classList.toggle('mob-active', mTab === 'refine');
  paneRight?.classList.toggle('mob-active', mTab === 'draft' || mTab === 'export');

  if (isMobileView()) {
    if (leftWrap) leftWrap.style.display = (mTab === 'input' || mTab === 'refine') ? 'flex' : 'none';
    if (rightTabsBar) rightTabsBar.style.display = mTab === 'export' ? 'none' : 'flex';
    if (mobExpBar) mobExpBar.hidden = mTab !== 'export';
    if (stepFoot) stepFoot.style.display = mTab === 'export' ? 'none' : 'flex';
  } else {
    if (leftWrap) leftWrap.style.display = '';
    if (rightTabsBar) rightTabsBar.style.display = '';
    if (mobExpBar) mobExpBar.hidden = true;
    if (stepFoot) stepFoot.style.display = '';
  }

  document.querySelectorAll('#mobile-bottom-nav .mnav').forEach(b => b.classList.toggle('active', b.dataset.mtab === mTab));

  if (mTab === 'export') {
    switchRightTab('a4');
  } else if (mTab === 'draft' && activeRightTab === 'a4') {
    switchRightTab('overview');
  }
}

function switchRightTab(tabId) {
  activeRightTab = tabId;
  if (typeof document !== 'undefined') {
    document.querySelectorAll('#right-tabs .rtab').forEach(b => {
      const a = b.dataset.rtab === tabId;
      b.classList.toggle('active', a);
      if (a && b.scrollIntoView) b.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    });
    const idx = RIGHT_TAB_ORDER.indexOf(tabId);
    const prevBtn = document.getElementById('btn-prev-tab');
    const nextBtn = document.getElementById('btn-next-tab');
    if (prevBtn) prevBtn.disabled = idx <= 0;
    if (nextBtn) {
      nextBtn.textContent = (isMobileView() && tabId === 'd5') ? '前往 A4 / 匯出 →' : '下一步 →';
      nextBtn.disabled = (!isMobileView() && idx >= RIGHT_TAB_ORDER.length - 1);
    }
  }
  renderRightCanvas();
}

function refreshAllViews() {
  saveDraft();
  if (typeof document === 'undefined') return;
  if (lastUpdatedStep && RIGHT_TAB_ORDER.includes(lastUpdatedStep)) {
    activeRightTab = lastUpdatedStep;
    lastUpdatedStep = '';
    if (isMobileView()) switchMobileTab('draft');
    switchRightTab(activeRightTab);
  } else {
    renderRightCanvas();
  }
}

// ==========================================================================
// 10. 匯出引擎：Word (.doc) 與 16:9 PowerPoint (.pptx 含無依賴備援)
// ==========================================================================
function triggerDownload(blob, filename) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(link.href), 1500);
}

function generateWordHtml() {
  const hasEscaped = reportData.d3.whyEscapedChain.some(w => w && (w.answer || w.question));
  const hasHoriz = reportData.d5.horizontalDeployment.some(h => h && (h.target || h.action));
  return `
  <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
  <head>
    <meta charset="utf-8">
    <title>5D 青春對話與生活共識分析報告</title>
    <style>
      @page Section1 { size: 595.3pt 841.9pt; margin: 1.8cm; }
      div.Section1 { page: Section1; }
      body { font-family: 'Microsoft JhengHei', 'PingFang TC', sans-serif; font-size: 10pt; line-height: 1.48; color: #14222b; }
      h1 { font-size: 16.5pt; color: #1b4d5c; text-align: center; margin: 0 0 3pt; }
      .sub { text-align: center; font-size: 9pt; color: #52626d; margin-bottom: 12pt; }
      h2 { font-size: 11pt; color: #1b4d5c; background: #f1f4f2; padding: 4pt 8pt; border-left: 4pt solid #1b4d5c; margin: 11pt 0 6pt; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 7pt; }
      th, td { border: 1px solid #b5c2bc; padding: 4.5pt 6pt; font-size: 9.2pt; vertical-align: top; }
      th { background: #f8faf9; color: #1b4d5c; font-weight: bold; }
      .box { background: #e8f2f5; border-left: 3pt solid #1b4d5c; padding: 5pt 8pt; font-size: 9.2pt; margin-bottom: 6pt; }
    </style>
  </head>
  <body>
    <div class="Section1">
      <h1>5D 青春對話與生活共識分析報告</h1>
      <div class="sub">報告編號：${escapeHtml(reportData.reportId)} ｜ 建立日期：${escapeHtml(reportData.dateCreated)} ｜ 語氣：${escapeHtml(TONE_LABELS[reportData.tone] || '')}</div>
      <table>
        <tr><th style="width:16%;">事件主題</th><td colspan="3"><strong>${escapeHtml(reportData.title)}</strong></td></tr>
        <tr><th>涉及事項</th><td style="width:34%;">${escapeHtml(reportData.partName || '-')}</td><th style="width:16%;">影響程度</th><td style="width:34%;">${escapeHtml(reportData.severity)}</td></tr>
      </table>

      <h2>D1：發生什麼事（5W2H 事實與影響）</h2>
      <table>
        <tr><th style="width:16%;">事情經過</th><td colspan="3">${escapeHtml(reportData.d1.problemDesc)}</td></tr>
        <tr><th>Who 人物</th><td>${escapeHtml(reportData.d1.who)}</td><th style="width:16%;">When 時間</th><td>${escapeHtml(reportData.d1.when)}</td></tr>
        <tr><th>Where 地點</th><td>${escapeHtml(reportData.d1.where)}</td><th>How 察覺</th><td>${escapeHtml(reportData.d1.how)}</td></tr>
        <tr><th>Why 約定</th><td>${escapeHtml(reportData.d1.why)}</td><th>影響範圍</th><td>${escapeHtml(reportData.d1.impactScope)}</td></tr>
      </table>

      <h2>D2：緊急怎麼做（當下應變處置）</h2>
      <table>
        <tr><th style="width:42%;">具體處置作為</th><th style="width:14%;">負責人</th><th style="width:13%;">日期</th><th style="width:10%;">進度</th><th style="width:21%;">確認結果</th></tr>
        ${reportData.d2.containmentActions.map(a => `<tr><td>${escapeHtml(a.action)}</td><td>${escapeHtml(a.owner)}</td><td>${escapeHtml(a.dueDate)}</td><td>${escapeHtml(a.status)}</td><td>${escapeHtml(a.result)}</td></tr>`).join('') || '<tr><td colspan="5">尚無記錄</td></tr>'}
      </table>
      <div class="box"><strong>緊急處理確認：</strong>${escapeHtml(reportData.d2.containmentVerification)}</div>

      <h2>D3：為什麼會這樣（深入原因 5 Why）</h2>
      <table>
        <tr><th style="width:16%;">層級</th><th style="width:38%;">提問</th><th style="width:46%;">洞察與原因</th></tr>
        ${reportData.d3.whyMadeChain.map(w => `<tr><td><strong>${escapeHtml(w.level)}</strong></td><td>${escapeHtml(w.question)}</td><td>${escapeHtml(w.answer)}</td></tr>`).join('')}
        ${hasEscaped ? reportData.d3.whyEscapedChain.map(w => `<tr><td><strong>${escapeHtml(w.level)}</strong></td><td>${escapeHtml(w.question)}</td><td>${escapeHtml(w.answer)}</td></tr>`).join('') : ''}
      </table>
      <div class="box"><strong>真正原因總結：</strong>${escapeHtml(reportData.d3.rootCauseSummary)}</div>

      <h2>D4：以後怎麼改善（具體作法與目標）</h2>
      <table>
        <tr><th style="width:40%;">改善與補償作法</th><th style="width:14%;">類別</th><th style="width:13%;">負責人</th><th style="width:12%;">期限</th><th style="width:21%;">成效檢核</th></tr>
        ${reportData.d4.correctiveActions.map(c => `<tr><td>${escapeHtml(c.action)}</td><td>${escapeHtml(c.category)}</td><td>${escapeHtml(c.owner)}</td><td>${escapeHtml(c.dueDate)}</td><td>${escapeHtml(c.verification)}</td></tr>`).join('') || '<tr><td colspan="5">尚無記錄</td></tr>'}
      </table>
      <table>
        <tr><th style="width:18%;">改善前</th><td>${escapeHtml(reportData.d4.beforeMetric)}</td></tr>
        <tr><th>改善目標</th><td><strong>${escapeHtml(reportData.d4.afterMetric)}</strong></td></tr>
      </table>

      <h2>D5：訂立生活約定（共同公約與親筆簽認）</h2>
      <table>
        <tr><th style="width:18%;">類別</th><th style="width:15%;">編號</th><th style="width:43%;">公約條文與內容</th><th style="width:12%;">訂立日</th><th style="width:12%;">提醒人</th></tr>
        ${reportData.d5.standardDocs.map(d => `<tr><td>${escapeHtml(d.docType)}</td><td><strong>${escapeHtml(d.docNumber)}</strong></td><td>${escapeHtml(d.docName)}</td><td>${escapeHtml(d.revDate)}</td><td>${escapeHtml(d.owner)}</td></tr>`).join('') || '<tr><td colspan="5">尚無記錄</td></tr>'}
      </table>
      ${hasHoriz ? `<table><tr><th>舉一反三延伸場合</th><th>共同作法</th><th>時間</th><th>負責人</th></tr>${reportData.d5.horizontalDeployment.map(h => `<tr><td>${escapeHtml(h.target)}</td><td>${escapeHtml(h.action)}</td><td>${escapeHtml(h.dueDate)}</td><td>${escapeHtml(h.owner)}</td></tr>`).join('')}</table>` : ''}
      <table>
        <tr><th style="width:18%;">家長／師長見證評語</th><td colspan="3">${escapeHtml(reportData.d5.signOff.qaComment)}（判定：${escapeHtml(reportData.d5.signOff.qaStatus)}｜${escapeHtml(reportData.d5.signOff.signDate)}）</td></tr>
        <tr><th>當事人承諾簽名</th><td style="width:32%;height:30pt;"></td><th style="width:18%;">家長／師長見證簽名</th><td style="width:32%;height:30pt;"></td></tr>
      </table>
    </div>
  </body>
  </html>`;
}

function exportWordReport() {
  if (!hasReportContent()) {
    showToast('請先輸入白話情境並生成 5D 初稿後再匯出 Word！', 'warning');
    return;
  }
  const blob = new Blob(['\ufeff' + generateWordHtml()], { type: 'application/msword;charset=utf-8' });
  triggerDownload(blob, `5D_青春對話報告_${sanitizeFilename(reportData.reportId)}.doc`);
  showToast('已匯出單頁 A4 Word (.doc) 報告！', 'success');
}

// --- 精簡零依賴純 JS 16:9 OOXML PPTX 打包器（作為獨立單檔模式與無外掛備援） ---
const CRC32_TABLE = (() => {
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
  for (let i = 0; i < bytes.length; i++) c = CRC32_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function buildZipStore(files) {
  const enc = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;

  files.forEach(f => {
    const nameBytes = enc.encode(f.name);
    const dataBytes = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
    const crc = crc32(dataBytes);
    const len = dataBytes.length;

    const lfh = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(lfh.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true); // UTF-8
    lv.setUint16(8, 0, true);      // STORE
    lv.setUint32(14, crc, true);
    lv.setUint32(18, len, true);
    lv.setUint32(22, len, true);
    lv.setUint16(26, nameBytes.length, true);
    lfh.set(nameBytes, 30);

    chunks.push(lfh, dataBytes);

    const cdh = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(cdh.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, len, true);
    cv.setUint32(24, len, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    cdh.set(nameBytes, 46);
    central.push(cdh);

    offset += lfh.length + dataBytes.length;
  });

  const cdStart = offset;
  let cdSize = 0;
  central.forEach(c => { chunks.push(c); cdSize += c.length; });

  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, cdStart, true);
  chunks.push(eocd);

  const total = chunks.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  chunks.forEach(c => { out.set(c, pos); pos += c.length; });
  return out;
}

function buildMinimalPptxBlob() {
  const slidesContent = [
    {
      bg: '14222B',
      titleColor: 'FFFFFF',
      bodyColor: 'DCE7EC',
      title: reportData.title || '5D 青春對話分析報告',
      subtitle: `5D YOUTH LIFE PROBLEM SOLVING REPORT｜${TONE_LABELS[reportData.tone] || ''}`,
      lines: [
        `報告編號：${reportData.reportId}`,
        `建立日期：${reportData.dateCreated}`,
        `涉及事項：${reportData.partName || '-'}`,
        `影響程度：${reportData.severity}`,
        `記錄／見證：${reportData.owner || '-'}`
      ]
    },
    {
      bg: 'FFFFFF', titleColor: '1B4D5C', bodyColor: '14222B',
      title: 'D1：發生什麼事（事實與影響 5W2H）',
      subtitle: 'DEFINE THE SITUATION',
      lines: [
        `事件經過：${reportData.d1.problemDesc}`,
        `Who 人物：${reportData.d1.who}`,
        `When 時間：${reportData.d1.when} ｜ Where 地點：${reportData.d1.where}`,
        `Why 違反約定：${reportData.d1.why}`,
        `How 察覺過程：${reportData.d1.how}`,
        `影響範圍：${reportData.d1.impactScope}`
      ]
    },
    {
      bg: 'FFFFFF', titleColor: '1B4D5C', bodyColor: '14222B',
      title: 'D2：緊急怎麼做（當下止血與情緒穩定）',
      subtitle: 'IMMEDIATE CONTAINMENT',
      lines: [
        ...reportData.d2.containmentActions.map((a, i) => `${i + 1}. ${a.action}（${a.owner}｜${a.status}）`),
        `確認結果：${reportData.d2.containmentVerification}`
      ]
    },
    {
      bg: 'FFFFFF', titleColor: '1B4D5C', bodyColor: '14222B',
      title: 'D3：為什麼會這樣（深入原因 5 Why）',
      subtitle: 'ROOT CAUSE INSIGHTS',
      lines: [
        ...reportData.d3.whyMadeChain.map(w => `${w.level}：${w.answer || w.question}`),
        `真正原因總結：${reportData.d3.rootCauseSummary}`
      ]
    },
    {
      bg: 'FFFFFF', titleColor: '1B4D5C', bodyColor: '14222B',
      title: 'D4：以後怎麼改善（具體作法、補償與目標）',
      subtitle: 'CORRECTIVE ACTIONS & GOALS',
      lines: [
        ...reportData.d4.correctiveActions.map((c, i) => `${i + 1}. [${c.category}] ${c.action}`),
        `改善前：${reportData.d4.beforeMetric}`,
        `改善目標：${reportData.d4.afterMetric}`
      ]
    },
    {
      bg: 'FFFFFF', titleColor: '1B4D5C', bodyColor: '14222B',
      title: 'D5：訂立生活約定（共同公約與見證）',
      subtitle: 'MUTUAL AGREEMENT & SIGN-OFF',
      lines: [
        ...reportData.d5.standardDocs.map((d, i) => `${i + 1}. [${d.docNumber}] ${d.docName}`),
        `家長／師長見證評語（${reportData.d5.signOff.qaStatus}）：${reportData.d5.signOff.qaComment}`,
        `見證日期：${reportData.d5.signOff.signDate}`
      ]
    }
  ];

  const makeSlideXml = (s) => {
    const bodyParas = s.lines.map(l =>
      `<a:p><a:pPr marL="228600" indent="-228600"><a:spcBef><a:spcPts val="600"/></a:spcBef></a:pPr><a:r><a:rPr lang="zh-TW" sz="1600"><a:solidFill><a:srgbClr val="${s.bodyColor}"/></a:solidFill><a:ea typeface="Microsoft JhengHei"/></a:rPr><a:t>${escapeXml(l)}</a:t></a:r></a:p>`
    ).join('');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:bg><p:bgPr><a:solidFill><a:srgbClr val="${s.bg}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="2" name="Title"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>
        <p:spPr><a:xfrm><a:off x="685800" y="457200"/><a:ext cx="10820400" cy="1005840"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>
        <p:txBody>
          <a:bodyPr wrap="square"/><a:lstStyle/>
          <a:p><a:r><a:rPr lang="zh-TW" sz="2400" b="1"><a:solidFill><a:srgbClr val="${s.titleColor}"/></a:solidFill><a:ea typeface="Microsoft JhengHei"/></a:rPr><a:t>${escapeXml(s.title)}</a:t></a:r></a:p>
          <a:p><a:r><a:rPr lang="en-US" sz="1100" b="1"><a:solidFill><a:srgbClr val="697A86"/></a:solidFill></a:rPr><a:t>${escapeXml(s.subtitle)}</a:t></a:r></a:p>
        </p:txBody>
      </p:sp>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="3" name="Body"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>
        <p:spPr><a:xfrm><a:off x="685800" y="1645920"/><a:ext cx="10820400" cy="4663440"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>
        <p:txBody><a:bodyPr wrap="square"/><a:lstStyle/>${bodyParas}</p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sld>`;
  };

  const files = [
    {
      name: '[Content_Types].xml',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
  <Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
  ${slidesContent.map((_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join('')}
</Types>`
    },
    {
      name: '_rels/.rels',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`
    },
    {
      name: 'ppt/presentation.xml',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>
  <p:sldIdLst>${slidesContent.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 2}"/>`).join('')}</p:sldIdLst>
  <p:sldSz cx="12192000" cy="6858000" type="screen16x9"/>
  <p:notesSz cx="6858000" cy="9144000"/>
</p:presentation>`
    },
    {
      name: 'ppt/_rels/presentation.xml.rels',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>
  ${slidesContent.map((_, i) => `<Relationship Id="rId${i + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i + 1}.xml"/>`).join('')}
</Relationships>`
    },
    {
      name: 'ppt/slideMasters/slideMaster1.xml',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld>
  <p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>
  <p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>
</p:sldMaster>`
    },
    {
      name: 'ppt/slideMasters/_rels/slideMaster1.xml.rels',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
</Relationships>`
    },
    {
      name: 'ppt/slideLayouts/slideLayout1.xml',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank">
  <p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld>
</p:sldLayout>`
    },
    {
      name: 'ppt/slideLayouts/_rels/slideLayout1.xml.rels',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>
</Relationships>`
    }
  ];

  slidesContent.forEach((s, i) => {
    files.push({ name: `ppt/slides/slide${i + 1}.xml`, data: makeSlideXml(s) });
    files.push({
      name: `ppt/slides/_rels/slide${i + 1}.xml.rels`,
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
</Relationships>`
    });
  });

  return new Blob([buildZipStore(files)], {
    type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  });
}

function exportPptReport() {
  if (!hasReportContent()) {
    showToast('請先輸入白話情境並生成 5D 初稿後再匯出 PPT！', 'warning');
    return;
  }

  const fileName = `5D_青春對話簡報_${sanitizeFilename(reportData.reportId)}.pptx`;

  // 若本機 PptxGenJS 已載入，產出豐富表格版 16:9 簡報；否則無縫使用內建零依賴 OOXML 產生器
  if (typeof window !== 'undefined' && typeof window.PptxGenJS !== 'undefined') {
    try {
      const pptx = new window.PptxGenJS();
      pptx.layout = 'LAYOUT_WIDE';
      pptx.title = reportData.title || '5D 青春對話分析簡報';
      pptx.author = reportData.owner || '5D 青春對話小幫手';

      const header = (slide, title, sub) => {
        slide.addText(title, { x: 0.7, y: 0.4, w: 11.9, h: 0.45, fontSize: 18, bold: true, color: '1B4D5C', fontFace: 'Microsoft JhengHei' });
        slide.addText(sub, { x: 0.7, y: 0.85, w: 11.9, h: 0.25, fontSize: 9.5, color: '697A86', bold: true, fontFace: 'Microsoft JhengHei' });
        slide.addShape(pptx.shapes.RECTANGLE, { x: 0.7, y: 1.15, w: 11.9, h: 0.02, fill: { color: 'DDE4E0' } });
      };

      // Slide 1: 封面
      const s1 = pptx.addSlide();
      s1.background = { color: '14222B' };
      s1.addText('5D YOUTH DIALOGUE & AGREEMENT REPORT', { x: 0.8, y: 1.0, w: 11.7, h: 0.4, fontSize: 13, bold: true, color: '7AD3C6', fontFace: 'Microsoft JhengHei' });
      s1.addText(reportData.title || '5D 青春對話分析報告', { x: 0.8, y: 1.55, w: 11.7, h: 1.2, fontSize: 25, bold: true, color: 'FFFFFF', fontFace: 'Microsoft JhengHei' });
      s1.addShape(pptx.shapes.RECTANGLE, { x: 0.8, y: 2.85, w: 2.4, h: 0.05, fill: { color: '7AD3C6' } });
      s1.addText([
        `報告編號：${reportData.reportId}`,
        `建立日期：${reportData.dateCreated}`,
        `涉及事項：${reportData.partName || '-'}`,
        `影響程度：${reportData.severity}`,
        `表達語氣：${TONE_LABELS[reportData.tone] || ''}`,
        `記錄／見證：${reportData.owner || '-'}`
      ].join('\n'), { x: 0.8, y: 3.2, w: 11.7, h: 3.3, fontSize: 13, color: 'E2ECEF', lineSpacing: 24, fontFace: 'Microsoft JhengHei' });

      // Slide 2: D1
      const s2 = pptx.addSlide();
      header(s2, 'D1：發生什麼事（事實與影響 5W2H）', 'DEFINE THE SITUATION');
      s2.addShape(pptx.shapes.ROUNDED_RECTANGLE, { x: 0.7, y: 1.35, w: 11.9, h: 1.1, fill: { color: 'E8F2F5' }, line: { color: 'B6D4DE' } });
      s2.addText(`事情經過：${reportData.d1.problemDesc}`, { x: 0.9, y: 1.45, w: 11.5, h: 0.9, fontSize: 11, color: '14222B', fontFace: 'Microsoft JhengHei' });
      s2.addTable([
        [{ text: 'Who 人物', options: { bold: true, fill: 'F1F4F2' } }, { text: reportData.d1.who || '-' }, { text: 'When 時間', options: { bold: true, fill: 'F1F4F2' } }, { text: reportData.d1.when || '-' }],
        [{ text: 'Where 地點', options: { bold: true, fill: 'F1F4F2' } }, { text: reportData.d1.where || '-' }, { text: 'How 察覺', options: { bold: true, fill: 'F1F4F2' } }, { text: reportData.d1.how || '-' }],
        [{ text: 'Why 違反約定', options: { bold: true, fill: 'F1F4F2' } }, { text: reportData.d1.why || '-', options: { colspan: 3 } }],
        [{ text: '影響範圍', options: { bold: true, fill: 'FDF0F0', color: 'B83333' } }, { text: reportData.d1.impactScope || '-', options: { colspan: 3, color: 'B83333' } }]
      ], { x: 0.7, y: 2.65, w: 11.9, colW: [2.0, 3.95, 2.0, 3.95], fontSize: 10.5, fontFace: 'Microsoft JhengHei', border: { pt: 0.5, color: 'CBD5E1' } });

      // Slide 3: D2
      const s3 = pptx.addSlide();
      header(s3, 'D2：緊急怎麼做（當下止血與情緒穩定）', 'IMMEDIATE CONTAINMENT');
      const d2Rows = [
        [{ text: '具體處置作為', options: { bold: true, fill: 'F1F4F2' } }, { text: '負責對象', options: { bold: true, fill: 'F1F4F2' } }, { text: '進度', options: { bold: true, fill: 'F1F4F2' } }, { text: '確認結果', options: { bold: true, fill: 'F1F4F2' } }],
        ...reportData.d2.containmentActions.slice(0, 4).map(a => [{ text: a.action || '-' }, { text: a.owner || '-' }, { text: a.status || '-' }, { text: a.result || '-' }])
      ];
      s3.addTable(d2Rows, { x: 0.7, y: 1.45, w: 11.9, colW: [5.4, 1.8, 1.3, 3.4], fontSize: 10.5, fontFace: 'Microsoft JhengHei', border: { pt: 0.5, color: 'CBD5E1' } });
      s3.addShape(pptx.shapes.ROUNDED_RECTANGLE, { x: 0.7, y: 5.7, w: 11.9, h: 0.9, fill: { color: 'E6F4F1' }, line: { color: 'A7DFD4' } });
      s3.addText(`緊急處置確認：${reportData.d2.containmentVerification || '-'}`, { x: 0.9, y: 5.82, w: 11.5, h: 0.65, fontSize: 11, bold: true, color: '0F6254', fontFace: 'Microsoft JhengHei' });

      // Slide 4: D3
      const s4 = pptx.addSlide();
      header(s4, 'D3：為什麼會這樣（深入原因 5 Why）', 'ROOT CAUSE INSIGHTS');
      const hasEsc = reportData.d3.whyEscapedChain.some(w => w && (w.answer || w.question));
      const madeTxt = reportData.d3.whyMadeChain.map(w => `${w.level}：${w.answer || w.question}`).join('\n↓\n') || '尚無推導';
      s4.addShape(pptx.shapes.ROUNDED_RECTANGLE, { x: 0.7, y: 1.45, w: hasEsc ? 6.8 : 11.9, h: 3.9, fill: { color: 'F6F7F5' }, line: { color: 'DDE4E0' } });
      s4.addText(madeTxt, { x: 0.9, y: 1.6, w: hasEsc ? 6.4 : 11.5, h: 3.6, fontSize: 10.5, color: '14222B', valign: 'top', lineSpacing: 16, fontFace: 'Microsoft JhengHei' });
      if (hasEsc) {
        const escTxt = reportData.d3.whyEscapedChain.map(w => `${w.level}：${w.answer || w.question}`).join('\n↓\n');
        s4.addShape(pptx.shapes.ROUNDED_RECTANGLE, { x: 7.75, y: 1.45, w: 4.85, h: 3.9, fill: { color: 'FEF6E4' }, line: { color: 'F3D28F' } });
        s4.addText(`環境把關漏洞：\n${escTxt}`, { x: 7.95, y: 1.6, w: 4.45, h: 3.6, fontSize: 10.5, color: '14222B', valign: 'top', lineSpacing: 16, fontFace: 'Microsoft JhengHei' });
      }
      s4.addShape(pptx.shapes.ROUNDED_RECTANGLE, { x: 0.7, y: 5.55, w: 11.9, h: 1.05, fill: { color: 'E8F2F5' }, line: { color: 'B6D4DE' } });
      s4.addText(`真正原因總結：${reportData.d3.rootCauseSummary || '-'}`, { x: 0.9, y: 5.68, w: 11.5, h: 0.8, fontSize: 11, bold: true, color: '1B4D5C', fontFace: 'Microsoft JhengHei' });

      // Slide 5: D4
      const s5 = pptx.addSlide();
      header(s5, 'D4：以後怎麼改善（具體作法、補償與目標）', 'CORRECTIVE ACTIONS & GOALS');
      const d4Rows = [
        [{ text: '改善與補償作法', options: { bold: true, fill: 'F1F4F2' } }, { text: '類別', options: { bold: true, fill: 'F1F4F2' } }, { text: '負責人', options: { bold: true, fill: 'F1F4F2' } }, { text: '成效檢核', options: { bold: true, fill: 'F1F4F2' } }],
        ...reportData.d4.correctiveActions.slice(0, 4).map(c => [{ text: c.action || '-' }, { text: c.category || '-' }, { text: c.owner || '-' }, { text: c.verification || '-' }])
      ];
      s5.addTable(d4Rows, { x: 0.7, y: 1.45, w: 11.9, colW: [5.5, 1.8, 1.5, 3.1], fontSize: 10, fontFace: 'Microsoft JhengHei', border: { pt: 0.5, color: 'CBD5E1' } });
      s5.addTable([
        [{ text: '改善前（Before）', options: { bold: true, fill: 'FDF0F0', color: 'B83333' } }, { text: reportData.d4.beforeMetric || '-' }],
        [{ text: '改善目標（After）', options: { bold: true, fill: 'E6F4F1', color: '0F6254' } }, { text: reportData.d4.afterMetric || '-' }]
      ], { x: 0.7, y: 4.85, w: 11.9, colW: [2.5, 9.4], fontSize: 10.5, fontFace: 'Microsoft JhengHei', border: { pt: 0.5, color: 'CBD5E1' } });

      // Slide 6: D5
      const s6 = pptx.addSlide();
      header(s6, 'D5：訂立生活約定（共同公約與見證）', 'MUTUAL AGREEMENT & SIGN-OFF');
      const d5Rows = [
        [{ text: '類別', options: { bold: true, fill: 'F1F4F2' } }, { text: '編號', options: { bold: true, fill: 'F1F4F2' } }, { text: '生活公約具體內容', options: { bold: true, fill: 'F1F4F2' } }, { text: '提醒人', options: { bold: true, fill: 'F1F4F2' } }],
        ...reportData.d5.standardDocs.slice(0, 4).map(d => [{ text: d.docType || '-' }, { text: d.docNumber || '-', options: { bold: true } }, { text: d.docName || '-' }, { text: d.owner || '-' }])
      ];
      s6.addTable(d5Rows, { x: 0.7, y: 1.45, w: 11.9, colW: [2.1, 1.8, 6.2, 1.8], fontSize: 10.5, fontFace: 'Microsoft JhengHei', border: { pt: 0.5, color: 'CBD5E1' } });
      s6.addShape(pptx.shapes.ROUNDED_RECTANGLE, { x: 0.7, y: 5.35, w: 11.9, h: 1.25, fill: { color: 'E8F2F5' }, line: { color: 'B6D4DE' } });
      s6.addText(`見證評語（${reportData.d5.signOff.qaStatus}｜${reportData.d5.signOff.signDate}）：\n${reportData.d5.signOff.qaComment || '-'}`, { x: 0.9, y: 5.48, w: 11.5, h: 1.0, fontSize: 11, bold: true, color: '1B4D5C', fontFace: 'Microsoft JhengHei' });

      pptx.writeFile({ fileName }).then(() => showToast('已匯出 16:9 PowerPoint (.pptx) 簡報！', 'success'));
      return;
    } catch (e) {
      console.warn('PptxGenJS 失敗，改用內建 OOXML 產生器:', e);
    }
  }

  triggerDownload(buildMinimalPptxBlob(), fileName);
  showToast('已匯出 16:9 PowerPoint (.pptx) 簡報！', 'success');
}

// ==========================================================================
// 11. 單一畫面分頁切換、事件委派與自動示範
// ==========================================================================
function clearAll() {
  reportData = getBlankReportData();
  reportData.tone = activeTone;
  lastUpdatedStep = '';
  const rawEl = document.getElementById('raw-input');
  if (rawEl) { rawEl.value = ''; rawEl.focus(); }
  const rf = document.getElementById('refine-feedback');
  if (rf) rf.hidden = true;
  if (isMobileView()) switchMobileTab('input');
  switchRightTab('overview');
  showToast('已清空所有內容，可直接輸入新情境。', 'info');
}

async function runAutoDemo() {
  if (isAutoDemoRunning) return;
  isAutoDemoRunning = true;
  const btn = document.getElementById('btn-auto-demo');
  if (btn) { btn.disabled = true; btn.textContent = '示範中...'; }
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  try {
    clearAll();
    await sleep(250);
    const demoText = TEEN_SCENARIOS.compound_3c_emotion;
    const rawEl = document.getElementById('raw-input');
    if (rawEl) {
      rawEl.focus();
      for (const ch of demoText) {
        rawEl.value += ch;
        await sleep(20);
      }
    }
    await sleep(300);
    reportData = autoEnrichTo5D(demoText, activeTone);
    if (isMobileView()) switchMobileTab('draft');
    switchRightTab('overview');
    showToast('步驟 1：白話一句話 → 立即補完 5D 初步陳述！', 'success');
    await sleep(1100);

    const extra = '真正原因是最近段考壓力太大，想靠玩遊戲喘口氣';
    applySpokenRefinement(extra);
    const rf = document.getElementById('refine-feedback');
    if (rf) {
      rf.textContent = '已自動識別口語補充並融入【D3 根本原因與 5 Why】，升級為「已確認」！';
      rf.hidden = false;
    }
    await sleep(1100);

    if (isMobileView()) switchMobileTab('export');
    else switchRightTab('a4');
    showToast('自動示範完成！手機與桌機全程免上下捲動。', 'success');
  } finally {
    isAutoDemoRunning = false;
    if (btn) { btn.disabled = false; btn.textContent = '自動示範'; }
  }
}

function bindEvents() {
  // 手機底部 4 分頁導覽與視窗縮放同步
  document.getElementById('mobile-bottom-nav')?.addEventListener('click', (e) => {
    const b = e.target.closest('.mnav');
    if (b) switchMobileTab(b.dataset.mtab);
  });
  window.addEventListener('resize', () => switchMobileTab(activeMobTab));

  // 右側 7 分頁與上下一步
  document.getElementById('right-tabs')?.addEventListener('click', (e) => {
    const b = e.target.closest('.rtab');
    if (b) switchRightTab(b.dataset.rtab);
  });
  document.getElementById('btn-prev-tab')?.addEventListener('click', () => {
    const i = RIGHT_TAB_ORDER.indexOf(activeRightTab);
    if (i > 0) switchRightTab(RIGHT_TAB_ORDER[i - 1]);
  });
  document.getElementById('btn-next-tab')?.addEventListener('click', () => {
    if (isMobileView() && activeRightTab === 'd5') {
      switchMobileTab('export');
      return;
    }
    const i = RIGHT_TAB_ORDER.indexOf(activeRightTab);
    if (i < RIGHT_TAB_ORDER.length - 1) switchRightTab(RIGHT_TAB_ORDER[i + 1]);
  });

  // AI 彈窗
  const aiModal = document.getElementById('ai-modal');
  document.getElementById('btn-open-ai')?.addEventListener('click', () => { if (aiModal) aiModal.hidden = false; });
  document.getElementById('btn-close-ai')?.addEventListener('click', () => { if (aiModal) aiModal.hidden = true; });
  document.getElementById('btn-save-ai')?.addEventListener('click', () => {
    if (aiModal) aiModal.hidden = true;
    showToast('已套用引擎設定！', 'success');
  });
  document.getElementById('llm-provider')?.addEventListener('change', (e) => {
    const val = e.target.value;
    const keyWrap = document.getElementById('wrap-api-key');
    const modWrap = document.getElementById('wrap-model-name');
    const modInput = document.getElementById('llm-model-name');
    if (keyWrap) keyWrap.hidden = val !== 'gemini';
    if (modWrap) modWrap.hidden = val === 'offline';
    if (modInput) modInput.value = val === 'ollama' ? 'qwen2.5' : 'gemini-2.5-flash';
  });

  // 情境下拉快選
  document.getElementById('scenario-select')?.addEventListener('change', (e) => {
    const txt = TEEN_SCENARIOS[e.target.value];
    const rawEl = document.getElementById('raw-input');
    if (rawEl && txt) {
      rawEl.value = txt;
      reportData = autoEnrichTo5D(txt, activeTone);
      lastUpdatedStep = '';
      if (isMobileView()) switchMobileTab('draft');
      switchRightTab('overview');
      showToast('已帶入情境並完成 5D 語意自動補完！', 'success');
    }
  });

  // 生成與自動示範
  document.getElementById('btn-generate')?.addEventListener('click', async () => {
    await runGeneration();
    if (hasReportContent() && isMobileView()) {
      switchMobileTab('draft');
      switchRightTab('overview');
    }
  });
  document.getElementById('btn-auto-demo')?.addEventListener('click', runAutoDemo);
  document.addEventListener('keydown', (e) => {
    if (e.altKey && (e.key === 'd' || e.key === 'D')) {
      e.preventDefault();
      runAutoDemo();
    }
  });

  // 語氣切換（桌機＋手機同步）
  const handleToneClick = (e) => {
    const btn = e.target.closest('.seg-btn');
    if (btn) switchTone(btn.dataset.tone);
  };
  document.getElementById('tone-segmented')?.addEventListener('click', handleToneClick);
  document.getElementById('tone-segmented-mobile')?.addEventListener('click', handleToneClick);

  // 複製與全部確認
  document.getElementById('btn-copy-narrative')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(buildNarrativePlainText());
      showToast('已複製完整 5D 陳述文字！', 'success');
    } catch (e) {
      showToast('請直接選取文字複製。', 'warning');
    }
  });

  document.getElementById('btn-confirm-all')?.addEventListener('click', () => {
    Object.keys(reportData.sourceMap).forEach(k => {
      if (reportData.sourceMap[k] === 'inferred') reportData.sourceMap[k] = 'confirmed';
    });
    renderRightCanvas();
    showToast('已將所有語意補完項目確認定稿！', 'success');
  });

  // 口語追加微調
  const triggerRefine = () => {
    const inp = document.getElementById('refine-input');
    const val = inp ? inp.value.trim() : '';
    if (!val) { showToast('請先輸入要補充的白話句子！', 'warning'); return; }
    const targets = applySpokenRefinement(val);
    if (inp) inp.value = '';
    const rf = document.getElementById('refine-feedback');
    if (rf && targets) {
      rf.textContent = `已自動融入【${targets.map(t => t.label).join('、')}】並升級為「已確認」！`;
      rf.hidden = false;
    }
    showToast(`已自動跳轉並融入 ${targets[0].label}！`, 'success');
  };
  document.getElementById('btn-apply-refine')?.addEventListener('click', triggerRefine);
  document.getElementById('refine-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); triggerRefine(); }
  });
  document.getElementById('refine-hints')?.addEventListener('click', (e) => {
    const chip = e.target.closest('.hint-chip');
    if (!chip) return;
    const inp = document.getElementById('refine-input');
    if (inp) { inp.value = chip.dataset.refine || ''; inp.focus(); }
  });

  // 右側畫布事件委派
  const canvas = document.getElementById('right-canvas');
  canvas?.addEventListener('click', (e) => {
    const jmp = e.target.closest('[data-jump]');
    if (jmp) { switchRightTab(jmp.dataset.jump); return; }

    const cyc = e.target.closest('[data-cycle]');
    if (cyc) {
      const s = cyc.dataset.cycle;
      variantIndices[s] = (variantIndices[s] || 0) + 1;
      const dom1 = TEEN_DOMAIN_KB[reportData.primaryDomain || activePrimaryDomainId] || TEEN_DOMAIN_KB['3c_sleep'];
      const dom2 = (reportData.secondaryDomain && TEEN_DOMAIN_KB[reportData.secondaryDomain]) ? TEEN_DOMAIN_KB[reportData.secondaryDomain] : null;
      fillStepFromDomain(reportData, s, dom1, dom2, activeTone, variantIndices[s]);
      renderRightCanvas();
      showToast(`已為 ${s.toUpperCase()} 切換另一組國高中情境建議！`, 'info');
      return;
    }

    const add = e.target.closest('[data-add]');
    if (add) {
      const k = add.dataset.add;
      if (k === 'd2') reportData.d2.containmentActions.push({ action: '', owner: '當事人／家長', dueDate: reportData.dateCreated, status: '進行中', result: '' });
      if (k === 'why') reportData.d3.whyMadeChain.push({ level: `Why ${reportData.d3.whyMadeChain.length + 1}`, question: '為什麼會這樣？', answer: '' });
      if (k === 'd4') reportData.d4.correctiveActions.push({ action: '', category: '習慣調整', owner: '當事人', dueDate: reportData.targetCloseDate, status: '進行中', verification: '' });
      if (k === 'd5') reportData.d5.standardDocs.push({ docType: '家庭生活公約', docNumber: `RULE-0${reportData.d5.standardDocs.length + 1}`, docName: '', revDate: reportData.dateCreated, owner: '雙方共同' });
      renderRightCanvas();
      return;
    }

    const del = e.target.closest('[data-del]');
    if (del) {
      const map = {
        d2: reportData.d2.containmentActions,
        why: reportData.d3.whyMadeChain,
        d4: reportData.d4.correctiveActions,
        d5: reportData.d5.standardDocs
      };
      map[del.dataset.del]?.splice(Number(del.dataset.i), 1);
      renderRightCanvas();
    }
  });

  canvas?.addEventListener('input', (e) => {
    const ed = e.target.closest('[data-edit]');
    if (ed) {
      const p = ed.dataset.edit;
      setNestedValue(reportData, p, ed.value);
      if (p.startsWith('d1.')) reportData.sourceMap[p] = 'confirmed';
      if (p === 'd2.containmentVerification') reportData.sourceMap['d2.verify'] = 'confirmed';
      if (p === 'd3.rootCauseSummary') reportData.sourceMap['d3.summary'] = 'confirmed';
      if (p.startsWith('d4.')) reportData.sourceMap['d4.metrics'] = 'confirmed';
      if (p === 'd5.signOff.qaComment') reportData.sourceMap['d5.comment'] = 'confirmed';
      updateTopStatusOnly();
      return;
    }
    const ar = e.target.closest('[data-arr]');
    if (ar) {
      const map = {
        d2: reportData.d2.containmentActions,
        why: reportData.d3.whyMadeChain,
        d4: reportData.d4.correctiveActions,
        d5: reportData.d5.standardDocs
      };
      const arr = map[ar.dataset.arr];
      const idx = Number(ar.dataset.i);
      const key = ar.dataset.k;
      if (arr && arr[idx] && !FORBIDDEN_PROTO_KEYS.has(key)) {
        arr[idx][key] = ar.value;
        if (ar.dataset.arr === 'd2') reportData.sourceMap['d2.actions'] = 'confirmed';
        if (ar.dataset.arr === 'why') reportData.sourceMap['d3.why'] = 'confirmed';
        if (ar.dataset.arr === 'd4') reportData.sourceMap['d4.actions'] = 'confirmed';
        if (ar.dataset.arr === 'd5') reportData.sourceMap['d5.docs'] = 'confirmed';
        updateTopStatusOnly();
      }
    }
  });

  // 匯出與列印（桌機＋手機同步）
  document.getElementById('btn-reset')?.addEventListener('click', () => {
    if (!hasReportContent() || confirm('確定要清空所有內容重新開始嗎？')) clearAll();
  });
  document.getElementById('btn-export-word')?.addEventListener('click', exportWordReport);
  document.getElementById('btn-mob-word')?.addEventListener('click', exportWordReport);
  document.getElementById('btn-export-ppt')?.addEventListener('click', exportPptReport);
  document.getElementById('btn-mob-ppt')?.addEventListener('click', exportPptReport);
  const doPrint = () => {
    if (!hasReportContent()) { showToast('請先生成 5D 初稿再列印！', 'warning'); return; }
    const pm = document.getElementById('print-mount');
    if (pm) pm.innerHTML = buildA4Markup();
    window.print();
  };
  document.getElementById('btn-print')?.addEventListener('click', doPrint);
  document.getElementById('btn-mob-print')?.addEventListener('click', doPrint);
}

// 啟動初始化
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    bindEvents();
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        reportData = normalizeReportData(JSON.parse(saved));
        activeTone = reportData.tone || 'gentle_family';
        activePrimaryDomainId = reportData.primaryDomain || '3c_sleep';
        activeSecondaryDomainId = reportData.secondaryDomain || null;
        const rawEl = document.getElementById('raw-input');
        if (rawEl && reportData.rawInput) rawEl.value = reportData.rawInput;
      } else {
        const rawEl = document.getElementById('raw-input');
        if (rawEl) rawEl.value = TEEN_SCENARIOS.compound_3c_emotion;
        reportData = autoEnrichTo5D(TEEN_SCENARIOS.compound_3c_emotion, activeTone);
      }
    } catch (e) {
      reportData = autoEnrichTo5D(TEEN_SCENARIOS.compound_3c_emotion, activeTone);
    }
    document.querySelectorAll('.seg-btn').forEach(btn => {
      const isAct = btn.dataset.tone === activeTone;
      btn.classList.toggle('active', isAct);
      btn.setAttribute('aria-checked', String(isAct));
    });
    switchRightTab('overview');
    switchMobileTab(isMobileView() ? 'input' : 'draft');
  });
}

// 供 Node.js 自動化測試引用
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    TEEN_SCENARIOS,
    TEEN_DOMAIN_KB,
    autoEnrichTo5D,
    applySpokenRefinement,
    build5DPrompt,
    buildMinimalPptxBlob,
    generateWordHtml,
    escapeHtml,
    sanitizeFilename,
    setNestedValue,
    getNestedValue,
    normalizeReportData,
    computeAuditScore: (d) => { reportData = d; return computeAuditScore(); }
  };
}
