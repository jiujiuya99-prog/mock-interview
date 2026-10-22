# AI 模拟面试平台（Mock Interview）

基于 **DeepSeek 大模型** 的全流程 AI 模拟面试 Web 平台：上传简历 → AI 智能出题 → 语音作答 → 结构化评分报告。支持浏览器原生语音识别（ASR）与语音合成（TTS），无需任何浏览器插件。

## 功能特性

### 1. 账号与安全
- 邮箱注册 / 登录，密码使用 **bcrypt** 加盐哈希存储
- 服务端 **cookie-session** 会话管理，接口登录态校验

### 2. 面试准备阶段
- **麦克风 + 摄像头双设备检测**（同时就绪才放行面试）
- 简历上传：支持 **PDF / DOCX / TXT** 解析（pdf-parse + mammoth），或直接粘贴文本兜底
- 填写目标公司与岗位，作为 AI 出题依据

### 3. 面试进行阶段
- 左侧 AI 虚拟形象 + 语音波形动画，右侧真实摄像头画面
- 面试前一次性由 DeepSeek 依据「简历 + 公司 + 岗位」**智能生成 5 道题目**
- 每题限时 2 分钟，可手动提前结束，支持语音转文字作答
- 全程不录制视频，仅保存语音转写文本（保护隐私）

### 4. 结构化评分（核心）
DeepSeek 单次调用返回结构化 JSON 报告：

| 维度 | 说明 |
|---|---|
| 总分 | 百分制综合评分 |
| 五维雷达 | 专业知识 / 项目经验 / 逻辑表达 / 沟通表达 / 岗位匹配 |
| 优势与不足 | 文本点评 |
| 改进建议 | 可执行的提升方向 |
| 逐题点评 | 每道题单独反馈 |

### 5. 数据存储
- SQLite 单文件数据库：用户表 + 面试记录表（问答转写 + 报告 JSON）
- 历史面试记录持久化，支持回放查看

## 技术栈

| 层 | 技术 |
|---|---|
| 后端 | Node.js + Express 5 |
| 数据库 | SQLite（better-sqlite3） |
| AI | DeepSeek API（OpenAI 兼容协议，出题 + 评分） |
| 前端 | 原生 HTML / CSS / JavaScript（深色渐变 UI） |
| 语音 | Web Speech API（`webkitSpeechRecognition` ASR + `speechSynthesis` TTS） |
| 文档解析 | pdf-parse（PDF）、mammoth（DOCX） |
| 认证 | bcryptjs + cookie-session + multer 文件上传 |

## 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量（复制模板并填入你的 Key）
cp .env.example .env
# 编辑 .env：DEEPSEEK_API_KEY=sk-xxxx

# 3. 启动服务
npm start        # 或 npm run dev

# 4. 打开浏览器
# http://localhost:3000
```

> 没有 DeepSeek Key 可在 [platform.deepseek.com](https://platform.deepseek.com) 申请。

### 环境变量（.env）

| 变量 | 说明 | 默认值 |
|---|---|---|
| `DEEPSEEK_API_KEY` | DeepSeek API 密钥（必填） | - |
| `DEEPSEEK_MODEL` | 模型名称 | `deepseek-chat` |
| `DEEPSEEK_BASE_URL` | API 地址 | `https://api.deepseek.com` |
| `PORT` | 服务端口 | `3000` |
| `SESSION_SECRET` | 会话签名密钥（随机字符串） | - |

## 项目结构

```
mock-interview/
├── server.js            # Express 入口：路由 + 静态资源 + 会话
├── lib/
│   ├── db.js            # SQLite 初始化与连接
│   ├── auth.js          # bcrypt 密码校验 / 登录态
│   ├── deepseek.js      # DeepSeek 调用：出题 Prompt + 评分 JSON 解析
│   └── resume.js        # 简历解析（PDF/DOCX/TXT）
├── public/
│   ├── index.html       # 面试主界面（准备 → 面试 → 报告）
│   ├── login.html       # 登录注册
│   ├── app.js           # 前端逻辑：设备检测/ASR/TTS/计时/渲染
│   └── style.css        # 深色渐变 UI
├── db/                  # SQLite 数据库文件（gitignore）
├── .env.example         # 环境变量模板
└── PLAN.md              # 设计决策文档
```

## 设计亮点

1. **面试中零 AI 依赖**：5 道题在面试开始前一次性生成，面试过程无网络等待、无卡顿
2. **评分单次调用**：一次 API 请求拿回完整结构化报告，降低成本与延迟
3. **渐进增强的语音方案**：优先浏览器原生 ASR/TTS（零成本），预留云服务接口可平滑升级
4. **隐私保护**：不录制视频，仅保存语音转写文本

## License

MIT
