// Random Life 入口模块：把 #boot 的占位文案替换为“引擎就绪”。
// 原生 ES module，无打包器依赖。

function boot() {
  const el = document.getElementById('boot');
  if (el) {
    el.textContent = '引擎就绪';
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  // DOM 已解析完毕（例如模块被延迟加载）
  boot();
}
