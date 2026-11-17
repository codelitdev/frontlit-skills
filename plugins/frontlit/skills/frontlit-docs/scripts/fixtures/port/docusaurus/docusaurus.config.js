// Fixture only: port.mjs never runs this file.
module.exports = {
  title: "Acme",
  presets: [["classic", { docs: { routeBasePath: "docs", sidebarPath: require.resolve("./sidebars.js") } }]],
};
