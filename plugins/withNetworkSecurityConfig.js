const { withAndroidManifest, withDangerousMod, withInfoPlist, AndroidConfig } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Konfiguracja Network Security Config dla SecureBank (MASVS-NETWORK-1, MASVS-NETWORK-2)
 *
 * 1. cleartextTrafficPermitted="false":
 *    Calkowita blokada nieszyfrowanego ruchu HTTP (port 80) w calej aplikacji.
 * 2. <certificates src="system" />:
 *    Zaufanie wylacznie do zaufanych certyfikatow z magazynu systemowego Androida.
 * 3. Brak <certificates src="user" />:
 *    Jawne odrzucenie certyfikatow instalowanych przez uzytkownika w systemie (np. Burp Suite CA,
 *    mitmproxy CA, Charles Proxy). Uniemozliwia to przechwycenie ruchu przez podstawiony certyfikat.
 * 4. <pin-set>:
 *    Przypinanie skrotow kluczy publicznych (SPKI SHA-256) dla backendu Supabase (*.supabase.co)
 *    wraz z kluczami posrednimi i zapasowym root CA (WE1, GTS Root R4, GTS Root R1).
 * 5. iOS ATS (NSPinnedDomains):
 *    Wylaczenie NSAllowsArbitraryLoads oraz natywny pinning CA w Info.plist.
 */
const NETWORK_SECURITY_CONFIG_XML = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <!-- Konfiguracja bazowa: blokada nieszyfrowanego HTTP i zaufanie tylko do certyfikatow systemowych -->
    <base-config cleartextTrafficPermitted="false">
        <trust-anchors>
            <certificates src="system" />
        </trust-anchors>
    </base-config>

    <!-- Przypinanie kluczy publicznych (Certificate Pinning) dla domeny Supabase -->
    <domain-config cleartextTrafficPermitted="false">
        <domain includeSubdomains="true">supabase.co</domain>
        <pin-set expiration="2027-12-31">
            <!-- Leaf SPKI Pin (*.supabase.co, wazny do 2027-01-22) -->
            <pin digest="SHA-256">B9zUXavotYYIs217h2OZnCqCTp2vB/2pNC1zDijcIAo=</pin>
            <!-- Intermediate SPKI Pin (Google Trust Services WE1, wazny do 2029-02-20) -->
            <pin digest="SHA-256">kIdp6NNEd8wsugYyyIYFsi1ylMCED3hZbSR8ZFsa/A4=</pin>
            <!-- Root CA SPKI Pin (Google Trust Services GTS Root R4, wazny do 2036-06-22) -->
            <pin digest="SHA-256">mEflZT5enoR1FuXLgYYGqnVEoZvmf9c2bVBpiOjYQ0c=</pin>
            <!-- Backup Root CA SPKI Pin (Google Trust Services GTS Root R1, wazny do 2036-06-22) -->
            <pin digest="SHA-256">hxqRlPTu1bMS/0DITB1SSu0vd4u/8l8TjPgfaAp63Gc=</pin>
        </pin-set>
        <trust-anchors>
            <certificates src="system" />
        </trust-anchors>
    </domain-config>
</network-security-config>
`;

/**
 * Zapisuje plik android/app/src/main/res/xml/network_security_config.xml
 */
const withNetworkSecurityXml = (config) => {
  return withDangerousMod(config, [
    'android',
    async (modConfig) => {
      const resXmlDir = path.join(
        modConfig.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'res',
        'xml'
      );
      if (!fs.existsSync(resXmlDir)) {
        fs.mkdirSync(resXmlDir, { recursive: true });
      }
      fs.writeFileSync(
        path.join(resXmlDir, 'network_security_config.xml'),
        NETWORK_SECURITY_CONFIG_XML.trim() + '\n',
        'utf-8'
      );
      return modConfig;
    },
  ]);
};

/**
 * Dodaje atrybut android:networkSecurityConfig="@xml/network_security_config" do <application> w AndroidManifest.xml
 */
const withNetworkSecurityManifest = (config) => {
  return withAndroidManifest(config, async (modConfig) => {
    const mainApp = AndroidConfig.Manifest.getMainApplicationOrThrow(modConfig.modResults);
    mainApp.$['android:networkSecurityConfig'] = '@xml/network_security_config';
    return modConfig;
  });
};

const withIosAppTransportSecurity = (config) => {
  return withInfoPlist(config, (modConfig) => {
    modConfig.modResults.NSAppTransportSecurity = {
      NSAllowsArbitraryLoads: false,
      NSPinnedDomains: {
        'supabase.co': {
          NSIncludesSubdomains: true,
          NSPinnedCAIdentities: [
            { 'SPKI-SHA256-BASE64': 'kIdp6NNEd8wsugYyyIYFsi1ylMCED3hZbSR8ZFsa/A4=' },
            { 'SPKI-SHA256-BASE64': 'mEflZT5enoR1FuXLgYYGqnVEoZvmf9c2bVBpiOjYQ0c=' },
            { 'SPKI-SHA256-BASE64': 'hxqRlPTu1bMS/0DITB1SSu0vd4u/8l8TjPgfaAp63Gc=' },
          ],
        },
      },
    };
    return modConfig;
  });
};

const withNetworkSecurityConfig = (config) => {
  return withIosAppTransportSecurity(withNetworkSecurityManifest(withNetworkSecurityXml(config)));
};

module.exports = withNetworkSecurityConfig;
