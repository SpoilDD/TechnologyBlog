import { defineConfig } from 'astro/config';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

export default defineConfig({
  site: 'https://kiteaidan.vercel.app',
  markdown: {
    shikiConfig: {
      theme: 'github-dark-default',
      wrap: true,
      langs: ['hlsl', 'glsl'],
    },
    remarkPlugins: [remarkMath],
    rehypePlugins: [rehypeKatex],
  },
});
