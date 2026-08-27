const core = require('@actions/core');
const decompress = require('decompress');
const { exec } = require('child_process');
const dns = require('dns');
const fs = require('fs');
const https = require('https');
const os = require('os');
const path = require('path');

if (typeof dns.setDefaultResultOrder === 'function') {
    dns.setDefaultResultOrder('ipv4first');
}
const {
    archiveFileName,
    archiveNameForPlatform,
    downloadUrlForPlatform,
    executableBinDirs,
    isRetryableNetworkError,
    isSafeArchiveEntry,
    isValidClientVersion,
    libraryEnvForPlatform,
    macInstallerCommand,
    maxVersionFromListing,
    resolveInstallPath,
} = require('./lib');

const platform = os.platform();

async function run() {
    let mqClientVersion = core.getInput('mq-client-version');
    if (!isValidClientVersion(mqClientVersion)) {
        throw new Error(`${mqClientVersion} has wrong version format!`);
    }

    const url = downloadUrlForPlatform(platform);
    const archiveName = archiveNameForPlatform(platform, mqClientVersion);
    if (!url || !archiveName) {
        throw new Error(`Platform ${platform} is unknown!`);
    }

    const forceDownload = core.getInput('force-download') === 'true';
    const mqFilePathInput = core.getInput('mq-file-path');
    const mqDataPath = core.getInput('mq-data-path');
    const downloadPathInput = core.getInput('download-path');
    const cleanMqFilePath = core.getInput('clean-mq-file-path') === 'true';

    const downloadPath = path.resolve(downloadPathInput);
    core.debug(`Download directory path is ${downloadPath}`);
    fs.mkdirSync(downloadPath, { recursive: true });

    if (mqDataPath !== '') {
        core.exportVariable('MQ_OVERRIDE_DATA_PATH', path.resolve(mqDataPath));
    }

    core.debug(`CLEAN_MQ_FILE_PATH: ${cleanMqFilePath}`);

    const mqFilePath = resolveInstallPath(platform, mqFilePathInput, process.env);
    core.debug(`MQ_FILE_PATH variable is ${mqFilePath}`);

    if (mqClientVersion === 'latest') {
        mqClientVersion = await resolveLatestVersion(url, archiveName);
    }

    const fileName = archiveFileName(mqClientVersion, archiveNameForPlatform(platform, mqClientVersion));
    const downloadArchivePath = path.join(downloadPath, fileName);
    const archiveExists = fs.existsSync(downloadArchivePath);
    core.debug(`Archive ${downloadArchivePath} exists: ${archiveExists}`);

    if (!archiveExists) {
        rmContents(downloadPath);
    }

    core.debug(`Force download: ${forceDownload}`);
    const usableCache = archiveExists
        && fs.statSync(downloadArchivePath).size > 0
        && !forceDownload;

    if (!usableCache) {
        core.info('Downloading MQ Client...');
        const temporaryArchivePath = path.join(os.tmpdir(), fileName);
        await withRetries(() => downloadFile(url + fileName, temporaryArchivePath), 'download');
        core.info('Downloaded');
        core.debug(`Archive size: ${fs.statSync(temporaryArchivePath).size}`);
        core.debug(`Copy archive from "${temporaryArchivePath}" to "${downloadArchivePath}"`);
        fs.copyFileSync(temporaryArchivePath, downloadArchivePath);
    }

    await install(downloadArchivePath, mqFilePath, cleanMqFilePath);
    setupVariables(mqFilePath);
    core.setOutput('mq-client-version', mqClientVersion);
}

function rmContents(dir) {
    if (!fs.existsSync(dir)) {
        return;
    }
    for (const entry of fs.readdirSync(dir)) {
        fs.rmSync(path.join(dir, entry), { recursive: true, force: true });
    }
}

const HTTPS_HEADERS = { 'User-Agent': 'setup-mqclient' };

function ibmLookup(hostname, options, callback) {
    const resolver = new dns.Resolver();
    resolver.setServers(['8.8.8.8', '1.1.1.1']);
    resolver.resolve4(hostname, (err, addresses) => {
        if (!err && addresses && addresses.length) {
            callback(null, addresses[0], 4);
            return;
        }
        dns.lookup(hostname, options, callback);
    });
}

function httpsRequestOptions() {
    return {
        headers: HTTPS_HEADERS,
        family: 4,
        lookup: ibmLookup,
    };
}

