# 实现提示词：Atlas 多智能体房产顾问平台

> 一份可直接喂给编码 Agent 的完整中文实现提示词。
> 设计来源：Claude Design 交付包「多智能体房产顾问」（Atlas）。已读完 README、聊天记录、index.html 及其全部导入。

---

## 一、项目定位

构建一个**企业级 AI Agent 操作平台**，而非传统房产网站。它把多智能体系统、RAG 知识库、MCP 工具调用、AI 对话、深度研究、工作流编排、数据可视化与房产决策融为一体。面向中国市场（人民币 ¥ 计价、北京各区数据、中英双语）。

**设计风格**：Apple + OpenAI + Linear + Notion 的高端 SaaS 气质；深色主题、玻璃拟态（Glassmorphism）、渐变光效、柔和阴影、16px 圆角、留白充裕、现代字体、未来感、极简、奢华企业软件。

## 二、技术栈（严格遵守）

- **前端**：React 18 + TypeScript（严格模式）+ Vite 5 + TailwindCSS 3 + Framer Motion 11 + Recharts 2 + Lucide React + Zustand 5 + React Router 6 + Axios
- **3D**：Three.js
- **后端（参考契约）**：FastAPI + LangGraph + OpenAI 兼容 API
- **数据库**：PostgreSQL
- **地图**：Mapbox（无 token 时降级为风格化 SVG 区域图）
- **要求**：TypeScript 严格模式、完整类型定义、组件化、可维护架构；不允许 TODO、占位组件、伪代码；生产级代码。

## 三、设计令牌（CSS Variables，务必精确还原）

```
--bg:#0B1020  --bg-2:#0E1426
--primary:#4F7CFF  --secondary:#00D4FF  --accent:#7C3AED
--success:#10B981  --warning:#F59E0B  --danger:#F43F5E
--text:#FFFFFF  --sub:#94A3B8  --muted:#64748B
玻璃面:rgba(255,255,255,0.03~0.07);边框 rgba(255,255,255,0.08);模糊 blur(20px) saturate(150%)
主渐变 135deg #4F7CFF→#00D4FF;彩虹渐变 #7C3AED→#4F7CFF→#00D4FF
圆角 sm10/16/lg22/xl28/pill999;侧栏 264px;顶栏 68px;最大宽 1440px
字体:系统无衬线 + JetBrains Mono(数字/标签);缓动 cubic-bezier(0.16,1,0.3,1)
```

深浅双主题（`data-theme` 切换），语言/主题持久化到 localStorage。

## 四、布局骨架

`AppShell` = 固定侧栏（品牌 + 三组导航：工作台 / 智能中枢 / 运营管理 + 用户卡）+ 顶栏（标题、面包屑、搜索框 ⌘K、中英切换、主题切换、通知、升级按钮）+ 内容区（Framer Motion 页面切换）。背景全局极光渐变 + 首页粒子网络画布（鼠标视差）。响应式：≤1100px 侧栏抽屉化。

## 五、五大核心智能体（顺序管线）

```
Search Agent → Market Agent → Investment Agent → Mortgage Agent → Coordinator Agent
```

- **Search**：房源搜索、推荐、筛选
- **Market**：区域分析、房价趋势、热度预测
- **Investment**：ROI 分析、回报率计算、风险分析
- **Mortgage**：房贷计算、首付分析、银行方案推荐
- **Coordinator**：汇总所有 Agent 结果、生成最终报告与购房建议

**状态机**（Zustand `agentStore` 驱动，Framer Motion 动画）：
`idle → thinking → running → completed`；错误分支 `idle → running → error`。
可视化工作流逐级点亮、连线流动。仪表盘另展示共 10 个专业智能体（再加学区、法律、交通、政策、联网搜索）。

## 六、页面清单（15 页，逐页还原）

1. **Dashboard**：Hero（粒子 + 轨道环）、实时指标（总用户 / 活跃 Agent / 今日分析量 / 推荐房源 / ROI 均值 / 风险评分，数字滚动 + 迷你 Sparkline）、Agent 中心卡片网格、Agent 协同 SVG 节点图。
2. **房源搜索**：20 套 Mock 房源、Skeleton 渐进加载、收藏、标签筛选；房源卡含图片占位 / 标题 / 区域 / 面积 / 总价 / 单价 / 收藏 / Hover 动画。
3. **市场分析**：房价趋势（面积图）、区域热度（柱）、房源分布（饼）、区域明细表。
4. **投资分析**：ROI 预测（柱 + 面积复合图）、风险雷达图、风险维度条。
5. **房贷分析**：可交互月供测算器（总价 / 首付比 / 年限 / 利率 → 月供 / 首付 / 总利息）+ 银行方案推荐排序。
6. **AI 报告**：工作流运行器 + Coordinator 报告（综合评分、推荐等级、投资建议、风险提示、贷款建议、分项评分进度条）。
7. **AI 对话**：多智能体流式对话，工具调用 trace、引用来源、参与 Agent 开关面板、模型切换。
8. **工作流编排**：节点画布（平移 / 缩放、拖拽、调色板、检查器、运行动画、连线流动小球）。
9. **知识库（RAG）**：统计、拖拽上传区、文档列表（向量化进度）、切片 / 检索测试 / 知识图谱三页签。
10. **MCP 工具**：工具市场，分类筛选 + 连接开关（高德 / 腾讯地图 / 天气 / 搜索 / 数据库 / CRM / 支付 / 邮件 / 日历 / 分析）。
11. **楼市情报（GIS）**：北京区域地图，价格热力 / 学区 / 交通 / 人口密度可切换图层 + 区域分析侧栏。
12. **数据大屏**：多面板实时图表 + 实时时钟 + 热力网格。
13. **权限中心**：RBAC 权限矩阵（模块 × 操作 toggle）、成员、部门；按钮级权限控制。
14. **监控中心**：实时 Token/API 折线、延迟仪表、日志流、WebSocket 连接网格。
15. **设置中心**：个人资料、外观（主题 / 语言 / 减少动效）、安全（2FA / 会话）、SSO & OAuth、计费、通知。

