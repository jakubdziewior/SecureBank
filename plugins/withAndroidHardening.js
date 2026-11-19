const { withMainActivity, withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const FLAG_SECURE_IMPORT = 'import android.view.WindowManager';
const FLAG_SECURE_CALL =
  'window.setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE)';

const STRIP_LOGS_MARKER = '# securebank: strip android.util.Log in release';
const STRIP_LOGS_RULES = `${STRIP_LOGS_MARKER}
-assumenosideeffects class android.util.Log {
    public static int v(...);
    public static int d(...);
    public static int i(...);
    public static boolean isLoggable(java.lang.String, int);
}
`;

const withSecureWindow = (config) =>
  withMainActivity(config, (cfg) => {
    let contents = cfg.modResults.contents;
    if (cfg.modResults.language !== 'kt' || contents.includes(FLAG_SECURE_CALL)) {
      return cfg;
    }
    if (!contents.includes(FLAG_SECURE_IMPORT)) {
      contents = contents.replace(/(import android\.os\.Bundle\n)/, `$1${FLAG_SECURE_IMPORT}\n`);
    }
    contents = contents.replace(/(\n(\s*)super\.onCreate\([^)]*\)\n)/, `$1$2${FLAG_SECURE_CALL}\n`);
    cfg.modResults.contents = contents;
    return cfg;
  });

const withReleaseLogStripping = (config) =>
  withDangerousMod(config, [
    'android',
    async (cfg) => {
      const rulesPath = path.join(cfg.modRequest.platformProjectRoot, 'app', 'proguard-rules.pro');
      const current = fs.existsSync(rulesPath) ? fs.readFileSync(rulesPath, 'utf8') : '';
      if (!current.includes(STRIP_LOGS_MARKER)) {
        fs.writeFileSync(rulesPath, `${current.trimEnd()}\n\n${STRIP_LOGS_RULES}`);
      }
      return cfg;
    },
  ]);

module.exports = (config) => withReleaseLogStripping(withSecureWindow(config));
