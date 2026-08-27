const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const {
    ARCHIVE_LINUX,
    ARCHIVE_MAC,
    ARCHIVE_MAC_INTEL,
    ARCHIVE_WINDOWS,
    DEFAULT_MAC_PATH,
    REDIST_URL,
    TOOLKIT_URL,
    archiveFileName,
    archiveNameForPlatform,
    compareVersions,
    defaultInstallPath,
    downloadUrlForPlatform,
    executableBinDirs,
    isRetryableNetworkError,
    isSafeArchiveEntry,
    isValidClientVersion,
    libraryEnvForPlatform,
    macArchiveName,
    macInstallerCommand,
    maxVersionFromListing,
    resolveInstallPath,
} = require('../lib');

describe('isValidClientVersion', () => {
    it('accepts dotted IBM MQ versions and latest', () => {
        assert.equal(isValidClientVersion('9.3.0.0'), true);
        assert.equal(isValidClientVersion('9.4.0.15'), true);
        assert.equal(isValidClientVersion('10.0.0.0'), true);
        assert.equal(isValidClientVersion('latest'), true);
    });

    it('rejects empty, partial, and garbage versions', () => {
        assert.equal(isValidClientVersion(''), false);
        assert.equal(isValidClientVersion('9.3.0'), false);
        assert.equal(isValidClientVersion('9.3.0.0-lts'), false);
        assert.equal(isValidClientVersion('v9.3.0.0'), false);
        assert.equal(isValidClientVersion(null), false);
    });
});

describe('compareVersions', () => {
    it('orders equal, greater, and lesser versions', () => {
        assert.equal(compareVersions('9.3.0.0', '9.3.0.0'), 0);
        assert.ok(compareVersions('9.4.0.0', '9.3.0.0') > 0);
        assert.ok(compareVersions('9.3.0.0', '9.4.0.0') < 0);
    });

    it('compares maintenance and CD streams numerically', () => {
        assert.ok(compareVersions('9.3.0.10', '9.3.0.2') > 0);
        assert.ok(compareVersions('9.3.1.0', '9.3.0.15') > 0);
        assert.ok(compareVersions('10.0.0.0', '9.4.5.0') > 0);
    });

    it('treats missing trailing segments as zero', () => {
        assert.equal(compareVersions('9.3', '9.3.0.0'), 0);
        assert.ok(compareVersions('9.3.1', '9.3.0.0') > 0);
    });
});

describe('macArchiveName', () => {
    it('uses MacX64.pkg before 9.3.1.0', () => {
        assert.equal(macArchiveName('9.3.0.0'), ARCHIVE_MAC_INTEL);
        assert.equal(macArchiveName('9.2.0.0'), ARCHIVE_MAC_INTEL);
    });

    it('uses MacOS.pkg from 9.3.1.0 onward, including latest', () => {
        assert.equal(macArchiveName('9.3.1.0'), ARCHIVE_MAC);
        assert.equal(macArchiveName('9.4.0.0'), ARCHIVE_MAC);
        assert.equal(macArchiveName('10.0.0.0'), ARCHIVE_MAC);
        assert.equal(macArchiveName('latest'), ARCHIVE_MAC);
    });
});

describe('archiveNameForPlatform', () => {
    it('selects the redistributable or toolkit archive for each OS', () => {
        assert.equal(archiveNameForPlatform('linux', '9.4.0.0'), ARCHIVE_LINUX);
        assert.equal(archiveNameForPlatform('win32', '9.4.0.0'), ARCHIVE_WINDOWS);
        assert.equal(archiveNameForPlatform('darwin', '9.3.0.0'), ARCHIVE_MAC_INTEL);
        assert.equal(archiveNameForPlatform('darwin', '9.4.0.0'), ARCHIVE_MAC);
        assert.equal(archiveNameForPlatform('freebsd', '9.4.0.0'), null);
    });
});

describe('downloadUrlForPlatform', () => {
    it('points linux/windows at redist and darwin at the mac toolkit', () => {
        assert.equal(downloadUrlForPlatform('linux'), REDIST_URL);
        assert.equal(downloadUrlForPlatform('win32'), REDIST_URL);
        assert.equal(downloadUrlForPlatform('darwin'), TOOLKIT_URL);
        assert.equal(downloadUrlForPlatform('aix'), null);
    });
});

