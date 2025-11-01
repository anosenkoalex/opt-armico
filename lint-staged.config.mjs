export default {
  '*.{ts,tsx}': ['pnpm exec eslint --fix'],
  '*.{json,md}': ['pnpm exec prettier -w'],
};
