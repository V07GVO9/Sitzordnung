// Karma-Konfiguration. Nötig, damit die Tests auch dort laufen, wo Chrome
// ohne eigene Sandbox gestartet werden muss - etwa in einem Container.
module.exports = function (config) {
  config.set({
    frameworks: ['jasmine'],
    reporters: ['progress'],
    browsers: ['ChromeHeadlessNoSandbox'],
    customLaunchers: {
      ChromeHeadlessNoSandbox: {
        base: 'ChromeHeadless',
        flags: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
      },
    },
    restartOnFileChange: true,
  });
};
