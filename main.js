const core = require('@actions/core')
const io = require('@actions/io')
const fs  = require('fs');

const REDIST_URL_LNX = 'https://public.dhe.ibm.com/ibmdl/export/pub/software/websphere/messaging/mqdev/redist'
const REDIST_URL_WIN = REDIST_URL_LNX
const TOOLKIT_URL_MAC = 'https://public.dhe.ibm.com/ibmdl/export/pub/software/websphere/messaging/mqdev/mactoolkit'
const ARCHIVE_LNX = 'IBM-MQC-Redist-LinuxX64.tar.gz'
const ARCHIVE_WIN = 'IBM-MQC-Redist-Win64.zip'
const ARCHIVE_MAC = 'IBM-MQ-Toolkit-MacX64.tar.gz'

const PATH_LINUX = '~/IBM/MQ'
const PATH_WIN = 'c:/Program Files (x86)/IBM/WebSphere MQ'
const PATH_MAC = '~/IBM/MQ'
const PATH_DATA_MAC = '~/IBM/MQ/data'

const MQ_CLIENT_VERSION = core.getInput('mq-client-version')
const PATH_INST = core.getInput('mq-file-path')

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
        url = REDIST_URL_LNX
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

const https = require('https');
const decompress = require('decompress');
const unzip = require('node-unzip-2')

const file = fs.createWriteStream(mq_file_path + '/' + file_name)
const request = https.get(url + '/' + file_name,
    (res) => {
        res.on('data', (d) => {
            file.write(d);
        });

        switch(platform)
        {
            case "win32":
                res.on('end', () => {
                    console.log('MQ Client downloaded')
                    console.log('Extracting archive "' + file_name + '" ...')
                    // fs.createReadStream(mq_file_path + '/' + file_name)
                    //     .pipe(unzip.Extract({ path:  mq_file_path }));
                    decompress(mq_file_path + '/' + file_name, mq_file_path).then(files=> {
                        core.info('Extracted')
                    })
                })
                break
            case "linux":
                res.on('end', () => {
                    core.info('MQ Client downloaded')
                    core.info('Extracting archive "' + file_name + '" ...')
                    decompress(mq_file_path + '/' + file_name, mq_file_path).then(files=> {
                        core.info('Extracted')
                        if (process.env.LD_LIBRARY_PATH)
                            lib_path = `${mq_file_path}/lib64:${process.env['LD_LIBRARY_PATH']}`
                        else
                            lib_path = `${mq_file_path}/lib64`
                        core.exportVariable('LD_LIBRARY_PATH', lib_path)
                        core.exportVariable('mq-lib-var', `LD_LIBRARY_PATH`)
                        core.exportVariable('mq-lib-path', `${mq_file_path}/lib64`)
                    })
                })
                break
            case "darwin":
                res.on('end', () => {
                    core.info('MQ Client downloaded')
                    core.info('Extracting archive "' + file_name + '" ...')
                    decompress(mq_file_path + '/' + file_name, mq_file_path).then(files=> {
                        core.info('Extracted')

                        if (process.env.DYLD_LIBRARY_PATH){
                            lib_path = `${mq_file_path}/lib64:${process.env['DYLD_LIBRARY_PATH']}`
                        }
                        else {
                            lib_path = `${mq_file_path}/lib64`
                        }
                        core.exportVariable('DYLD_LIBRARY_PATH', lib_path)
                        core.exportVariable('mq-lib-var', `DYLD_LIBRARY_PATH`)
                        core.exportVariable('mq-lib-path', `${mq_file_path}/lib64`)
                    })
                })
                break
        }
        core.addPath(mq_file_path + '/bin');
        core.addPath(mq_file_path + '/bin64');
    });

request.on('error', (e) => {
    core.error(e.message)}
)

request.end()