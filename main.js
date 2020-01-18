const core = require('@actions/core')
const io = require('@actions/io')

const fs  = require('fs');

const RDURL = 'https://public.dhe.ibm.com/ibmdl/export/pub/software/websphere/messaging/mqdev/redist'
const RDURL_MAC = 'https://public.dhe.ibm.com/ibmdl/export/pub/software/websphere/messaging/mqdev/mactoolkit'
const RDTAR = 'IBM-MQC-Redist-LinuxX64.tar.gz'
const RDZIP = 'IBM-MQC-Redist-Win64.zip'
const MTTAR = 'IBM-MQ-Toolkit-MacX64.tar.gz'

const PATH_LINUX = '/opt/mqm'
const PATH_WIN = 'c:/Program Files (x86)/IBM/WebSphere MQ'
const PATH_MAC = '/Users/runner/mqm'

const VRMF = core.getInput('mq-client-version')
const INST_PATH = core.getInput('mq-file-path')

var os = require('os');
var platform = os.platform();
var file_name;
var mq_file_path
var url

switch (platform)
{
    case "linux":
        url = RDURL
        file_name = VRMF + '-' + RDTAR
        if (INST_PATH == '')
            mq_file_path = PATH_LINUX
        else
            mq_file_path = INST_PATH
        break;
    case "win32":
        url = RDURL
        file_name = VRMF + '-' + RDZIP
        if (INST_PATH == '')
            mq_file_path = PATH_WIN
        else
            mq_file_path = INST_PATH
        break;
    case "darwin":
        url = RDURL_MAC
        file_name = VRMF + '-' + MTTAR
        if (INST_PATH == '')
            mq_file_path = PATH_MAC
        else
            mq_file_path = INST_PATH
        break;
}

process.env.MQ_FILE_PATH = mq_file_path
core.info('MQ_FILE_PATH is '+ mq_file_path)


if (!fs.existsSync(mq_file_path)){
    fs.mkdirSync(mq_file_path, {recursive: true});
    core.info('Created dir ' + mq_file_path)
}

const https = require('https');
const decompress = require('decompress');
const unzip = require('node-unzip-2')

const file = fs.createWriteStream(mq_file_path + '/' + file_name)
const request = https.get(url + '/' + file_name,
    (res) => {
        core.info('statusCode:', res.statusCode);

        res.on('data', (d) => {
            file.write(d);
        });

        switch(platform)
        {
            case "win32":
                res.on('end', () => {
                    console.log('MQ Client downloaded')
                    console.log('Extracting archive "' + file_name + '" ...')
                    fs.createReadStream(mq_file_path + '/' + file_name)
                        .pipe(unzip.Extract({ path:  mq_file_path }));
                    console.log('Extracted')
                    })
                break
            case "linux":
                res.on('end', () => {
                    core.info('MQ Client downloaded')
                    core.info('Extracting archive "' + file_name + '" ...')
                    decompress(mq_file_path + '/' + file_name, mq_file_path).then(files=> {
                        core.info('Extracted')
                        if (process.env.LD_LIBRARY_PATH)
                            core.exportVariable('LD_LIBRARY_PATH', `${mq_file_path}/lib64:${process.env['LD_LIBRARY_PATH']}`)
                        else
                            core.exportVariable('LD_LIBRARY_PATH', `${mq_file_path}/lib64`)
                    })
                })
                break
            case "darwin":
                res.on('end', () => {
                    core.info('MQ Client downloaded')
                    core.info('Extracting archive "' + file_name + '" ...')
                    decompress(mq_file_path + '/' + file_name, mq_file_path).then(files=> {
                        core.info('Extracted')
                        const { exec } = require('child_process')

                        if (process.env.LD_LIBRARY_PATH){
                            core.exportVariable('LD_LIBRARY_PATH', `${mq_file_path}/lib64:${process.env['LD_LIBRARY_PATH']}`)
                        }
                        else {
                            core.exportVariable('LD_LIBRARY_PATH', `${mq_file_path}/lib64`)
                        }
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