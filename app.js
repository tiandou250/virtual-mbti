/* =============================================================
 * 你的 V 圈人格 —— 页面逻辑
 * 三个页面：landing / quiz / result（同一个 DOM，切换 class）
 * ============================================================= */

(function () {
  'use strict';

  // ---------- 状态 ----------
  const state = {
    page: 'landing',
    index: 0,
    answers: [],       // 每题 0-3
    result: null,
  };

  // ---------- DOM ----------
  const $ = (sel) => document.querySelector(sel);
  const el = {
    landing: $('#page-landing'),
    quiz: $('#page-quiz'),
    result: $('#page-result'),
    startBtn: $('#start-btn'),
    qIndex: $('#q-index'),
    qTotal: $('#q-total'),
    qAxis: $('#q-axis'),
    qText: $('#q-text'),
    qOpts: $('#q-opts'),
    progressBar: $('#progress-bar'),
    backBtn: $('#back-btn'),
    // result
    rPortrait: $('#r-portrait'),
    rName: $('#r-name'),
    rEn: $('#r-en'),
    rGroup: $('#r-group'),
    rMatch: $('#r-match'),
    rRare: $('#r-rare'),
    rHit: $('#r-hit'),
    rDeeper: $('#r-deeper'),
    rPunch: $('#r-punch'),
    rRadar: $('#r-radar'),
    rNotes: $('#r-notes'),
    rSecond: $('#r-second'),
    rRestart: $('#r-restart'),
    rShare: $('#r-share'),
  };

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- 页面切换 ----------
  function go(page) {
    state.page = page;
    ['landing', 'quiz', 'result'].forEach(p => {
      el[p].classList.toggle('is-active', p === page);
    });
    document.body.dataset.page = page;
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
  }

  // ---------- 答题 ----------
  let locking = false;   // 防止连点跳过题目

  function renderQuestion() {
    const q = QUESTIONS[state.index];
    const total = QUESTIONS.length;

    el.qIndex.textContent = state.index + 1;
    el.qTotal.textContent = total;
    el.qAxis.textContent = AXES.find(a => a.key === q.axis).name;
    el.qText.textContent = q.q;
    el.progressBar.style.width = ((state.index) / total * 100) + '%';

    el.backBtn.classList.toggle('is-hidden', state.index === 0);

    if (reduceMotion) el.qOpts.classList.add('no-anim');
    else el.qOpts.classList.remove('no-anim');

    // 选项：从中心依次浮入
    el.qOpts.innerHTML = '';
    q.opts.forEach((o, i) => {
      const btn = document.createElement('button');
      btn.className = 'opt';
      btn.type = 'button';
      btn.dataset.value = o.s;
      btn.innerHTML = '<span class="opt-key">' + 'ABCD'[i] + '</span><span class="opt-text">' + o.t + '</span>';
      btn.style.animationDelay = reduceMotion ? '0ms' : (i * 60) + 'ms';
      btn.addEventListener('click', () => pick(o.s));
      el.qOpts.appendChild(btn);
    });

    // 题干动画
    el.qText.classList.remove('anim-in');
    void el.qText.offsetWidth;
    el.qText.classList.add('anim-in');
  }

  function pick(value) {
    if (locking) return;
    locking = true;

    // 新拟态反馈：被选中的那个凹进去，其余变淡，再切下一题
    const btns = Array.from(el.qOpts.querySelectorAll('.opt'));
    btns.forEach(b => {
      b.disabled = true;
      // dataset 在浏览器里是字符串，这里统一转成字符串比较，避免类型不一致
      if (String(b.dataset.value) === String(value)) b.classList.add('is-picked');
      else b.classList.add('is-dim');
    });

    state.answers[state.index] = value;

    const hold = reduceMotion ? 0 : 190;
    setTimeout(() => {
      state.index++;
      locking = false;

      if (state.index >= QUESTIONS.length) {
        el.progressBar.style.width = '100%';
        setTimeout(finish, reduceMotion ? 0 : 240);
      } else {
        renderQuestion();
      }
    }, hold);
  }

  function back() {
    if (state.index > 0) {
      state.index--;
      state.answers.length = state.index; // 丢弃后面的答案
      renderQuestion();
    }
  }

  // ---------- 出结果 ----------
  function finish() {
    // 把选项分值转成与 QUESTIONS 对齐的对象
    const user = computeAxis(state.answers);
    const res = match(user, PEOPLE);
    state.result = res;
    renderResult(res, user);
    go('result');

    // 记录答完的场次（本地，不上报）
    try {
      const k = 'vpersona_count';
      localStorage.setItem(k, (parseInt(localStorage.getItem(k) || '0', 10) + 1));
    } catch (e) {}
  }

  function renderResult(res, user) {
    const p = res.person;

    // 立绘
    el.rPortrait.src = 'assets/webp/' + (p.img || p.name) + '.webp';
    el.rPortrait.alt = p.name;
    el.rPortrait.classList.remove('anim-rise');
    void el.rPortrait.offsetWidth;
    el.rPortrait.classList.add('anim-rise');

    el.rName.textContent = p.name;
    el.rEn.textContent = p.en;
    el.rGroup.textContent = p.group;
    document.documentElement.style.setProperty('--accent', p.color);

    // 匹配度数字滚动
    countUp(el.rMatch, 0, res.match, reduceMotion ? 0 : 1200);

    // 稀有度标签：只给占比 <3% 的人显示，且必须有专属文案
    if (p.rare && p.rarity >= 1) {
      el.rRare.textContent = p.rare;
      el.rRare.classList.remove('is-hidden');
    } else {
      el.rRare.classList.add('is-hidden');
    }

    el.rHit.textContent = p.copy.hit;
    el.rDeeper.textContent = p.copy.deeper;
    el.rPunch.textContent = p.copy.punch;

    // 雷达图
    drawRadar(el.rRadar, user, p);

    // 五轴注解
    el.rNotes.innerHTML = '';
    AXES.forEach(a => {
      const v = user[a.key];
      const row = document.createElement('div');
      row.className = 'note';
      row.innerHTML =
        '<div class="note-head">' +
          '<span class="note-name">' + a.name + '</span>' +
          '<span class="note-val">' + v + '</span>' +
        '</div>' +
        '<div class="note-text">' + axisNote(a.key, v) + '</div>';
      el.rNotes.appendChild(row);
    });

    // 次结果
    el.rSecond.innerHTML =
      '另外，你和 <b>' + res.second.person.name + '</b> 也有 ' + res.second.match + '% 的相似度。';
  }

  function countUp(node, from, to, dur) {
    if (dur === 0) { node.textContent = to; return; }
    const t0 = performance.now();
    function tick(t) {
      const k = Math.min(1, (t - t0) / dur);
      const eased = 1 - Math.pow(1 - k, 3);
      node.textContent = Math.round(from + (to - from) * eased);
      if (k < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  // ---------- 雷达图（纯 SVG，无依赖） ----------
  function drawRadar(svg, user, person) {
    const W = 280, H = 280, CX = 140, CY = 148, R = 96;
    const keys = ['S', 'C', 'T', 'B', 'R'];
    const N = keys.length;

    const angle = (i) => (Math.PI * 2 * i / N) - Math.PI / 2;
    const pt = (i, r) => {
      const a = angle(i);
      return [CX + Math.cos(a) * r, CY + Math.sin(a) * r];
    };

    let s = '';

    // 网格环
    [0.25, 0.5, 0.75, 1].forEach(f => {
      const pts = keys.map((_, i) => pt(i, R * f).join(',')).join(' ');
      s += '<polygon points="' + pts + '" fill="none" stroke="currentColor" stroke-opacity="' +
           (f === 1 ? 0.22 : 0.1) + '" stroke-width="1"/>';
    });

    // 轴线
    keys.forEach((_, i) => {
      const [x, y] = pt(i, R);
      s += '<line x1="' + CX + '" y1="' + CY + '" x2="' + x + '" y2="' + y +
           '" stroke="currentColor" stroke-opacity="0.08" stroke-width="1"/>';
    });

    // 人物参考多边形（虚线）
    const pPts = keys.map((k, i) => pt(i, R * person.ax[k] / 100).join(',')).join(' ');
    s += '<polygon points="' + pPts + '" fill="none" stroke="' + person.color +
         '" stroke-opacity="0.45" stroke-width="1.5" stroke-dasharray="4 4"/>';

    // 用户多边形
    const uPts = keys.map((k, i) => pt(i, R * user[k] / 100).join(',')).join(' ');
    s += '<polygon points="' + uPts + '" fill="' + person.color +
         '" fill-opacity="0.18" stroke="' + person.color + '" stroke-width="2"/>';

    // 用户顶点
    keys.forEach((k, i) => {
      const [x, y] = pt(i, R * user[k] / 100);
      s += '<circle cx="' + x + '" cy="' + y + '" r="3.5" fill="' + person.color + '"/>';
    });

    // 轴标签
    keys.forEach((k, i) => {
      const [x, y] = pt(i, R + 24);
      const ax = AXES.find(a => a.key === k);
      s += '<text x="' + x + '" y="' + y + '" text-anchor="middle" dominant-baseline="middle"' +
           ' font-size="11" fill="currentColor" fill-opacity="0.55" letter-spacing="0.5">' +
           ax.name + '</text>';
    });

    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.innerHTML = s;
  }

  // ---------- 分享 ----------
  function share() {
    const p = state.result.person;
    const text = '我的 V 圈人格是「' + p.name + '」，匹配度 ' + state.result.match + '%。你是谁？';
    const url = location.href;

    if (navigator.share) {
      navigator.share({ title: '你的 V 圈人格', text: text, url: url }).catch(() => {});
    } else {
      copyText(text + ' ' + url).then(ok => {
        el.rShare.textContent = ok ? '已复制，去粘贴吧' : '复制失败，请手动选择';
        setTimeout(() => { el.rShare.textContent = '分享结果'; }, 2200);
      });
    }
  }

  function copyText(t) {
    if (navigator.clipboard) {
      return navigator.clipboard.writeText(t).then(() => true).catch(() => false);
    }
    return Promise.resolve(false);
  }

  // ---------- 键盘（桌面端） ----------
  document.addEventListener('keydown', (e) => {
    if (state.page !== 'quiz') return;
    if (['1', '2', '3', '4'].includes(e.key)) {
      const btns = el.qOpts.querySelectorAll('.opt');
      const b = btns[parseInt(e.key, 10) - 1];
      if (b) b.click();
    } else if (e.key === 'ArrowLeft') {
      back();
    }
  });

  // ---------- 事件绑定 ----------
  el.startBtn.addEventListener('click', () => {
    state.index = 0;
    state.answers = [];
    renderQuestion();
    go('quiz');
  });

  el.backBtn.addEventListener('click', back);
  el.rRestart.addEventListener('click', () => {
    state.index = 0;
    state.answers = [];
    renderQuestion();
    go('quiz');
  });
  el.rShare.addEventListener('click', share);

  // ---------- 初始化 ----------
  el.qTotal.textContent = QUESTIONS.length;
  // 首页在 HTML 里已带 is-active（保证 JS 未执行时也不白屏），
  // 这里再同步一次内部状态和 body 标记
  go('landing');
})();
