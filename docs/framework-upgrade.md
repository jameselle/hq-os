# Framework Security Upgrade

HQ uses Next.js 16.3.8 and React 19.3, with asynchronous cookies and route parameters. The production build explicitly uses webpack to preserve the established build path. Use Node.js 20.9 or newer, as required by Next.js 16.

Verification: `npm audit`, `npm test`, and `npm run test:e2e`. The browser suite checks CEO and dynamic department routes as well as business switching, brand assets, email previews and legacy redirects. Tests use disposable synthetic data, not live customer adapters.

After building, restart the local HQ service and check the running pages. Keep the service bound to loopback. A clean dependency audit is not a complete application security assessment.

Migration references: [Next.js 15](https://nextjs.org/docs/app/guides/upgrading/version-15) and [Next.js 16](https://nextjs.org/docs/app/guides/upgrading/version-16).
