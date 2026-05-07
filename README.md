# dev.log — TA Blog

一个为技术美术准备的暗黑风格博客，基于 [Astro](https://astro.build) + Markdown。

## 快速开始

```bash
# 安装依赖
npm install

# 本地开发（默认 http://localhost:4321）
npm run dev

# 构建生产版本
npm run build

# 预览构建产物
npm run preview
```

## 项目结构

```
ta-blog/
├── public/
│   └── favicon.svg
├── src/
│   ├── content.config.ts       ← 内容集合 schema (frontmatter 校验)
│   ├── content/
│   │   └── blog/               ← 所有文章放这里
│   │       ├── post-1.md
│   │       └── post-2.md
│   ├── components/
│   │   ├── Nav.astro
│   │   ├── Footer.astro
│   │   ├── PostItem.astro
│   │   ├── FeaturedPost.astro
│   │   └── FilterBar.astro
│   ├── layouts/
│   │   ├── BaseLayout.astro    ← 全站基础布局
│   │   └── PostLayout.astro    ← 文章页布局
│   ├── pages/
│   │   ├── index.astro         ← 首页（文章列表）
│   │   ├── about.astro         ← 关于页
│   │   └── blog/
│   │       └── [...slug].astro ← 动态文章页
│   └── styles/
│       └── global.css          ← 全局样式
├── astro.config.mjs
├── package.json
└── tsconfig.json
```

## 写新文章

在 `src/content/blog/` 下创建一个 `.md` 文件，frontmatter 必须包含以下字段：

```markdown
---
title: "你的文章标题"
description: "一句话描述，会显示在列表和 SEO meta 里"
pubDate: 2025-04-30
tags: ["Shader", "URP"]
category: shader     # 必须是: shader | math | optimize
featured: false      # 是否在首页置顶（建议只设一篇）
icon: "◈"            # featured 文章封面里显示的字符
---

## 这里是正文

支持完整 Markdown 语法 + 代码高亮。

​```hlsl
half4 frag(v2f i) : SV_Target {
    return _Color;
}
​```
```

文件名会成为 URL 的 slug。例如 `urp-outline.md` 的访问地址是 `/blog/urp-outline`。

## 自定义

### 改主题色

打开 `src/styles/global.css`，顶部 `:root` 里改 CSS 变量：

```css
:root {
  --bg: #060608;          /* 主背景 */
  --cyan: #00ffd1;        /* 主强调色 */
  --amber: #ffb800;       /* 副强调色 */
  --text: #e8e8f0;        /* 正文颜色 */
}
```

### 改字体

在 `src/layouts/BaseLayout.astro` 里替换 Google Fonts 链接，然后改 `global.css` 的 `--font-display` / `--font-mono`。

### 改导航与 Footer

直接编辑 `src/components/Nav.astro` 和 `src/components/Footer.astro`。

### 加分类

在 `src/content.config.ts` 的 `category` 枚举里加新值，再在 `src/components/FilterBar.astro` 的 `filters` 数组里加对应按钮。

## 部署

### Vercel（推荐）

1. 把项目 push 到 GitHub
2. 在 [vercel.com](https://vercel.com) 导入仓库
3. 自动检测 Astro，零配置部署

### Netlify

同上，导入即可。

### GitHub Pages

在 `astro.config.mjs` 里把 `site` 改成你的 Pages 地址，然后用 GitHub Actions 部署。

### Cloudflare Pages

构建命令 `npm run build`，输出目录 `dist`。

## 接下来可以做的

- [ ] 加 RSS feed（装 `@astrojs/rss`）
- [ ] 加 sitemap（装 `@astrojs/sitemap`）
- [ ] 加搜索（用 Pagefind 或 Fuse.js）
- [ ] 加评论（Giscus / Disqus）
- [ ] 加访问统计（Plausible / Umami）

---

Built with HLSL & 咖啡因
