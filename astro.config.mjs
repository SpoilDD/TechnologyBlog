import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://your-domain.com',
  markdown: {
    shikiConfig: {
      theme: 'github-dark-default',
      wrap: true,
    },
  },
});
