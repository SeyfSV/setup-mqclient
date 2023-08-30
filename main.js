const core = require('@actions/core');
const decompress = require('decompress');
const { load } = require('cheerio');
const { exec } = require('child_process');
const fs = require('fs');
const https = require('https');
const os = require('os');
const path = require('path');
const platform = os.platform();
const rimraf = require('rimraf');
const tempDirectory = require('temp-dir');


const REDIST_URL_LNX = 'https://public.dhe.ibm.com/ibmdl/export/pub/software/websphere/messaging/mqdev/redist/'
const REDIST_URL_WIN = REDIST_URL_LNX
const TOOLKIT_URL_MAC = 'https://public.dhe.ibm.com/ibmdl/export/pub/software/websphere/messaging/mqdev/mactoolkit/'
const ARCHIVE_LNX = 'IBM-MQC-Redist-LinuxX64.tar.gz'
const ARCHIVE_WIN = 'IBM-MQC-Redist-Win64.zip'
var ARCHIVE_MAC = 'IBM-MQ-DevToolkit-MacX64.pkg' // Can have other value for previous version

// Darwin constants
PKG_INSTALLATION_PATH = '/opt/mqm'

var MQ_CLIENT_VERSION = core.getInput('mq-client-version')
if (!MQ_CLIENT_VERSION.match('^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$|^latest$')) {
    core.setFailed(`${MQ_CLIENT_VERSION} has wrong version format!`)
    process.exit(1)
}

const FORCE_DWNLD = (core.getInput('force-download') === 'true')
const MQ_FILE_PATH = core.getInput('mq-file-path')
const MQ_DATA_PATH = core.getInput('mq-data-path')

const DWNLD_PATH = core.getInput('download-path')
var dwnld_path = path.resolve(DWNLD_PATH);
core.debug(`Download directory path is ${dwnld_path}`)
if (!fs.existsSync(dwnld_path))
    fs.mkdirSync(dwnld_path, { recursive: true })

if (MQ_DATA_PATH != '') {
    var mq_data_path = path.resolve(MQ_DATA_PATH);
    core.exportVariable('MQ_OVERRIDE_DATA_PATH', mq_data_path);
}

const CLEAN_MQ_FILE_PATH = (core.getInput('clean-mq-file-path') === 'true')
core.debug(`CLEAN_MQ_FILE_PATH: ${CLEAN_MQ_FILE_PATH}`)

var file_name;
var url;
var archive_name;
var mq_file_path;

mq_file_path = path.resolve(MQ_FILE_PATH)
switch (platform) {
    case "linux":
        url = REDIST_URL_LNX
        archive_name = ARCHIVE_LNX
        mq_file_path = path.join(process.env.HOME, 'IBM/MQ/data')
        break;
    case "win32":
        url = REDIST_URL_WIN
        archive_name = ARCHIVE_WIN
        mq_file_path = path.join(process.env.HOMEDRIVE, process.env.HOMEPATH, 'IBM/MQ/data')
        break;
    case "darwin":
        url = TOOLKIT_URL_MAC
        if (compareVersions(MQ_CLIENT_VERSION, '9.2.2.0') < 1) {
            ARCHIVE_MAC = 'IBM-MQ-Toolkit-MacX64.pkg'
        }
        if (compareVersions(MQ_CLIENT_VERSION, '9.3.1.0') >= 0) {
            ARCHIVE_MAC = 'IBM-MQ-DevToolkit-MacOS.pkg'
        }
        archive_name = ARCHIVE_MAC
        mq_file_path = PKG_INSTALLATION_PATH
        break;
    default:
        core.setFailed(`Platform ${platform} is unknown!`)
        process.exit(1)
}
core.debug(`MQ_FILE_PATH variable is ${mq_file_path}`)

if (MQ_CLIENT_VERSION == 'latest')
    MQ_CLIENT_VERSION = getMaxVersion(url, archive_name, main)
else
    main(MQ_CLIENT_VERSION)

function main(mq_client_version) {

    file_name = `${mq_client_version}-${archive_name}`

    var dwnld_archive_path = path.join(dwnld_path, file_name)
    var archiveExists = fs.existsSync(dwnld_archive_path)
    core.debug(`Archive ${dwnld_archive_path} exists: ${archiveExists}`)
    if (!archiveExists)
        rimraf.sync(path.join(dwnld_path, '*'))
    core.debug(`Force download: ${FORCE_DWNLD}`)
    if (!(archiveExists
        && fs.statSync(dwnld_archive_path)['size'] > 0
        && !FORCE_DWNLD)) {
        core.info('Downloading MQ Client...')
        const https = require('https');
        var temporary_archive_path = path.join(tempDirectory, file_name);
        const file = fs.createWriteStream(temporary_archive_path);

        let request = https.get(url + file_name,
            (res) => {
                switch (res.statusCode) {
                    case 200:
                        break;
                    case (404) :
                        core.setFailed(`File ${url + file_name} does not exists!`);
                        return;
                    default:
                        core.setFailed(`Status code ${res.statusCode}!`);
                        return;
                }

                res.pipe(file).on('close', () => {
                    core.info('Downloaded');
                    core.debug(`Archive size: ${fs.statSync(temporary_archive_path)['size']}`);
                    core.debug(`Copy archive from "${temporary_archive_path}" to "${dwnld_archive_path}"`);
                    fs.copyFileSync(temporary_archive_path, dwnld_archive_path);
                    install(dwnld_archive_path, mq_file_path);
                });
                res.on('error', (error) => {
                    core.setFailed(error.message)
                });
            });
        request.end();
    } else
        install(dwnld_archive_path, mq_file_path);
}

