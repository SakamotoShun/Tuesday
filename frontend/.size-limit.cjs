// Size budgets for production frontend chunks. Run `bun run build` first.
// Run `bun run size` locally. CI runs this in warn-only mode initially.

module.exports = [
  {
    name: "Initial shell HTML (gzipped)",
    path: ["dist/index.html"],
    limit: "10 kB",
    gzip: true,
    running: false,
  },
  {
    name: "Vendor (react / react-dom / router)",
    path: ["dist/assets/vendor-*.js"],
    limit: "60 kB",
    gzip: true,
    running: false,
  },
  {
    name: "Query client",
    path: ["dist/assets/query-*.js"],
    limit: "45 kB",
    gzip: true,
    running: false,
  },
  {
    name: "Project detail route",
    path: ["dist/assets/project-detail-*.js"],
    limit: "60 kB",
    gzip: true,
    running: false,
  },
  {
    name: "Doc page route",
    path: ["dist/assets/doc-page-*.js"],
    limit: "20 kB",
    gzip: true,
    running: false,
  },
  {
    name: "Chat code highlighter (lazy)",
    path: ["dist/assets/code-block-*.js"],
    limit: "120 kB",
    gzip: true,
    running: false,
  },
]