## 七、图片功能清单实现要求（除移动端外全部覆盖）

按工程能力组织，每项都要有**真实可运行的演示**，而非仅文案：

### 7.1 已由上述页面覆盖的能力

可视化数据大屏、性能优化（seeded 数据 / memo / 组件拆分）、RBAC 权限控制、国际化与主题切换、AI 对话与深度思考、RAG、多模态与联网搜索、agent、地图、埋点监控、WebSocket（监控页实时网格 + 用 WebSocket/SSE 驱动监控与对话流）。

### 7.2 需新增的可复用前端能力

请实现成独立组件，并在「能力中心 / Capabilities」页聚合演示：

- **大文件分片上传**：`File.slice` 分片 + 并发上传 + 断点续传 + 秒传（SparkMD5 / Web Crypto 计算 hash）+ 进度条 + 暂停 / 恢复；后端契约 `POST /upload/chunk`、`POST /upload/merge`、`GET /upload/check`。
- **封装虚拟滚动组件（长列表）**：支持上万条房源 / 日志的定高 / 不定高虚拟列表，只渲染可视区，平滑滚动，带 overscan。
- **OSS 文件存储 + 手机号验证码登录**：登录页含手机号 + 短信验证码（60s 倒计时）流程；文件直传 OSS 的前端签名直传演示（降级为 Mock）。
- **双 token + 单点登录（SSO）**：access / refresh 双 token，Axios 拦截器自动静默刷新、401 重试队列；SSO 提供商连接（Google / 飞书 / 企业微信 / Microsoft）。
- **文生图、问生视频（多模态生成）**：对话中支持文本 → 图片、文本 → 视频任务卡（生成中 / 完成状态、进度、结果占位），走 OpenAI 兼容多模态接口契约。
- **语音转文字、AI 实时对话**：浏览器 `MediaRecorder` 录音 → STT；实时语音对话（WebSocket/WebRTC 流式），含波形可视化。
- **ThreeJS**：楼盘 / 户型 3D 展示或数据大屏 3D 地球 / 楼宇可视化（`three` r128，避免 OrbitControls/CapsuleGeometry，改用基础几何体）。
- **WebWorker**：把分片 hash 计算、大数据聚合、虚拟列表测算等重计算放进 Worker，主线程不卡顿。

### 7.3 仅写入「系统架构 / 部署」文档说明、不强制前端实现的能力

（后端 / 基础设施，移动端除外）：Docker 容器化部署、CI/CD、支付宝支付（可做前端发起 + 回调占位）、monorepo、微前端（qiankun / Module Federation 方案说明）、微服务（FastAPI 拆分 + LangGraph 编排）。

**移动端适配、移动端打包上架 跳过。**

## 八、数据要求

生成真实 Mock 数据：≥20 套房源、12 个月房价、ROI、风险评分、贷款方案、Agent 执行结果、区域热度、知识库文档、监控时序、权限 / 成员 / 部门。无 `VITE_API_BASE` 时全部走 Mock（带真实延迟），配置后切换到 FastAPI + LangGraph 真实后端，服务层契约统一。

## 九、动效要求（Framer Motion）

页面切换、Agent 流转、卡片 Hover、图表加载、Skeleton、渐进式加载、状态脉冲、连线流动。尊重 `prefers-reduced-motion`。

## 十、目录结构

```
src/
  components/{layout,agents,charts,property,report,ui,upload,virtual,three,media,auth}
  pages/  (上述 15 页 + Capabilities 能力中心)
  services/{api.ts,agentService.ts,uploadService.ts,authService.ts}
  store/{uiStore.ts,agentStore.ts,authStore.ts}
  workers/  (hash.worker.ts 等)
  types/  i18n/  lib/  mock/  styles/
```

## 十一、交付与自检（强制）

完成后执行完整 Self-Review：

1. 结构（无缺失 / 循环依赖 / 未用变量）
2. TypeScript（零报错、类型完整、不滥用 any）
3. UI 与设计稿一致、深色模式、Hover、动效
4. 五个 Agent 功能与状态流
5. 全部图表渲染
6. 新增能力（分片上传 / 虚拟滚动 / ThreeJS / WebWorker / 语音 / 多模态）真实可用
7. 性能（无重渲染 / 死循环 / 内存泄漏）
8. `npm install && npm run dev && npm run build` 全通过、零 console error/warning
9. 代码质量
10. 逐项修复至全部通过

最后输出 **Verification Report**（已完成模块 / 功能、修复问题、项目结构、验证结果），达到 Production Ready 再结束。
