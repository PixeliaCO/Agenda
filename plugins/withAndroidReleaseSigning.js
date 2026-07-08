const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const RELEASE_SIGNING_CONFIG = `
        release {
            def credentialsJson = rootProject.file("../credentials.json")
            def credentials = new groovy.json.JsonSlurper().parse(credentialsJson)
            storeFile rootProject.file("../" + credentials.android.keystore.keystorePath)
            storePassword credentials.android.keystore.keystorePassword
            keyAlias credentials.android.keystore.keyAlias
            keyPassword credentials.android.keystore.containsKey("keyPassword")
                ? credentials.android.keystore.keyPassword
                : credentials.android.keystore.keystorePassword
        }`;

/** Expo prebuild: wire release signing from credentials.json for local ./gradlew bundleRelease. */
function withAndroidReleaseSigning(config) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const androidRoot = cfg.modRequest.platformProjectRoot;
      if (!androidRoot) {
        return cfg;
      }

      const buildGradlePath = path.join(androidRoot, 'app', 'build.gradle');
      if (!fs.existsSync(buildGradlePath)) {
        return cfg;
      }

      let buildGradle = fs.readFileSync(buildGradlePath, 'utf8');

      buildGradle = buildGradle.replace(/\napply from: "\.\/eas-build\.gradle"\n?/g, '\n');

      const easBuildGradlePath = path.join(androidRoot, 'app', 'eas-build.gradle');
      if (fs.existsSync(easBuildGradlePath)) {
        fs.unlinkSync(easBuildGradlePath);
      }

      if (!buildGradle.includes('credentials.android.keystore.keystorePath')) {
        buildGradle = buildGradle.replace(
          /(\s+debug \{[\s\S]*?\n\s+\})\n(\s+\})/,
          `$1${RELEASE_SIGNING_CONFIG}\n$2`,
        );
      }

      buildGradle = buildGradle.replace(
        /(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig signingConfigs\.debug/,
        '$1signingConfig signingConfigs.release',
      );

      fs.writeFileSync(buildGradlePath, buildGradle, 'utf8');
      return cfg;
    },
  ]);
}

module.exports = withAndroidReleaseSigning;
