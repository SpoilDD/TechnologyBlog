import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://kiteaidan.vercel.app',
  markdown: {
    shikiConfig: {
      theme: 'github-dark-default',
      wrap: true,
    },
  },
});
