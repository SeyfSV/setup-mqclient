const core = require('@actions/core')
const fs = require('fs');
const path = require('path')
const tempDirectory = require('temp-dir');
const decompress = require('decompress');
const { exec } = require('child_process')

const REDIST_URL_LNX = 'https://public.dhe.ibm.com/ibmdl/export/pub/software/websphere/messaging/mqdev/redist'
const REDIST_URL_WIN = REDIST_URL_LNX
const TOOLKIT_URL_MAC = 'https://public.dhe.ibm.com/ibmdl/export/pub/software/websphere/messaging/mqdev/mactoolkit'
const ARCHIVE_LNX = 'IBM-MQC-Redist-LinuxX64.tar.gz'
const ARCHIVE_WIN = 'IBM-MQC-Redist-Win64.zip'

// Darwin constants
PKG_INSTALLATION_PATH = '/opt/mqm'

const MQ_CLIENT_VERSION = core.getInput('mq-client-version')
var ARCHIVE_MAC = ''
if (MQ_CLIENT_VERSION == '9.2.2.0') {
    ARCHIVE_MAC = 'IBM-MQ-Toolkit-MacX64.pkg'
}
else {
    ARCHIVE_MAC = 'IBM-MQ-DevToolkit-MacX64.pkg'
}

const FORCE_DWNLD = (core.getInput('force-download') === 'true')
const MQ_FILE_PATH = core.getInput('mq-file-path')
const MQ_DATA_PATH = core.getInput('mq-data-path')

const DWNLD_PATH = core.getInput('download-path')
if (!fs.existsSync(DWNLD_PATH))
    fs.mkdirSync(DWNLD_PATH, { recursive: true });
dwnld_path = path.resolve(DWNLD_PATH);
core.debug(`Download directory path is ${dwnld_path}`)

var os = require('os');
const { connected } = require('process');
var platform = os.platform();


if (MQ_DATA_PATH != '') {
    var mq_data_path = path.resolve(MQ_DATA_PATH);
    core.exportVariable('MQ_OVERRIDE_DATA_PATH', mq_data_path);
}

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
        archive_name = ARCHIVE_MAC
        mq_file_path = PKG_INSTALLATION_PATH
        break;
    default:
        core.setFailed(`Platform ${platform} is unknown!`)
        process.exit(1)
}
core.debug(`MQ_FILE_PATH variable is ${mq_file_path}`)


file_name = `${MQ_CLIENT_VERSION}-${archive_name}`

var dwnld_archive_path = path.join(dwnld_path, file_name)
core.debug(`Archive exists: ${fs.existsSync(dwnld_archive_path)}`)
core.debug(`Force download: ${FORCE_DWNLD}`)
if (!(fs.existsSync(dwnld_archive_path)
    && fs.statSync(dwnld_archive_path)['size'] > 0
    && !FORCE_DWNLD)) {
    core.info('Downloading MQ Client...')
    const https = require('https');
    var temporary_archive_path = path.join(tempDirectory, file_name);
    const file = fs.createWriteStream(temporary_archive_path);

    let request = https.get(url + '/' + file_name,
        (res) => {
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

function install(dwnld_archive_path, mq_file_path) {
    if (platform == "darwin") {
        core.info(`Installing package "${file_name}" to "${mq_file_path}" from cache...`)
        install_package(dwnld_archive_path)
    }
    else {
        core.info(`Extracting archive "${file_name}" to "${mq_file_path}" from cache...`)
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
    if (!fs.existsSync(output)) {
        fs.mkdirSync(output, { recursive: true });
        core.info(`Directory ${output} created`)
    }

    core.debug(`Archive path: ${input}`)
    core.debug(`Archive size: ${fs.statSync(input)['size']}`)

    core.info(`Extracting archive "${input}" to "${output}" ...`);
    decompress(input, output).then(
        files => {
            core.info(`Archive extracted!`)
        },
        error => {
            core.setFailed(error.message)
        })
        .catch(
            error => {
                throw new Error(`Error occured!: ${error}`)
            }
        )
}

function install_package(dwnld_archive_path) {
    exec('sudo installer -pkg ' + dwnld_archive_path + ' -target /', (error, stdout, stderr) => {
        if (error) {
            console.log(`error: ${error.message}`);
            core.setFailed(error.message);
        }
        if (stderr) {
            console.log(`stderr: ${stderr}`);
            core.setFailed(stderr);
        }
        console.log(`stdout: ${stdout}`);
    });

}