async function withRetries(fn, label, attempts = 5, delayMs = 2000) {
    let lastError;
    for (let i = 1; i <= attempts; i++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;
            if (!isRetryableNetworkError(error) || i === attempts) {
                throw error;
            }
            const wait = delayMs * i;
            core.info(`${label} failed (${error.message}); retrying in ${wait}ms (${i}/${attempts})`);
            await new Promise((resolve) => setTimeout(resolve, wait));
        }
    }
    throw lastError;
}

function httpsGetBody(url) {
    return new Promise((resolve, reject) => {
        https.get(url, httpsRequestOptions(), (res) => {
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => {
                const body = Buffer.concat(chunks).toString('utf8');
                if (res.statusCode !== 200) {
                    reject(new Error(`Status code ${res.statusCode}!`));
                    return;
                }
                resolve(body);
            });
            res.on('error', reject);
        }).on('error', reject);
    });
}

function downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        let settled = false;
        const fail = (err) => {
            if (settled) {
                return;
            }
            settled = true;
            file.close(() => {
                fs.rmSync(dest, { force: true });
                reject(err);
            });
        };

        https.get(url, httpsRequestOptions(), (res) => {
            switch (res.statusCode) {
                case 200:
                    break;
                case 404:
                    fail(new Error(`File ${url} does not exists!`));
                    res.resume();
                    return;
                default:
                    fail(new Error(`Status code ${res.statusCode}!`));
                    res.resume();
                    return;
            }

            res.pipe(file);
            file.on('finish', () => {
                if (settled) {
                    return;
                }
                settled = true;
                file.close(resolve);
            });
            res.on('error', fail);
        }).on('error', fail);
    });
}

async function resolveLatestVersion(url, archiveName) {
    core.debug(`Base URL for version search ${url}`);
    core.debug(`Archive name pattern ${archiveName}`);
    const html = await withRetries(() => httpsGetBody(url), 'version listing');
    const maxVersion = maxVersionFromListing(html, archiveName);
    core.debug(`Max version is ${maxVersion}`);
    if (maxVersion === '0.0.0.0') {
        throw new Error(`Could not determine latest MQ Client version from ${url}`);
    }
    return maxVersion;
}

async function install(downloadArchivePath, mqFilePath, cleanMqFilePath) {
    if (platform === 'darwin') {
        await installPackage(downloadArchivePath);
    } else {
        await extractPackage(downloadArchivePath, mqFilePath, cleanMqFilePath);
    }
}

function setupVariables(mqFilePath) {
    const exported = libraryEnvForPlatform(platform, mqFilePath, process.env);
    for (const [name, value] of Object.entries(exported)) {
        core.exportVariable(name, value);
    }

    if (platform === 'win32') {
        for (const binDir of executableBinDirs(mqFilePath)) {
            fs.mkdirSync(binDir, { recursive: true });
        }
    }

    core.setOutput('mq-file-path', mqFilePath);
    for (const binDir of executableBinDirs(mqFilePath)) {
        core.addPath(binDir);
    }
}

async function extractPackage(input, output, cleanMqFilePath) {
    if (fs.existsSync(output)) {
        if (cleanMqFilePath) {
            rmContents(output);
        } else {
            throw new Error(`Directory ${output} already exists!`);
        }
    }

    fs.mkdirSync(output, { recursive: true });
    core.info(`Directory ${output} created`);
    core.debug(`Archive path: ${input}`);
    core.debug(`Archive size: ${fs.statSync(input).size}`);
    core.info(`Extracting archive "${input}" to "${output}" ...`);

    await decompress(input, output, { filter: (file) => isSafeArchiveEntry(file.path) });
    core.info(`Archive ${input} extracted!`);
}

function installPackage(downloadArchivePath) {
    const command = macInstallerCommand(downloadArchivePath);
    core.info(`Installing package "${downloadArchivePath}" ...`);
    return new Promise((resolve, reject) => {
        exec(command, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
            if (stdout) {
                core.debug(stdout);
            }
            if (stderr) {
                core.info(stderr);
            }
            if (error) {
                reject(new Error(error.message));
                return;
            }
            resolve();
        });
    });
}

if (require.main === module) {
    run().catch((error) => {
        core.setFailed(error.message);
        process.exit(1);
    });
}

module.exports = { run };