describe('resolveInstallPath', () => {
    const env = {
        HOME: '/home/runner',
        HOMEDRIVE: 'C:',
        HOMEPATH: '\\Users\\runner',
    };

    it('uses platform defaults when mq-file-path is empty', () => {
        assert.equal(resolveInstallPath('linux', '', env), path.join('/home/runner', 'IBM/MQ/data'));
        assert.equal(
            resolveInstallPath('win32', '', env),
            path.join('C:', '\\Users\\runner', 'IBM/MQ/data'),
        );
        assert.equal(resolveInstallPath('darwin', '', env), DEFAULT_MAC_PATH);
    });

    it('honors mq-file-path on linux and windows', () => {
        assert.equal(
            resolveInstallPath('linux', 'mq-file-path/data', env),
            path.resolve('mq-file-path/data'),
        );
        assert.equal(
            resolveInstallPath('win32', 'D:\\mq', env),
            path.resolve('D:\\mq'),
        );
    });

    it('keeps macOS installs at /opt/mqm even if mq-file-path is set', () => {
        assert.equal(resolveInstallPath('darwin', '/tmp/mq', env), DEFAULT_MAC_PATH);
    });

    it('returns the documented default install paths', () => {
        assert.equal(defaultInstallPath('linux', env), path.join('/home/runner', 'IBM/MQ/data'));
        assert.equal(defaultInstallPath('darwin', env), DEFAULT_MAC_PATH);
    });
});

describe('macInstallerCommand', () => {
    it('keeps the original installer invocation and adds -allowUntrusted', () => {
        const command = macInstallerCommand('/tmp/IBM MQ.pkg');
        assert.equal(
            command,
            'sudo installer -allowUntrusted -pkg "/tmp/IBM MQ.pkg" -target /',
        );
    });
});

describe('executableBinDirs', () => {
    it('adds installDir/bin and bin64, not a rooted /bin path', () => {
        const dirs = executableBinDirs('/home/runner/IBM/MQ/data');
        assert.deepEqual(dirs, [
            path.join('/home/runner/IBM/MQ/data', 'bin'),
            path.join('/home/runner/IBM/MQ/data', 'bin64'),
        ]);
        assert.equal(dirs[0].startsWith('/bin'), false);
    });
});

describe('libraryEnvForPlatform', () => {
    it('prepends lib64 onto LD_LIBRARY_PATH on linux', () => {
        const env = libraryEnvForPlatform('linux', '/home/runner/IBM/MQ/data', {
            LD_LIBRARY_PATH: '/opt/other',
        });
        assert.equal(env.LD_LIBRARY_PATH, '/home/runner/IBM/MQ/data/lib64:/opt/other');
        assert.equal(env['mq-lib-var'], 'LD_LIBRARY_PATH');
        assert.equal(env['mq-lib-path'], '/home/runner/IBM/MQ/data/lib64');
    });

    it('sets DYLD_LIBRARY_PATH on darwin when unset', () => {
        const env = libraryEnvForPlatform('darwin', '/opt/mqm', {});
        assert.equal(env.DYLD_LIBRARY_PATH, '/opt/mqm/lib64');
        assert.equal(env['mq-lib-var'], 'DYLD_LIBRARY_PATH');
    });

    it('exports nothing extra on windows', () => {
        assert.deepEqual(libraryEnvForPlatform('win32', 'C:\\IBM\\MQ\\data', {}), {});
    });
});

describe('maxVersionFromListing', () => {
    const html = `
        <a href="9.3.0.0-IBM-MQC-Redist-LinuxX64.tar.gz">9.3.0.0</a>
        <a href="9.3.0.41-IBM-MQC-Redist-LinuxX64.tar.gz">9.3.0.41</a>
        <a href="9.4.0.0-IBM-MQC-Redist-LinuxX64.tar.gz">9.4.0.0</a>
        <a href="9.4.0.15-IBM-MQC-Redist-LinuxX64.tar.gz">9.4.0.15</a>
        <a href="10.0.0.0-IBM-MQC-Redist-LinuxX64.tar.gz">10.0.0.0</a>
        <a href="9.4.0.0-IBM-MQC-Redist-Win64.zip">windows</a>
        <a href="9.3.0.0-IBM-MQ-DevToolkit-MacX64.pkg">old mac</a>
        <a href="9.4.5.0-IBM-MQ-DevToolkit-MacOS.pkg">new mac</a>
    `;

    it('picks the highest matching archive version from a directory listing', () => {
        assert.equal(maxVersionFromListing(html, ARCHIVE_LINUX), '10.0.0.0');
        assert.equal(maxVersionFromListing(html, ARCHIVE_WINDOWS), '9.4.0.0');
        assert.equal(maxVersionFromListing(html, ARCHIVE_MAC), '9.4.5.0');
        assert.equal(maxVersionFromListing(html, ARCHIVE_MAC_INTEL), '9.3.0.0');
    });

    it('returns 0.0.0.0 when the listing has no matching archives', () => {
        assert.equal(maxVersionFromListing('<html></html>', ARCHIVE_LINUX), '0.0.0.0');
    });

    it('only matches complete archive hrefs, like the original cheerio parser', () => {
        const html = '<a href="9.4.0.0-IBM-MQC-Redist-LinuxX64.tar.gz.sha256">nope</a>';
        assert.equal(maxVersionFromListing(html, ARCHIVE_LINUX), '0.0.0.0');
    });
});

