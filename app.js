/* ════════════════════════════════════════════════════════════
   App framework — Lab 注册 / Tab 切换 / Section 挂载
   Lab 模块（dfa.js、lr0.js）在加载时调用 App.register(...) 注册，
   DOMContentLoaded 之后由本文件统一构建 UI 并激活默认 Lab。
   ════════════════════════════════════════════════════════════ */
const App = (() => {
  const labs = [];                      // {id,label,figNo,disabled,mount,initialized}
  let currentId = null;

  function register(def) {
    labs.push({ initialized: false, ...def });
  }
  function buildTabs() {
    const navEl = document.getElementById('lab-tabs');
    navEl.innerHTML = '';
    labs.forEach((lab) => {
      const btn = document.createElement('button');
      btn.className = 'tab';
      btn.dataset.lab = lab.id;
      btn.disabled = !!lab.disabled;
      btn.innerHTML = `${lab.label}` + (lab.disabled ? ` <span class="badge">敬请期待</span>` : '');
      btn.onclick = () => activate(lab.id);
      navEl.appendChild(btn);
    });
  }
  function buildSections() {
    const area = document.getElementById('lab-area');
    area.innerHTML = '';
    labs.forEach(lab => {
      const sec = document.createElement('section');
      sec.className = 'lab';
      sec.id = lab.id + '-root';
      sec.hidden = true;
      area.appendChild(sec);
    });
  }
  function activate(id) {
    const lab = labs.find(l => l.id === id);
    if (!lab || lab.disabled) return;
    currentId = id;
    // tabs
    document.querySelectorAll('nav .tab').forEach(b => {
      b.classList.toggle('active', b.dataset.lab === id);
    });
    // sections
    labs.forEach(l => {
      const sec = document.getElementById(l.id + '-root');
      if (sec) sec.hidden = (l.id !== id);
    });
    // fig meta
    document.getElementById('fig-meta').textContent = `FIG · ${lab.figNo || '—'}`;
    // mount once
    if (!lab.initialized) {
      lab.mount(document.getElementById(id + '-root'));
      lab.initialized = true;
    } else if (lab.onActivate) {
      lab.onActivate();
    }
  }
  return { register, buildTabs, buildSections, activate };
})();

/* 占位 Lab（用于尚未实现的实验） */
function mountPlaceholder(title, sub) {
  return function(root) {
    root.innerHTML = `
      <div class="placeholder">
        <div class="ph-title">${title}</div>
        <div class="ph-sub">${sub}</div>
      </div>
    `;
  };
}

/* DOM 就绪后再构建 UI；各 Lab 模块的 register 在脚本加载时已经完成 */
window.addEventListener('DOMContentLoaded', () => {
  // 兜底注册：若用户想跳过某个 Lab 模块，仍能看到导航
  App.register({
    id: 'lab4',
    label: '实验四 · SLR(1) 分析表',
    figNo: '03',
    disabled: true,
    mount: mountPlaceholder('实验四', '尚未开始。')
  });

  App.buildTabs();
  App.buildSections();
  // 默认进入 Lab 3（LR(0)）
  App.activate('lab3');
});
