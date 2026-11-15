// @ts-check

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'Vintex — Produção',
  tagline: 'GitOps, promoções e governança de releases',

  url: 'https://vintex-ages.github.io',
  baseUrl: '/vintex-prod/',

  organizationName: 'Vintex-Ages',
  projectName: 'vintex-prod',

  onBrokenLinks: 'throw',
  markdown: {
    hooks: {
      onBrokenMarkdownLinks: 'throw',
    },
  },

  i18n: {
    defaultLocale: 'pt-BR',
    locales: ['pt-BR'],
  },

  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          routeBasePath: '/',
          sidebarPath: require.resolve('./sidebars.js'),
          editUrl: 'https://github.com/Vintex-Ages/vintex-prod/tree/develop/documentation/',
        },
        blog: false,
        theme: {
          customCss: require.resolve('./src/css/custom.css'),
        },
      }),
    ],
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      navbar: {
        title: 'Vintex — Produção',
        items: [
          {
            href: 'https://github.com/Vintex-Ages/vintex-prod',
            label: 'GitHub',
            position: 'right',
          },
        ],
      },
      footer: {
        style: 'dark',
        copyright: 'Vintex — gerado a partir de documentation/ no vintex-prod.',
      },
    }),
};

module.exports = config;
