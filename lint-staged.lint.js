module.exports = {
  "**/*.rs": ["cargo fmt -- --check"],
  "**/*.{js,jsx,ts,tsx}": ["eslint"],
  "**/*.{ts,tsx}": ["tsc-files --noEmit"],
};
