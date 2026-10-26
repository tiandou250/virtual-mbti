/* =============================================================
 * 你的 V 圈人格 —— 算法层
 *
 * 核心机制：分位数归一化
 * 为什么不用「得分 / 满分 × 100」？
 *   每轴 4 题、每题 4 档。答出来的原始分是钟形分布：
 *   拿 6 分（中段）有 44 种答法，拿 12 分（满分）只有 1 种。
 *   如果按线性映射，绝大多数用户会落在 40–60，
 *   导致数值中段的人物吃满流量，数值极端的人物永远匹配不到。
 * 解法：按「超过百分之多少的人」来给分，让用户在 0–100 上均匀分布。
 * ============================================================= */

/* 每轴原始总分 0–12 的累积概率映射表
 * 依据：(1+x+x^2+x^3)^4 的系数分布 [1,4,10,20,31,40,44,40,31,20,10,4,1]，合计 256
 * 意为「你超过多少人」，所以 0 分 → 0，12 分 → 100
 */
const LEVELS = [0, 1, 4, 10, 20, 34, 50, 66, 80, 90, 96, 99, 100];

/* 五轴权重
 * 营业(B) 与 关系(R) 两轴信度最低（题目最容易受社会期望影响），降权避免放大误差
 */
const AXIS_WEIGHT = { S: 1, C: 1, T: 1, B: 0.8, R: 0.8 };

/* 人气平滑系数
 * 数值越大，超人气人物的出现概率被压得越狠。
 * 0.15 是首发定值，验收不达标时优先调这个参数。
 */
const POPULARITY_SMOOTH = 0.15;

/* 匹配度区间：clamp 到 [62, 96]
 * 不显示 100%，因为「完全一致」不可信；
 * 不显示 60% 以下，否则用户会觉得「这结果不靠谱」。
 */
const MATCH_MIN = 62;
const MATCH_MAX = 96;

/* 距离 → 匹配度的映射
 *
 * 实测「用户到最近人物的距离」分位数（13^5 全量枚举，按答题路径数加权）：
 *   5% 0.215 / 10% 0.254 / 25% 0.331 / **50% 0.423** / 75% 0.519 / 90% 0.606 / 99% 0.745
 *
 * 所以曲线的锚点应该这样定：
 *   0.22（前 5% 贴合）      → 96
 *   0.42（中位）            → 86
 *   0.60（前 90%）          → 76
 *   0.75（前 99%）          → 68
 *   1.00 以上               → 66（兜底）
 *
 * 为什么不是「距离 0 才是 100 分」？
 *   五维空间里没有两个真人完全重合，用户也不该被给到 100%，
 *   否则「匹配度 100%」反而让人怀疑。
 */
const MATCH_CURVE = {
  anchors: [
    [0.22, 96],
    [0.42, 86],
    [0.60, 76],
    [0.75, 68],
  ],
  floor: 66,     // 下限，任何情况都不会低于此值
  ceiling: 96,   // 上限，不显示 100%
};

function distanceToMatch(d) {
  const a = MATCH_CURVE.anchors;
  let score;
  if (d <= a[0][0]) {
    score = a[0][1];
  } else if (d >= a[a.length - 1][0]) {
    // 超出最后一个锚点，线性下滑到 floor
    const t = Math.min(1, (d - a[a.length - 1][0]) / 0.5);
    score = a[a.length - 1][1] - t * (a[a.length - 1][1] - MATCH_CURVE.floor);
  } else {
    // 在锚点之间线性插值
    for (let i = 0; i < a.length - 1; i++) {
      const [d0, s0] = a[i];
      const [d1, s1] = a[i + 1];
      if (d >= d0 && d <= d1) {
        const t = (d - d0) / (d1 - d0);
        score = s0 + t * (s1 - s0);
        break;
      }
    }
  }
  return Math.round(
    Math.min(MATCH_CURVE.ceiling, Math.max(MATCH_CURVE.floor, score))
  );
}

/* ---------- 1. 计算用户五轴得分 ---------- */
function computeAxis(answers) {
  // answers: [{axis, rev, score}]  与 QUESTIONS 一一对应
  const sum = { S: 0, C: 0, T: 0, B: 0, R: 0 };

  answers.forEach((a, i) => {
    const q = QUESTIONS[i];
    let v = a; // 0–3
    if (q.rev) v = 3 - v;   // 反向题翻转
    sum[q.axis] += v;
  });

  const result = {};
  for (const k in sum) {
    result[k] = LEVELS[sum[k]];
  }
  return result;
}

/* ---------- 2. 加权距离 ---------- */
function distance(user, person) {
  let d = 0;
  for (const k of ['S', 'C', 'T', 'B', 'R']) {
    const w = AXIS_WEIGHT[k];
    const diff = (user[k] - person.ax[k]) / 100;
    d += w * diff * diff;
  }
  return Math.sqrt(d);
}

/* ---------- 3. 匹配：带人气惩罚 ---------- */
function match(user, people) {
  const scored = people.map(p => {
    const raw = distance(user, p);
    // 惩罚：人气越高，等效距离越大
    const penalty = p.popularity * POPULARITY_SMOOTH;
    return { person: p, raw, adjusted: raw + penalty };
  });

  // 用「惩罚后距离」排序，用「原始距离」算匹配度
  // 若用惩罚后距离算百分比，会出现「匹配度 70% 但你是乃琳」的割裂感
  scored.sort((a, b) => a.adjusted - b.adjusted);

  scored.forEach(s => {
    // 匹配度完全由距离曲线决定（曲线内部已夹在 [floor, nearScore]）
    // 这里的 clamp 只作为最后一道保险，不能再引入第二套下限
    s.match = Math.min(MATCH_MAX, Math.max(MATCH_CURVE.floor, distanceToMatch(s.raw)));
  });

  const top = scored[0];
  const second = scored[1];

  return {
    person: top.person,
    match: top.match,
    second: { person: second.person, match: second.match },
    ranking: scored,
  };
}

/* ---------- 4. 五轴文字注解 ----------
 * 雷达图看不出形状意味着什么，必须配一句人话
 */
const AXIS_NOTE = {
  S: {
    low:  '你不是社恐，你是懒得主动。',
    mid:  '你能社交，但你更愿意先看看值不值得。',
    high: '你是那个让场子活起来的人，而且你不觉得累。',
  },
  C: {
    low:  '你要的不是内容，是有人在旁边说话。',
    mid:  '聊得来、也能看点真的东西，两边都行。',
    high: '你不太吃纯陪聊，得有干货才留得住你。',
  },
  T: {
    low:  '你身上没有那种要炸开的劲儿，但很稳。',
    mid:  '你能闹也能收，看场合。',
    high: '你的表达欲藏不住，一开口就是整活。',
  },
  B: {
    low:  '你不装勤快。这件事本身，比你以为的稀有。',
    mid:  '你有节奏，不卷也不躺。',
    high: '你对「做得不够好」这件事特别敏感。',
  },
  R: {
    low:  '你心里就那么几个位子，给出去一个是一个。',
    mid:  '你有自己人，也愿意分一点注意力给新东西。',
    high: '你的注意力是散的，但你自己觉得这叫兴致。',
  },
};

function axisNote(key, val) {
  const n = val < 35 ? AXIS_NOTE[key].low
          : val > 65 ? AXIS_NOTE[key].high
          : AXIS_NOTE[key].mid;
  return n;
}
