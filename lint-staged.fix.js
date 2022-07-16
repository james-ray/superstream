module.exports = {
  "**/*.rs": ["cargo fmt --"],
  "**/*.{js,jsx,ts,tsx}": ["eslint --fix"],
  "**/*.{ts,tsx}": ["tsc-files --noEmit"],
};
