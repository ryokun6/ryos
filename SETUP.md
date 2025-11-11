# 本地运行配置指南

## 环境变量配置

项目中的 API 端点需要以下环境变量才能完整运行。如果只是运行前端界面，可以不配置这些环境变量。

### 创建 .env 文件

**重要**: `.env` 文件已添加到 `.gitignore`，不会被提交到 Git。请将真实密钥保存在 `.env` 文件中，不要提交到版本控制系统。

在项目根目录创建 `.env` 文件，你可以：

1. **复制模板文件**（推荐）:
   ```bash
   cp .env.example .env
   ```

2. **手动创建**:
   ```bash
   touch .env
   ```

然后在 `.env` 文件中添加以下环境变量：

```bash
# ============================================
# AI 模型配置（必需）
# ============================================

# Google Gemini API 配置（用于 AI 聊天、代码生成、图像生成等）
# 从 https://aistudio.google.com/app/apikey 获取
GOOGLE_GENERATIVE_AI_API_KEY=your_google_gemini_api_key_here

# Anthropic Claude API 配置（用于 AI 聊天，默认模型）
# 从 https://console.anthropic.com/settings/keys 获取
ANTHROPIC_API_KEY=your_anthropic_api_key_here

# OpenAI API 配置（用于音频转录）
# 从 https://platform.openai.com/api-keys 获取
OPENAI_API_KEY=your_openai_api_key_here

# ElevenLabs API 配置（用于语音合成 TTS）
# 从 https://elevenlabs.io/app/settings/api-keys 获取
ELEVENLABS_API_KEY=your_elevenlabs_api_key_here

# ============================================
# 基础设施配置（必需）
# ============================================

# Redis 配置（用于速率限制、缓存、聊天认证）
# 从 Upstash Redis 或其他 Redis 服务获取
REDIS_KV_REST_API_URL=your_redis_rest_api_url_here
REDIS_KV_REST_API_TOKEN=your_redis_rest_api_token_here

# Pusher 配置（用于实时聊天功能）
# 从 https://dashboard.pusher.com/ 获取
PUSHER_APP_ID=your_pusher_app_id_here
PUSHER_KEY=your_pusher_key_here
PUSHER_SECRET=your_pusher_secret_here
PUSHER_CLUSTER=us2

# ============================================
# 可选配置
# ============================================

# 开发服务器端口（可选，默认 5173）
PORT=5173
```

### 环境变量详细说明

#### AI 模型配置

##### Google Gemini API（必需）
- **用途**: 
  - AI 聊天功能（`/api/chat`）
  - 代码生成和 HTML 生成（`/api/applet-ai`）
  - 图像生成和编辑（`/api/applet-ai`）
  - 歌词翻译（`/api/translate-lyrics`）
  - 聊天室 AI 回复（`/api/chat-rooms`）
- **支持的模型**: `gemini-2.5-pro`, `gemini-2.5-flash`
- **获取方式**: 
  1. 访问 https://aistudio.google.com/app/apikey
  2. 登录 Google 账号
  3. 创建新的 API 密钥
  4. 复制密钥到 `.env` 文件

##### Anthropic Claude API（必需）
- **用途**: 
  - AI 聊天功能（`/api/chat`，默认模型）
  - 支持多种 Claude 模型版本
- **支持的模型**: `claude-4.5`（默认）, `claude-4`, `claude-3.7`, `claude-3.5`
- **获取方式**: 
  1. 访问 https://console.anthropic.com/settings/keys
  2. 登录 Anthropic 账号
  3. 创建新的 API 密钥
  4. 复制密钥到 `.env` 文件
- **注意**: Claude 4.5 是默认模型，如果没有配置 Anthropic API key，系统会尝试使用其他可用模型

##### OpenAI API（必需）
- **用途**: 
  - 音频转录功能（`/api/audio-transcribe`）
  - 将语音转换为文本
- **获取方式**: 
  1. 访问 https://platform.openai.com/api-keys
  2. 登录 OpenAI 账号
  3. 创建新的 API 密钥
  4. 复制密钥到 `.env` 文件
