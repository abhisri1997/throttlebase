const fs = require('fs');
const { withGradleProperties } = require('expo/config-plugins');

const KEY = 'org.gradle.java.home';

function resolveJava17Home() {
  const envOverride = process.env.THROTTLEBASE_JAVA_17_HOME || process.env.JAVA_17_HOME;
  if (envOverride && fs.existsSync(envOverride)) {
    return envOverride;
  }

  const platformDefaults = {
    darwin: '/Library/Java/JavaVirtualMachines/temurin-17.jdk/Contents/Home',
    linux: '/usr/lib/jvm/temurin-17-jdk-amd64',
    win32: 'C:\\Program Files\\Eclipse Adoptium\\jdk-17'
  };

  const fallback = platformDefaults[process.platform];
  return fallback && fs.existsSync(fallback) ? fallback : null;
}

module.exports = function withAndroidJdk17(config) {
  return withGradleProperties(config, (config) => {
    const java17Home = resolveJava17Home();
    if (!java17Home) {
      return config;
    }

    const existing = config.modResults.find(
      (item) => item.type === 'property' && item.key === KEY
    );

    if (existing) {
      existing.value = java17Home;
    } else {
      config.modResults.push({ type: 'property', key: KEY, value: java17Home });
    }

    return config;
  });
};