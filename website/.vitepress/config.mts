import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'kundol',
  description: 'The developer storage cleanup manual: inspect, review, optimise.',
  base: '/kundol/',
  lang: 'en-US',
  sitemap: { hostname: 'https://vikz91.github.io/kundol/' },
  head: [['link', { rel: 'icon', href: '/kundol/logo.png' }]],
  themeConfig: {
    logo: '/logo.png',
    search: { provider: 'local' },
    nav: [
      { text: 'Manual', link: '/getting-started' },
      { text: 'Commands', link: '/reference/cli' },
      { text: 'Rules', link: '/reference/rules' },
    ],
    sidebar: [
      { text: 'Use kundol', items: [
        { text: 'Getting started', link: '/getting-started' },
        { text: 'Usage and examples', link: '/usage' },
        { text: 'Safety and selection', link: '/safety' },
        { text: 'Docker sandbox', link: '/sandbox' },
        { text: 'Troubleshooting', link: '/troubleshooting' },
      ] },
      { text: 'Reference', items: [
        { text: 'Command reference', link: '/reference/cli' },
        { text: 'Rule catalogue', link: '/reference/rules' },
      ] },
      { text: 'Contribute', items: [
        { text: 'Architecture', link: '/architecture' },
        { text: 'Registry guide', link: '/registry' },
        { text: 'Contributing', link: '/contributing' },
      ] },
    ],
    socialLinks: [{ icon: 'github', link: 'https://github.com/vikz91/kundol' }],
    footer: { message: 'Released under the MIT License.' },
  },
  markdown: {
    config(md) {
      const fence = md.renderer.rules.fence!
      md.renderer.rules.fence = (tokens, index, options, env, self) => {
        const token = tokens[index]
        if (token.info.trim() === 'mermaid') {
          return `<MermaidDiagram code="${md.utils.escapeHtml(token.content)}" />`
        }
        return fence(tokens, index, options, env, self)
      }
    },
  },
})