- **注意**: 需要账户有足够的额度

##### ElevenLabs API（必需）
- **用途**: 
  - 语音合成（TTS，`/api/speech`）
  - 将文本转换为语音
- **获取方式**: 
  1. 访问 https://elevenlabs.io/app/settings/api-keys
  2. 登录 ElevenLabs 账号
  3. 创建新的 API 密钥
  4. 复制密钥到 `.env` 文件
- **默认语音**: Zi v3 (`kAyjEabBEu68HYYYRAHR`)
- **注意**: 免费账户有使用限制，付费账户有更高的配额

#### 基础设施配置

##### Redis 配置（必需）
- **用途**: 
  - 速率限制（防止 API 滥用）
  - 缓存（提高性能）
  - 聊天认证（用户身份验证）
- **获取方式**: 
  - **推荐**: 使用 Upstash Redis（免费层可用）
    1. 访问 https://upstash.com/
    2. 创建账户并新建 Redis 数据库
    3. 复制 REST API URL 和 Token
  - 或其他 Redis 服务（需要支持 REST API）

##### Pusher 配置（必需）
- **用途**: 
  - 实时聊天功能（`/api/chat-rooms`）
  - 多用户实时消息同步
- **获取方式**: 
  1. 访问 https://dashboard.pusher.com/
  2. 创建账户并新建应用
  3. 选择集群（推荐 `us3`）
  4. 复制 App ID、Key、Secret 和 Cluster
- **注意**: Pusher 客户端配置已硬编码在 `src/lib/pusherClient.ts` 中，但服务端 API 仍需要这些环境变量

### AI 模型选择

项目支持多个 AI 模型，默认使用 **Claude 4.5**。你可以在代码中或通过 API 请求指定使用不同的模型：

- **Google Gemini**: `gemini-2.5-pro`, `gemini-2.5-flash`
- **Anthropic Claude**: `claude-4.5`（默认）, `claude-4`, `claude-3.7`, `claude-3.5`
- **OpenAI GPT**: `gpt-5`, `gpt-5-mini`, `gpt-4o`, `gpt-4.1`, `gpt-4.1-mini`

**注意**: 使用不同的模型需要配置对应的 API 密钥。如果某个模型的 API 密钥未配置，系统会回退到其他可用模型。

### 快速配置指南

#### 最小配置（仅 AI 聊天功能）

如果你只想测试 AI 聊天功能，至少需要配置以下环境变量：

```bash
# 必需：AI 聊天（至少配置一个）
GOOGLE_GENERATIVE_AI_API_KEY=your_key_here
# 或
ANTHROPIC_API_KEY=your_key_here

# 必需：基础设施
REDIS_KV_REST_API_URL=your_redis_url_here
REDIS_KV_REST_API_TOKEN=your_redis_token_here
```

#### 完整配置（所有功能）

要使用所有功能（AI 聊天、语音转录、语音合成、实时聊天），需要配置所有环境变量：

```bash
# AI 模型
GOOGLE_GENERATIVE_AI_API_KEY=your_key_here
ANTHROPIC_API_KEY=your_key_here
OPENAI_API_KEY=your_key_here
ELEVENLABS_API_KEY=your_key_here

# 基础设施
REDIS_KV_REST_API_URL=your_redis_url_here
REDIS_KV_REST_API_TOKEN=your_redis_token_here
PUSHER_APP_ID=your_pusher_app_id_here
PUSHER_KEY=your_pusher_key_here
PUSHER_SECRET=your_pusher_secret_here
PUSHER_CLUSTER=us3
```

#### 配置步骤

1. **创建 `.env` 文件**:
   ```bash
   # 复制模板文件（推荐）
   cp .env.example .env
   
   # 或手动创建
   touch .env
   ```

2. **填写真实密钥**:
   - 打开 `.env` 文件
   - 访问对应的服务网站获取 API 密钥
   - 将真实密钥替换 `your_*_here` 占位符
   - **重要**: 不要将 `.env` 文件提交到 Git

