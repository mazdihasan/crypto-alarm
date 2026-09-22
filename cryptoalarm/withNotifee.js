const { withProjectBuildGradle } = require('@expo/config-plugins');

/**
 * Custom Expo config plugin that adds the local Notifee Maven repository
 * to the Android project's build.gradle allprojects block.
 * Required because @notifee/react-native v9+ no longer ships an app.plugin.js.
 */
module.exports = function withNotifee(config) {
  return withProjectBuildGradle(config, (config) => {
    const notifeeRepo = `    maven { url "$rootDir/../node_modules/@notifee/react-native/android/libs" }`;
    if (!config.modResults.contents.includes('@notifee/react-native/android/libs')) {
      // Insert the Notifee repo line after the jitpack line
      config.modResults.contents = config.modResults.contents.replace(
        `    maven { url 'https://www.jitpack.io' }`,
        `    maven { url 'https://www.jitpack.io' }\n${notifeeRepo}`
      );
    }
    return config;
  });
};