function install(dwnld_archive_path, mq_file_path) {
    if (platform == "darwin") {
        install_package(dwnld_archive_path)
    }
    else {
        extract_package(dwnld_archive_path, mq_file_path)
    }
    setup_variables()

}

function setup_variables() {
    switch (platform) {
        case "linux":
            if (process.env.LD_LIBRARY_PATH)
                lib_path = `${mq_file_path}/lib64:${process.env['LD_LIBRARY_PATH']}`
            else
                lib_path = `${mq_file_path}/lib64`
            core.exportVariable('LD_LIBRARY_PATH', lib_path)
            core.exportVariable('mq-lib-var', `LD_LIBRARY_PATH`)
            core.exportVariable('mq-lib-path', `${mq_file_path}/lib64`)
            break
        case "win32":
            fs.mkdirSync(path.join(mq_file_path, '/bin'), { recursive: true });
            fs.mkdirSync(path.join(mq_file_path, '/bin64'), { recursive: true });
            break
        case "darwin":
            if (process.env.DYLD_LIBRARY_PATH) {
                lib_path = `${mq_file_path}/lib64:${process.env['DYLD_LIBRARY_PATH']}`
            }
            else {
                lib_path = `${mq_file_path}/lib64`
            }
            core.exportVariable('DYLD_LIBRARY_PATH', lib_path)
            core.exportVariable('mq-lib-var', `DYLD_LIBRARY_PATH`)
            core.exportVariable('mq-lib-path', `${mq_file_path}/lib64`)
            break
    }
    core.setOutput('mq-file-path', `${mq_file_path}`)
    core.addPath(path.join(mq_file_path, '/bin'));
    core.addPath(path.join(mq_file_path, '/bin64'));
}

function extract_package(input, output) {
    if (fs.existsSync(output)) {
        if (CLEAN_MQ_FILE_PATH) {
            rimraf.sync(path.join(output, '*'))
        } else {
            core.setFailed(`Directory ${output} already exists!`)
            process.exit(1)
        }
    }

    fs.mkdirSync(output, { recursive: true });
    core.info(`Directory ${output} created`)

    core.debug(`Archive path: ${input}`)
    core.debug(`Archive size: ${fs.statSync(input)['size']}`)

    core.info(`Extracting archive "${input}" to "${output}" ...`);
    decompress(input, output,
        {filter: file => !file.path.endsWith('/')})
        .then(files => core.info(`Archive ${input} extracted!`))
        .catch(error => {core.setFailed(error)})
}

function install_package(dwnld_archive_path) {
    core.info(`Installing package "${dwnld_archive_path}" ...`)
    exec('sudo installer -pkg ' + dwnld_archive_path + ' -target /', (error, stdout, stderr) => {
        if (error) {
            core.setFailed(error.message);
        }
        if (stderr) {
            core.setFailed(stderr);
        }
        core.debug(`${stdout}`);
    });

}

function getMaxVersion(url, archive_name, callback) {
    core.debug(`Base URL for version seach ${url}`)
    archive_name_pattern = `([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)-${archive_name}$`
    core.debug(`Archive name pattern ${archive_name_pattern}`)
    maxVersion = '0.0.0.0'
    https.get(url,
        (res) => {
            core.debug(`Status code ${res.statusCode}`);
            res.on('data', (d) => {
                var $ = load(d);
                $('a').each(function () {
                    var match = $(this).attr('href').match(archive_name_pattern)
                    if (match)
                        if (compareVersions(maxVersion, match[1]) < 0)
                            maxVersion = match[1]
                })
            });
            res.on('end', () => {
                core.debug(`Max version is ${maxVersion}`)
                callback(maxVersion)
            });
        }
    ).end()

    return maxVersion
}

function compareVersions(v1, v2) {
    // return positive: v1 > v2, zero:v1 == v2, negative: v1 < v2
    v1 = v1.split('.')
    v2 = v2.split('.')
    var len = Math.max(v1.length, v2.length)
    /*default is true*/
    for (let i = 0; i < len; i++) {
        _v1 = Number(v1[i] || 0);
        _v2 = Number(v2[i] || 0);
        if (_v1 !== _v2) return _v1 - _v2;
    }
    return 0;
}
