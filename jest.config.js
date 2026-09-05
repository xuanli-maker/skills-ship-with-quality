module.exports = {
  testEnvironment: "jsdom",
  rootDir: ".",
  testMatch: ["<rootDir>/tests/static/**/*.test.js"],
  collectCoverage: true,
  collectCoverageFrom: ["src/static/**/*.js"],
  coverageDirectory: "coverage",
  coverageReporters: ["text", ["cobertura", { file: "coverage-javascript.xml" }]],
};