3. **验证配置**:
   ```bash
   # 启动开发服务器
   vercel dev
   
   # 或仅启动前端
   bun dev
   ```

### 注意事项

1. **前端运行**: 如果只是运行前端界面，可以不配置这些环境变量
2. **API 功能**: AI 聊天、语音转录等 API 功能需要这些配置才能正常工作
3. **安全性**: `.env` 文件已添加到 `.gitignore` 中，请勿将包含真实密钥的文件提交到版本控制系统
4. **本地 API**: 本地开发时，API 端点需要通过 Vercel CLI 运行才能正常工作（见下方说明）
5. **API 密钥安全**: 
   - 不要在代码中硬编码 API 密钥
   - 不要将 `.env` 文件提交到 Git
   - 生产环境使用 Vercel 的环境变量配置
6. **免费额度**: 大多数服务提供免费额度，但超出后会产生费用，请注意使用量

## API 端点本地运行

项目使用 Vercel Serverless Functions 格式的 API 端点（位于 `api/` 目录）。这些 API 端点包括：
- `/api/chat` - AI 聊天功能
- `/api/audio-transcribe` - 音频转录
- `/api/speech` - 语音合成
- `/api/lyrics` - 歌词搜索
- `/api/chat-rooms` - 聊天室功能
- 以及其他 API 端点

### 方式 1: 使用 Vercel CLI（推荐，支持完整功能）

使用 Vercel CLI 可以同时运行前端和 API 端点：

1. **安装 Vercel CLI**:
   ```bash
   # 使用 npm 全局安装
   npm install -g vercel
   
   # 或使用 bun 全局安装
   bun add -g vercel
   ```

2. **登录 Vercel**（首次使用）:
   ```bash
   vercel login
   ```

3. **链接项目**（可选，如果需要使用 Vercel 的环境变量）:
   ```bash
   vercel link
   ```

4. **启动开发服务器**:
   ```bash
   vercel dev
   ```
   
   这会：
   - 启动前端开发服务器（通常在 http://localhost:3000）
   - 启动所有 API 端点（可通过 `/api/*` 访问）
   - 自动加载 `.env` 文件中的环境变量

### 方式 2: 仅运行前端（不包含 API 功能）

如果只需要查看前端界面，可以直接运行：
```bash
bun dev
```

**注意**: 
- 前端界面可以正常显示和交互
- 但所有 API 功能（如 AI 聊天、语音转录、歌词搜索等）将无法使用
- 适合用于 UI 开发和调试，不适合测试完整功能

### API 端点说明

- **API 路径**: 所有 API 端点位于 `/api/` 路径下
- **CORS 配置**: API 端点已配置 CORS，允许来自 `https://bravohenry.com` 和 `http://localhost:3000` 的请求
- **环境变量**: API 端点需要相应的环境变量才能正常工作（见上方环境变量配置部分）
- **本地开发**: 使用 `vercel dev` 时，API 端点会自动识别 `localhost` 环境并进行相应处理

## 快速开始

1. **安装依赖**:
   ```bash
   bun install
   ```

2. **配置环境变量**（可选）:
   - 创建 `.env` 文件
   - 填写所需的环境变量

3. **启动开发服务器**:
   ```bash
   bun dev
   ```
   或使用 Vercel CLI 运行完整功能:
   ```bash
   vercel dev
   ```

4. **访问应用**:
   - 打开浏览器访问 `http://localhost:5173`（或指定的 PORT）

## Vercel 部署指南

项目已完全配置好 Vercel 部署，可以直接部署到生产环境。

### 部署方式

#### 方式 1: 通过 Vercel Dashboard（推荐）

1. **准备代码仓库**:
   - 将代码推送到 GitHub、GitLab 或 Bitbucket
   - 确保 `.env` 文件已添加到 `.gitignore`（不要提交敏感信息）

2. **在 Vercel 创建项目**:
   - 访问 https://vercel.com/
   - 点击 "Add New Project"
   - 导入你的 Git 仓库
   - Vercel 会自动检测项目配置

