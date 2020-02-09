const core = require('@actions/core')
const fs  = require('fs');
const path = require('path')
const tempDirectory = require('temp-dir');
const expandHomeDir = require('expand-home-dir')
const decompress = require('decompress');

const REDIST_URL_LNX = 'https://public.dhe.ibm.com/ibmdl/export/pub/software/websphere/messaging/mqdev/redist'
const REDIST_URL_WIN = REDIST_URL_LNX
const TOOLKIT_URL_MAC = 'https://public.dhe.ibm.com/ibmdl/export/pub/software/websphere/messaging/mqdev/mactoolkit'
const ARCHIVE_LNX = 'IBM-MQC-Redist-LinuxX64.tar.gz'
const ARCHIVE_WIN = 'IBM-MQC-Redist-Win64.zip'
const ARCHIVE_MAC = 'IBM-MQ-Toolkit-MacX64.tar.gz'

const PATH_LINUX = expandHomeDir('~/IBM/MQ')
const PATH_WIN = path.normalize('%HOMEDRIVE%%HOMEPATH%\IBM\MQ\data')
const PATH_MAC = expandHomeDir('~/IBM/MQ')
const PATH_DATA_MAC = expandHomeDir('~/IBM/MQ/data')

const MQ_CLIENT_VERSION = core.getInput('mq-client-version')
const PATH_INST = core.getInput('mq-file-path')
const FORCE_DWNLD = (core.getInput('force-download') === 'true')

const DWNLD_PATH = core.getInput('download-path')
if (!fs.existsSync(DWNLD_PATH))
    fs.mkdirSync(DWNLD_PATH, {recursive: true});
dwnld_path = path.resolve(DWNLD_PATH);
core.debug(`Download directory path is ${dwnld_path}`)

var os = require('os');
var platform = os.platform();
var file_name;
var mq_file_path = PATH_INST;
var url;

switch (platform)
{
    case "linux":
        url = REDIST_URL_LNX
        file_name = MQ_CLIENT_VERSION + '-' + ARCHIVE_LNX
        if (PATH_INST == '')
            mq_file_path = PATH_LINUX
        break;
    case "win32":
        url = REDIST_URL_WIN
        file_name = MQ_CLIENT_VERSION + '-' + ARCHIVE_WIN
        if (PATH_INST == '')
            mq_file_path = PATH_WIN
        break;
    case "darwin":
        url = TOOLKIT_URL_MAC
        file_name = MQ_CLIENT_VERSION + '-' + ARCHIVE_MAC
        if (PATH_INST == '')
            mq_file_path = PATH_MAC
        break;
    default:
        core.setFailed('Platform ' + platform + ' is unknown!')
        process.exit(1)
}

process.env.MQ_FILE_PATH = mq_file_path
core.info('MQ_FILE_PATH is '+ mq_file_path)


if (!fs.existsSync(mq_file_path)){
    fs.mkdirSync(mq_file_path, {recursive: true});
    core.info('Created dir ' + mq_file_path)
}

if(platform == 'darwin'){
    if (process.env.MQ_OVERRIDE_DATA_PATH){
        fs.mkdirSync(process.env.MQ_OVERRIDE_DATA_PATH, {recursive: true});
    }
    else{
        fs.mkdirSync(PATH_DATA_MAC, {recursive: true});
        
    }
}

var dwnld_archive_path = path.join(dwnld_path, file_name)
core.debug(`Archive exists: ${fs.existsSync(dwnld_archive_path)}`)
core.debug(`Force download: ${FORCE_DWNLD}`)
if (fs.existsSync(dwnld_archive_path)
        && fs.statSync(dwnld_archive_path)['size'] > 0
        && !FORCE_DWNLD){
    core.info(`Extracting archive "${file_name}" to "${mq_file_path}" from cache...`)
    extract(dwnld_archive_path, mq_file_path)
    setup_variables()
}
else{
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
            extract(dwnld_archive_path, mq_file_path);
            setup_variables();
        });
        res.on('error', (error)=>{
            core.setFailed(error.message)
        });
    });
    request.end();
}


function setup_variables(){
    switch(platform)
    {
        case "linux":
            if (process.env.LD_LIBRARY_PATH)
                lib_path = `${mq_file_path}/lib64:${process.env['LD_LIBRARY_PATH']}`
            else
                lib_path = `${mq_file_path}/lib64`
            core.exportVariable('MQ_OVERRIDE_DATA_PATH',mq_file_path)
            core.exportVariable('LD_LIBRARY_PATH', lib_path)
            core.exportVariable('mq-lib-var', `LD_LIBRARY_PATH`)
            core.exportVariable('mq-lib-path', `${mq_file_path}/lib64`)
            break
        case "win32":
            core.exportVariable('MQ_OVERRIDE_DATA_PATH',mq_file_path)
            break
        case "darwin":
            if (process.env.DYLD_LIBRARY_PATH){
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
    core.addPath(path.join(mq_file_path, '/bin'));
    core.addPath(path.join(mq_file_path, '/bin64'));

}

function extract(input, output){
    core.debug(`Archive path: ${input}`)
    core.debug(`Archive size: ${fs.statSync(input)['size']}`)
    
    core.info(`Extracting archive "${input}" to "${output}" ...`);
    decompress(input, output).then(
        files=> {
            core.info(`Archive extracted!`)
        },
        error=>{
            core.setFailed(error.message)
        })
        .catch(
            error=>{
                throw new Error(`Error occured!: ${error}`) 
            }
        )
}
