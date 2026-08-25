# 🐱 anime-pet-widget — DSH 二次元宠物陪伴插件

> 一只住在 DeepSeek Harness（DSH）网页界面 **右下角** 的小宠物「小窝兽」。
> 它会**根据 Agent 状态做出不同反应**，并用 Web Audio **实时合成声音**——
> 当任务完成时，它会高高兴兴地唱出一段完成琶音。🎉

这是一个类型为 **动态 Cordis 插件（Dynamic Cordis Plugin）** 的项目：它临时挂载到当前 DSH 进程，
不修改任何仓库源码或配置，卸载时自动清理所有副作用。仓库中的 `host.js` 与 `client.js`
即插件的两半（Host 半 + Client 半），可直接交给 DSH 的 `cordis_define` 工具加载。

---

## ✨ 功能特性

| 特性 | 说明 |
| --- | --- |
| 📌 右下角常驻 | 挂在 `shell.overlay` 全局浮层，`position: fixed; right: 20px; bottom: 20px`，位于所有栏位之上 |
| 🐾 可爱形象 | 粉色渐变胶囊里一只小猫 🐱，带呼吸 / 工作跳动 / 庆祝 / 难过的 CSS 动画 |
| 💬 状态气泡 | 实时显示当前状态文案（等主人 / 努力工作中 / 完成啦 / 出错了） |
| 🔊 不同声音 | 根据 Agent 状态切换：**开始音**、**完成音**、**出错音** |
| 🎵 实时合成 | 用 Web Audio（`AudioContext` + 振荡器）现场合成三个音效，**无需任何音频文件**、无网络请求 |
| ✅ 任务完成提示 | 监听 `idle ⇄ running` 切换，在 `running → idle` 时播放"完成任务"的 do-mi-sol-do 琶音 |
| 🔇 一键静音 | 胶囊上的 🔊 / 🔇 按钮可随时开关声音 |
| 🧹 自动清理 | 所有监听 / 处理器 / 定时器 / 样式均归属当前 Cordis Fiber，停止或更新插件时一并移除 |

---

## 🔧 工作原理

### 架构总览

```
                ┌───────────────────────────  DSH 主机进程  ───────────────────────────────┐
                │  host.js (Host 半)                                                       │
                │                                                                            │
                │   ctx.on('agent/status')  ─── idle ⇄ running ──┐                          │
                │   ctx.on('agent/error')   ─── errored ────────┤                          │
                │                                                ▼                          │
                │                                     { status, errored } ← 纯标量快照      │
                │                                                │                          │
                │                 harness.handle('anime-pet:status')  ◀───── 轮询           │
                └────────────────────────────────────────────────────────────────────────────┘
                                            ▲  host.call (JSON RPC, Client→Host)
                                            │
                ┌───────────────────────────  浏览器页面  ───────────────────────────────────┐
                │  client.js (Client 半)                                                    │
                │                                                                            │
                │   styles.insert(css)  ───── 注入样式                                       │
                │   slots.register('shell.overlay', id:'anime-pet')  ── 右下角渲染            │
                │   AudioFX 合成器  ──── 开始/完成/出错 三音效                              │
                └────────────────────────────────────────────────────────────────────────────┘
```

### 用到的 DSH 能力（全部通过 Inspect Provider 查询确认）

- **Host 事件** `agent/status`：Agent 状态变化 `idle ⇄ running`——这是触发"开始工作"与"任务完成"声的关键。
- **Host 事件** `agent/error`：某一步或某轮出错——宠物据此播放"抱歉"音并显示 😿。
- **Host Builtin** `harness.handle`：注册插件私有的 JSON 处理器，供 Client 侧 `host.call` 调用。
- **Client Slot** `shell.overlay`：全窗口浮层（frame-wide，位于所有柱 / 滚动容器之外，默认点击穿透、由条目自行开启 pointer-events）。
- **Client Service** `timer`：`ctx.interval`（每 650ms 轮询状态）与 `ctx.timeout`（完成/出错后延时恢复）。
- **Client Builtin** `styles.insert` / `host.call` / `React`：注入样式、调用 Host、构建 UI。

### 状态机

| Agent 状态 | 宠物表现 | 音效 |
| --- | --- | --- |
| `idle` | 小猫 🐱 缓慢呼吸，"主人，我在等你哦～" | 无 |
| `running` | 上下跳动，"努力工作中！加油！" | 开始音（柔和的上升“咕”音） |
| `running → idle`（任务完成） | 庆祝动画 🎉，"完成啦！🎉" | **完成音**（do-mi-sol-do 琶音） |
| 出错 | 😿 晃动，"唔…刚刚出错了…" | 偏低沉的"抱歉"音 |

> 说明：浏览器默认禁止在用户与页面交互前自动播放声音。插件在页面**第一次 `pointerdown`** 时
> 调用 `AudioContext.resume()` 解锁音频——所以在页面里随便点一下，声音即可正常响起。

---

## 📦 安装与运行（在 DSH 中加载）

本插件是**运行时动态插件**，无需全局安装或改动仓库：

1. 打开 DSH Web 界面，进入一个会话。
2. 让 Agent 调用 `cordis_define` 工具，并传入 `dist/cordis-package.json` 的内容（可由下方脚本生成）。
3. 用 `cordis_run` 激活该 Package（`mode: "run"`），Client 半会弹出**授权请求**——点击"允许/批准"。
4. 刷新或直接观察页面右下角，小窝兽就会出现。