describe('v0.3 drop-in contract', () => {
    const env = {
        HOME: '/home/runner',
        HOMEDRIVE: 'C:',
        HOMEPATH: '\\Users\\runner',
    };

    it('keeps the same download URLs, archive names, and default install paths', () => {
        assert.equal(
            downloadUrlForPlatform('linux'),
            'https://public.dhe.ibm.com/ibmdl/export/pub/software/websphere/messaging/mqdev/redist/',
        );
        assert.equal(
            downloadUrlForPlatform('darwin'),
            'https://public.dhe.ibm.com/ibmdl/export/pub/software/websphere/messaging/mqdev/mactoolkit/',
        );
        assert.equal(
            archiveFileName('9.3.0.0', archiveNameForPlatform('linux', '9.3.0.0')),
            '9.3.0.0-IBM-MQC-Redist-LinuxX64.tar.gz',
        );
        assert.equal(
            archiveFileName('9.3.0.0', archiveNameForPlatform('win32', '9.3.0.0')),
            '9.3.0.0-IBM-MQC-Redist-Win64.zip',
        );
        assert.equal(
            archiveFileName('9.3.0.0', archiveNameForPlatform('darwin', '9.3.0.0')),
            '9.3.0.0-IBM-MQ-DevToolkit-MacX64.pkg',
        );
        assert.equal(
            archiveFileName('9.3.1.0', archiveNameForPlatform('darwin', '9.3.1.0')),
            '9.3.1.0-IBM-MQ-DevToolkit-MacOS.pkg',
        );
        assert.equal(resolveInstallPath('linux', '', env), path.join('/home/runner', 'IBM/MQ/data'));
        assert.equal(resolveInstallPath('darwin', '', env), '/opt/mqm');
    });

    it('still exports LD_LIBRARY_PATH / DYLD_LIBRARY_PATH the same way', () => {
        const linux = libraryEnvForPlatform('linux', '/home/runner/IBM/MQ/data', {});
        assert.equal(linux.LD_LIBRARY_PATH, '/home/runner/IBM/MQ/data/lib64');
        assert.equal(linux['mq-lib-var'], 'LD_LIBRARY_PATH');
        const mac = libraryEnvForPlatform('darwin', '/opt/mqm', { DYLD_LIBRARY_PATH: '/opt/other' });
        assert.equal(mac.DYLD_LIBRARY_PATH, '/opt/mqm/lib64:/opt/other');
    });
});

describe('archiveFileName', () => {
    it('prefixes the version onto the archive name', () => {
        assert.equal(
            archiveFileName('9.4.0.0', ARCHIVE_LINUX),
            '9.4.0.0-IBM-MQC-Redist-LinuxX64.tar.gz',
        );
    });
});

describe('isSafeArchiveEntry', () => {
    it('allows regular files and rejects directories, absolute paths, and traversal', () => {
        assert.equal(isSafeArchiveEntry('bin/dspmqver'), true);
        assert.equal(isSafeArchiveEntry('lib64/libmqm.so'), true);
        assert.equal(isSafeArchiveEntry('bin/'), false);
        assert.equal(isSafeArchiveEntry('../etc/passwd'), false);
        assert.equal(isSafeArchiveEntry('bin/../../etc/passwd'), false);
        assert.equal(isSafeArchiveEntry('/etc/passwd'), false);
    });
});

describe('isRetryableNetworkError', () => {
    it('retries DNS and connection failures, but not 404s', () => {
        assert.equal(isRetryableNetworkError(new Error('getaddrinfo EAI_AGAIN public.dhe.ibm.com')), true);
        assert.equal(isRetryableNetworkError(new Error('connect ETIMEDOUT')), true);
        assert.equal(isRetryableNetworkError(new Error('Status code 503!')), true);
        assert.equal(isRetryableNetworkError(new Error('File https://example/missing does not exists!')), false);
        assert.equal(isRetryableNetworkError(new Error('Status code 404!')), false);
    });
});
