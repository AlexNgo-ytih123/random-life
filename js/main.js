import { createGameApp } from './edition/app.js';
const app = createGameApp();
window.addEventListener('DOMContentLoaded', () => app.init());
export { app };
