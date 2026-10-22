// Random Life 入口模块：把 #boot 的占位文案替换为“引擎就绪”。
// 原生 ES module，无打包器依赖。

function boot() {
  const el = document.getElementById('boot');
  if (el) {
    el.textContent = '引擎就绪';
  }
}

// type="module" 的脚本是 defer 的：一定在文档解析完成之后才执行，
// 此时 DOM 已经可用，不需要再监听 DOMContentLoaded。
boot();