3. **配置环境变量**:
   - 在项目设置中，进入 "Environment Variables"
   - 添加所有必需的环境变量：
     ```
     GOOGLE_GENERATIVE_AI_API_KEY=your_key_here
     ANTHROPIC_API_KEY=your_key_here
     OPENAI_API_KEY=your_key_here
     ELEVENLABS_API_KEY=your_key_here
     REDIS_KV_REST_API_URL=your_redis_url_here
     REDIS_KV_REST_API_TOKEN=your_redis_token_here
     PUSHER_APP_ID=your_pusher_app_id_here
     PUSHER_KEY=your_pusher_key_here
     PUSHER_SECRET=your_pusher_secret_here
     PUSHER_CLUSTER=us2
     ```
   - 为不同环境（Production、Preview、Development）分别配置

4. **部署**:
   - 点击 "Deploy"
   - Vercel 会自动运行 `bun install` 和 `bun run build`
   - 部署完成后会获得一个 URL（如 `https://your-project.vercel.app`）

#### 方式 2: 通过 Vercel CLI

1. **安装并登录 Vercel CLI**:
   ```bash
   # 安装
   bun add -g vercel
   # 或
   npm install -g vercel
   
   # 登录
   vercel login
   ```

2. **部署到生产环境**:
   ```bash
   # 首次部署（会引导你完成配置）
   vercel
   
   # 后续部署
   vercel --prod
   ```

3. **配置环境变量**:
   ```bash
   # 添加环境变量
   vercel env add GOOGLE_GENERATIVE_AI_API_KEY production
   vercel env add ANTHROPIC_API_KEY production
   # ... 添加其他环境变量
   
   # 或使用 .env 文件批量导入（需要先链接项目）
   vercel env pull .env.production
   # 编辑 .env.production 文件后
   vercel env push .env.production production
   ```

### 部署配置说明

项目已包含以下 Vercel 配置：

- **`vercel.json`**: 
  - API 路由配置
  - CORS 头部设置
  - 缓存策略
  - URL 重写规则

- **`vite.config.ts`**: 
  - 已配置 `vite-plugin-vercel`
  - 支持 Serverless Functions
  - 自动构建优化

- **`package.json`**: 
  - 包含 `build` 脚本
  - 使用 Bun 作为包管理器

### 部署后检查清单

- [ ] 所有环境变量已正确配置
- [ ] API 端点可以正常访问（如 `/api/chat`）
- [ ] AI 聊天功能正常工作
- [ ] 前端界面正常显示
- [ ] 自定义域名已配置（如需要）
- [ ] HTTPS 证书已自动配置（Vercel 自动提供）

### 环境变量配置建议

**生产环境**:
- 使用强密码和安全的 API 密钥
- 定期轮换密钥
- 监控 API 使用量

**预览环境**:
- 可以使用测试 API 密钥
- 限制使用量以避免费用

**开发环境**:
- 使用本地 `.env` 文件
- 不要提交到 Git

### 常见问题

1. **构建失败**:
   - 检查 `package.json` 中的依赖是否正确
   - 确保 Bun 版本兼容（项目使用 `bun@1.2.19`）
   - 查看 Vercel 构建日志

2. **API 端点 500 错误**:
   - 检查环境变量是否已正确配置
   - 确认 API 密钥有效且有足够额度
   - 查看 Vercel 函数日志

3. **CORS 错误**:
   - 检查 `vercel.json` 中的 CORS 配置
   - 确认请求来源域名已添加到允许列表

4. **环境变量未生效**:
   - 确保环境变量已添加到正确的环境（Production/Preview/Development）
   - 重新部署项目以应用新的环境变量

### 自定义域名

1. 在 Vercel Dashboard 中进入项目设置
2. 选择 "Domains"
3. 添加你的自定义域名（如 `bravohenry.com`）
4. 按照提示配置 DNS 记录
5. Vercel 会自动配置 HTTPS 证书

### 监控和分析

- **Vercel Analytics**: 项目已集成 `@vercel/analytics`，自动收集访问数据
- **函数日志**: 在 Vercel Dashboard 中查看 API 函数执行日志
- **性能监控**: Vercel 提供内置的性能监控工具

