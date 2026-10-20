这是一个构建基于 Next.js 的在线 PDF 工具箱的实施计划，重点在于“液态玻璃”UI 设计、Auth.js 身份验证以及客户端 PDF 处理功能。

# 阶段 1: 项目初始化与基础架构
1.  **初始化 Next.js 项目**:
    *   使用 `create-next-app` 创建项目 (TypeScript, Tailwind CSS, App Router).
    *   配置基本元数据和目录结构。
2.  **安装依赖**:
    *   **核心库**: `pdf-lib` (用于 PDF 分割/修改), `pdfjs-dist` (用于读取内容/提取图片).
    *   **UI/动画**: `framer-motion` (流畅动画), `lucide-react` (图标), `clsx`, `tailwind-merge`.
    *   **身份验证**: `next-auth` (Auth.js).
    *   **工具**: `react-dropzone` (文件拖拽上传).

# 阶段 2: UI/UX 设计 (Apple 液态玻璃风格)
1.  **Tailwind 配置**:
    *   扩展颜色面板，添加用于玻璃拟态的透明度预设。
    *   配置背景网格和 Mesh Gradient (网状渐变) 动画。
2.  **核心组件开发**:
    *   `GlassContainer`: 封装通用的高斯模糊背景、半透明边框和阴影效果。
    *   `LiquidBackground`: 创建流动的背景色彩动画效果。
    *   `NavBar`: 支持登录状态切换的玻璃风格导航栏。

# 阶段 3: 身份验证 (Auth.js)
1.  **配置 NextAuth**:
    *   设置 `auth.ts` 配置文件。
    *   配置 GitHub 或 Google Provider (开发阶段可先使用 Credentials 或 Mock 方便测试)。
    *   创建登录/注册页面 UI。
2.  **路由保护**:
    *   创建 Middleware 确保只有登录用户才能访问特定工具(如果需要限制)或仅仅在前端展示用户信息。

# 阶段 4: PDF 核心功能开发
*鉴于 Vercel 的 Serverless 限制和隐私考虑，我们将优先在**客户端(浏览器)**进行 PDF 处理。*

1.  **PDF 分割功能 (Split)**:
    *   实现文件上传组件。
    *   使用 `pdf-lib` 加载 PDF。
    *   提供 UI 让用户选择分割页面（例如：按页分割、提取特定页）。
    *   生成新的 PDF 并触发下载。
2.  **PDF 图片提取功能 (Image Extract)**:
    *   配置 `pdfjs-dist` 的 Worker (解决 Next.js 环境下的加载问题)。
    *   将 PDF 页面渲染为 Canvas。
    *   将 Canvas 导出为 JPG/PNG 图片供用户打包下载。

# 阶段 5: 页面组装与部署准备
1.  **主页**: 展示工具列表，突出“液态玻璃”视觉效果。
2.  **工具页**: 集成上述功能组件。
3.  **Vercel 部署配置**: 确保环境变量和构建设置正确。

---
**确认事项**:
如果不提供具体的数据库连接，目前 Auth.js 将仅用于演示会话管理（无持久化）或使用无数据库的 OAuth 策略。后期接入支付时再集成数据库（如 Vercel Postgres）。