### 一键生成 `dist/cordis-package.json`

```bash
node scripts/build-package.mjs
```

该脚本读取 `host.js` + `client.js`，输出可直接粘贴进 `cordis_define` 的 JSON。

### 手动加载（示意）

`cordis_define` 的 `code.host` 与 `code.client` 分别是两个**普通 JavaScript 函数体**（非 TS / 非 JSX）：

- `code.host` ← 取自 `host.js` 的 `return { apply(ctx) { … } }`
- `code.client` ← 取自 `client.js` 的 `return { inject, apply(ctx) { … } }`

两个半区各自在对应平台运行，并共享同一个 `pluginId` / `packageId`。

---

## 🎛️ 使用说明

- **静音 / 开启声音**：点击胶囊上的 🔊 或 🔇。
- **解锁声音**：任何一次页面点击即可（自动播放策略所致）。
- **更换宠物名**：编辑器里改 `AnimePet` 组件中的 `'小窝兽'`。
- **更换形象**：改 `.pet-face` 里的 emoji（见"自定义"）。

---

## 🎨 自定义

### 改形象（emoji）

在 `client.js` 的 `AnimePet` 组件中修改 `face`：

```js
const face =
  phase === 'done'
    ? status === 'running' ? '✨' : '🎉'
    : phase === 'error' ? '😿' : '🐱';   // ← 把 🐱 换成 🐰 / 🐹 / 🦊 / 🐶 …
```

### 改配色 / 动画

颜色在 `PET_CSS` 中：

```css
.pet-body {
  background: linear-gradient(135deg, #ffd6e7, #d6e4ff);  /* ← 胶囊渐变 */
}
.pet-bubble { border: 2px solid #ffd6e7; }               /* ← 气泡边框 */
```

### 改声音（Web Audio 音高 / 旋律 / 强弱）

所有合成都集中在 `AudioFX`，例如完成音是五音上行琶音：

```js
complete: () => {
  tone(523.25, 0,    0.16, 'triangle', 0.18);  // do
  tone(659.25, 0.14, 0.16, 'triangle', 0.18);  // mi
  tone(783.99, 0.28, 0.16, 'triangle', 0.18);  // sol
  tone(1046.5, 0.42, 0.34, 'triangle', 0.2);   // do' (高)
  tone(1318.5, 0.48, 0.3,  'sine',     0.1);   // 亮泛音
}
```

---

## 📁 目录结构

```
anime-pet-widget/
├─ host.js                     # Host 半：监听 Agent 状态，提供 RPC（status/errored）
├─ client.js                   # Client 半：右下角渲染 + Web Audio 合成 + 状态轮询
├─ scripts/
│  └─ build-package.mjs        # 读取 host.js/client.js → 输出 cordis_define 载荷
├─ package.json                # 项目元数据（DSH 插件，非 npm 发布包）
├─ LICENSE                     # MIT
├─ .gitignore
└─ README.md
```

---

## 🔬 技术细节

- **没有音频文件、没有网络请求**：三个音效全部由 `AudioContext` 的 `OscillatorNode` + `GainNode` 实时合成，体积最小、最可控。
- **JSON 边界严格**：Host 与 Client 只通过 `host.call` 传递 `{ status: 'idle'|'running', errored: boolean }` 这类纯标量，绝不序列化任何 Service / Session / Agent 存活对象。
- **副作用可逆**：`ctx.on`、`harness.handle`、`ctx.interval`、`ctx.timeout`、`styles.insert` 全部由当前 Fiber 持有；`cordis_stop` / `cordis_update` / `cordis_undefine` 会一次性清理。
- **仅使用纯 JS**：两端都不使用 TS / JSX / import；UI 用 `React.createElement` 构建。
- **轮询而非长连接**：Client 每 650ms 调用一次 `host.call('anime-pet:status')`，足以捕捉空闲↔运行切换，成本极低。

---

## ⚠️ 兼容性与注意事项

- 依赖 **DSH 动态 Cordis 插件运行时**（`cordis_define` / `cordis_run` 工具）。若你的 Harness 版本没有这些工具，本插件无法加载。
- 声音需要**浏览器支持 Web Audio**（现代 Chrome / Edge / Firefox / Safari 均可）。
- 自动播放依赖用户与页面的一次交互；若完全无人操作页面则不会出声（动画与文案不受影响）。

---

## 📄 许可

[MIT](./LICENSE)

---

## 🙏 关于

为 DeepSeek Harness（DSH）开发的一个小玩具，欢迎 fork / 改造成你自己的专属宠物。
如果你给它加了可爱的新形象或好听的音效，欢迎提 PR 分享～ 🐾

---

## 🇬🇧 English

**anime-pet-widget** is a Dynamic Cordis Plugin for **DeepSeek Harness (DSH)**. It renders a kawaii pet pinned to the **bottom-right** of the web GUI and reacts to the Agent state with **synthesized sounds** (Web Audio, no assets needed). When a task finishes (`running → idle`), the pet plays a cheerful completion arpeggio.

**How to load:** hand `dist/cordis-package.json` (from `node scripts/build-package.mjs`) to the DSH `cordis_define` tool, then `cordis_run` it and approve the Client authorization.

**Files:** `host.js` (Host half — listens to `agent/status` / `agent/error`, serves `{ status, errored }` over `harness.handle`), `client.js` (Client half — mounts in the `shell.overlay` slot, polls every 650 ms via `host.call`, and synthesizes start/complete/error sounds). License: MIT.
