/**
 * js/render/ui.js
 * UI 组件渲染助手：负责构建各种交互面板和弹窗。
 */

export function createDecisionModal(decision, onResolve) {
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(0,0,0,0.7); display: flex; justify-content: center;
    align-items: center; z-index: 100; animation: fadeIn 0.3s ease;
  `;

  const card = document.createElement('div');
  card.className = 'panel';
  card.style.cssText = `max-width: 500px; width: 90%; text-align: center; border: 2px solid var(--accent);`;

  card.innerHTML = `
    <h3 style="color:var(--accent)">${decision.title}</h3>
    <p style="margin: 1rem 0; line-height: 1.6;">${decision.prompt}</p>
    <div class="options-grid" id="decision-options"></div>
  `;

  overlay.appendChild(card);
  document.getElementById('event-layer').appendChild(overlay);

  const optionsGrid = card.querySelector('#decision-options');
  let resolved = false;
  decision.options.forEach(opt => {
    const btn = document.createElement('button');
    btn.className = 'opt-btn';
    btn.innerHTML = `<strong>${opt.label}</strong><br><small>${opt.detail}</small>`;
    btn.onclick = () => {
      if (resolved) return;
      resolved = true;
      overlay.remove();
      onResolve(opt.id);
    };
    optionsGrid.appendChild(btn);
  });
}

export function createNotification(text) {
  const toast = document.createElement('div');
  toast.style.cssText = `
    position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
    background: var(--accent); color: #fff; padding: 10px 20px;
    border-radius: 20px; font-size: 0.9rem; z-index: 200;
    animation: slideDown 0.3s ease, fadeOut 3s forwards;
  `;
  toast.textContent = text;
  document.getElementById('event-layer').appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}
