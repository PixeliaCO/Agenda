const { withProjectBuildGradle } = require('expo/config-plugins');
const generateCode = require('@expo/config-plugins/build/utils/generateCode');

const notifeeMavenRepo = `
    maven {
      url "$rootDir/../node_modules/@notifee/react-native/android/libs"
    }`;

/** Expo prebuild: Notifee ships native libs in node_modules, not Maven Central. */
function withNotifeeMavenRepo(config) {
  return withProjectBuildGradle(config, (cfg) => {
    const { contents } = generateCode.mergeContents({
      newSrc: notifeeMavenRepo,
      tag: 'notifeeMavenRepo',
      src: cfg.modResults.contents,
      anchor: /maven\s*\{\s*url\s*'https:\/\/www\.jitpack\.io'\s*\}/,
      comment: '//',
      offset: 1,
    });
    cfg.modResults.contents = contents;
    return cfg;
  });
}

module.exports = withNotifeeMavenRepo;
