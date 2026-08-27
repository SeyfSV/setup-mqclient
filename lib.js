const path = require('path');

const VERSION_PATTERN = /^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$|^latest$/;
const ARCHIVE_LINUX = 'IBM-MQC-Redist-LinuxX64.tar.gz';
const ARCHIVE_WINDOWS = 'IBM-MQC-Redist-Win64.zip';
const ARCHIVE_MAC_INTEL = 'IBM-MQ-DevToolkit-MacX64.pkg';
const ARCHIVE_MAC = 'IBM-MQ-DevToolkit-MacOS.pkg';
const MAC_ARCHIVE_SWITCH_VERSION = '9.3.1.0';
const DEFAULT_MAC_PATH = '/opt/mqm';
const REDIST_URL = 'https://public.dhe.ibm.com/ibmdl/export/pub/software/websphere/messaging/mqdev/redist/';
const TOOLKIT_URL = 'https://public.dhe.ibm.com/ibmdl/export/pub/software/websphere/messaging/mqdev/mactoolkit/';

function isValidClientVersion(version) {
    return typeof version === 'string' && VERSION_PATTERN.test(version);
}

/**
 * Compare two dotted version numbers.
 * @returns {number} positive if v1 > v2, 0 if equal, negative if v1 < v2
 */
function compareVersions(v1, v2) {
    const a = String(v1).split('.');
    const b = String(v2).split('.');
    const len = Math.max(a.length, b.length);

    for (let i = 0; i < len; i++) {
        const left = Number(a[i] || 0);
        const right = Number(b[i] || 0);
        if (Number.isNaN(left) || Number.isNaN(right)) {
            return 0;
        }
        if (left !== right) {
            return left - right;
        }
    }

    return 0;
}

function macArchiveName(version) {
    if (version === 'latest' || compareVersions(version, MAC_ARCHIVE_SWITCH_VERSION) >= 0) {
        return ARCHIVE_MAC;
    }
    return ARCHIVE_MAC_INTEL;
}

function archiveNameForPlatform(platform, version) {
    switch (platform) {
        case 'linux':
            return ARCHIVE_LINUX;
        case 'win32':
            return ARCHIVE_WINDOWS;
        case 'darwin':
            return macArchiveName(version);
        default:
            return null;
    }
}

function downloadUrlForPlatform(platform) {
    switch (platform) {
        case 'linux':
        case 'win32':
            return REDIST_URL;
        case 'darwin':
            return TOOLKIT_URL;
        default:
            return null;
    }
}

function defaultInstallPath(platform, env) {
    env = env || {};
    switch (platform) {
        case 'linux':
            return path.join(env.HOME || '', 'IBM/MQ/data');
        case 'win32':
            return path.join(env.HOMEDRIVE || '', env.HOMEPATH || '', 'IBM/MQ/data');
        case 'darwin':
            return DEFAULT_MAC_PATH;
        default:
            return null;
    }
}

function resolveInstallPath(platform, mqFilePath, env) {
    if (platform === 'darwin') {
        return DEFAULT_MAC_PATH;
    }
    if (mqFilePath) {
        return path.resolve(mqFilePath);
    }
    return defaultInstallPath(platform, env);
}

function macInstallerCommand(pkgPath) {
    // Original command plus -allowUntrusted so IBM toolkit pkgs install on current macOS CI images.
    return `sudo installer -allowUntrusted -pkg "${pkgPath}" -target /`;
}

function executableBinDirs(installPath) {
    return [
        path.join(installPath, 'bin'),
        path.join(installPath, 'bin64'),
    ];
}

function libraryEnvForPlatform(platform, installPath, env) {
    env = env || {};
    const lib64 = `${installPath}/lib64`;

    switch (platform) {
        case 'linux': {
            const existing = env.LD_LIBRARY_PATH;
            return {
                LD_LIBRARY_PATH: existing ? `${lib64}:${existing}` : lib64,
                'mq-lib-var': 'LD_LIBRARY_PATH',
                'mq-lib-path': lib64,
            };
        }
        case 'darwin': {
            const existing = env.DYLD_LIBRARY_PATH;
            return {
                DYLD_LIBRARY_PATH: existing ? `${lib64}:${existing}` : lib64,
                'mq-lib-var': 'DYLD_LIBRARY_PATH',
                'mq-lib-path': lib64,
            };
        }
        default:
            return {};
    }
}

function maxVersionFromListing(html, archiveName) {
    const escaped = archiveName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const versionPattern = new RegExp(`^([0-9]+\\.[0-9]+\\.[0-9]+\\.[0-9]+)-${escaped}$`);
    let maxVersion = '0.0.0.0';
    const hrefPattern = /href=["']?([^"'>\s]+)/gi;
    let hrefMatch;
    while ((hrefMatch = hrefPattern.exec(html)) !== null) {
        const versionMatch = hrefMatch[1].match(versionPattern);
        if (versionMatch && compareVersions(maxVersion, versionMatch[1]) < 0) {
            maxVersion = versionMatch[1];
        }
    }
    return maxVersion;
}

function archiveFileName(version, archiveName) {
    return `${version}-${archiveName}`;
}

function isSafeArchiveEntry(filePath) {
    if (!filePath || filePath.endsWith('/')) {
        return false;
    }
    const normalized = filePath.replace(/\\/g, '/');
    if (path.isAbsolute(normalized) || normalized.startsWith('/')) {
        return false;
    }
    return !normalized.split('/').includes('..');
}

function isRetryableNetworkError(error) {
    const message = error && error.message ? error.message : String(error);
    return /EAI_AGAIN|ENOTFOUND|ECONNRESET|ETIMEDOUT|ECONNREFUSED|EHOSTUNREACH|socket hang up|Status code 5\d\d/.test(message);
}

module.exports = {
    ARCHIVE_LINUX,
    ARCHIVE_WINDOWS,
    ARCHIVE_MAC,
    ARCHIVE_MAC_INTEL,
    DEFAULT_MAC_PATH,
    MAC_ARCHIVE_SWITCH_VERSION,
    REDIST_URL,
    TOOLKIT_URL,
    archiveFileName,
    archiveNameForPlatform,
    compareVersions,
    isSafeArchiveEntry,
    isRetryableNetworkError,
    defaultInstallPath,
    downloadUrlForPlatform,
    executableBinDirs,
    isValidClientVersion,
    libraryEnvForPlatform,
    macArchiveName,
    macInstallerCommand,
    maxVersionFromListing,
    resolveInstallPath,
};
