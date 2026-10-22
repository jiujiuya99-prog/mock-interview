# AI 模拟面试平台 — 实现计划

## 设计树（已确认）

| 模块 | 决策 |
|---|---|
| 登录 | 邮箱 + 密码，bcrypt 哈希，服务端 cookie session，SQLite 存用户 |
| 准备页 | 麦克风+摄像头双检测（同时开启才放行）+ 简历（PDF/DOCX/TXT 上传 + 文本粘贴兜底）+ 公司/岗位信息 |
| 面试页 | 左：AI 静态形象 + 语音波形动画；右：我的真实摄像头画面 |
| 语音 | 浏览器原生 ASR（`webkitSpeechRecognition`）+ TTS（`speechSynthesis`），预留云服务接口 |
| 出题 | 面试前一次性由 DeepSeek 生成 5 题（基于简历+公司+岗位），面试中零 AI 依赖 |
| 流程 | 5 题 / 每题限时 2 分钟 / 手动可提前结束 / 不录视频，仅存语音转写 |
| 评分 | DeepSeek 一次输出结构化 JSON：总分 + 5 维（专业知识/项目经验/逻辑表达/沟通表达/岗位匹配）+ 优势 + 不足 + 改进建议 + 总结评语 + 逐题点评 |
| 数据 | SQLite：用户表 + 面试记录表（问答转写 + 报告 JSON） |
| 视觉 | 沿用现有深色渐变风格 |
| 栈 | Node.js（Express）+ better-sqlite3 + 前端 HTML/CSS/JS |
| 部署 | 本地 localhost + ngrok 穿透（HTTPS 满足摄像头安全上下文） |

## 默认决策

- DeepSeek 模型 `deepseek-chat`，key 走 `.env`（`DEEPSEEK_API_KEY`）
- 会话用服务端 cookie session

## 文件结构

```
Default Project/
├── package.json
├── .env              # DEEPSEEK_API_KEY、SESSION_SECRET、PORT（不提交）
├── .env.example
├── .gitignore
├── server.js         # Express 入口
├── lib/
│   ├── db.js         # SQLite 初始化 + 建表
│   ├── auth.js       # 会话中间件
│   ├── resume.js     # pdf/docx/txt 解析
│   └── deepseek.js   # DeepSeek 出题 + 评分
├── public/
│   ├── login.html    # 登录/注册页
│   ├── index.html    # 主应用：准备页 + 面试页 + 结果页
│   ├── app.js        # 前端逻辑
│   └── style.css     # 样式（沿用深色风格）
└── db/               # SQLite 数据文件目录（运行时生成）
```

## API

- `POST /api/auth/register` {email,password}
- `POST /api/auth/login` {email,password}
- `POST /api/auth/logout`
- `GET  /api/auth/me`
- `POST /api/resume/parse` (multipart: file) → {text}
- `POST /api/interview/questions` {resumeText,company,role,jd} → {questions:[...]}
- `POST /api/interview/evaluate` {resumeText,company,role,questions,answers} → {report}（存库）
- `GET  /api/interview/history` → 历史记录列表

## 实现步骤

1. 初始化 Node 项目 + 依赖
2. db.js：SQLite 建表 users/interviews
3. 认证路由
4. 简历解析路由
5. DeepSeek 路由（出题 + 评分）
6. login.html
7. index.html：准备页（设备检测 + 表单）
8. index.html：面试页（双视频 + 语音 + 计时）
9. index.html：结果页（报告渲染）
10. 联调 + ngrok 验证
