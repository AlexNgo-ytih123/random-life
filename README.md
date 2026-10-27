# Random Life — 随机人生

一个零构建、零运行时依赖的网页人生模拟器。玩家被随机生在地球某处，依该地真实统计数据活完一生；相同 seed 可复现同一条人生。

## 启动方式（PowerShell）

```powershell
cd "D:\PilotDeck项目"
node tools\launch.mjs
```

启动后浏览器会在本地端口自动打开。也可手动运行：

```powershell
npm start
```

然后打开 `http://localhost:8080/`。

## 常用命令

```powershell
npm test               # 全量测试
npm run build-map       # 重建 data/map.json
npm run fetch-data      # 重抓并重建所有静态数据
```

## 结构

- `js/edition/`：主游戏逻辑（出生、轨迹、事件、决策、商店、存档）。
- `js/render/`：像素渲染与 UI 帮助函数。
- `data/edition/`：本地数据集。
- `data/*.json`：构建期世界统计数据。
- `tools/`：数据抓取、launch server。
- `tests/`：`node:test` 单元与集成测试。

## 游戏体验流

1. Landing：语言/种子/出生年份选择。
2. 出生仪式：展示出生国家与身份。
3. 年度：推进一年；处理 focus/decision/reflection。
4. 结局：死因、生存概率、记录入 past-lives archive（最多 50 条）。
5. 分享：种子对应的 deterministic 生命序列可复现。

## 部署

纯静态资源，适合 GitHub Pages。workflow 可后续追加。

## License

MIT.
EOF