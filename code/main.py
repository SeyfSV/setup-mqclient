"""Install MQ Client."""

from tempfile import gettempdir
from platform import system
from os.path import join
from os import environ
from sys import argv

import requests
from shutil import unpack_archive

TEMP_PATH = gettempdir()

RDURL = 'https://public.dhe.ibm.com/ibmdl/export/pub/software/websphere/messaging/mqdev/redist'
RDTAR = 'IBM-MQC-Redist-LinuxX64.tar.gz'
RDZIP = 'IBM-MQC-Redist-Win64.zip'
VRMF = argv[1]

sys = system()

if sys == 'Linux':
    file_name = f'{VRMF}-{RDTAR}'
    mq_client_dir = '/opt/mqm'
elif sys == 'Windows':
    file_name = f'{VRMF}-{RDZIP}'
    mq_client_dir = 'c:/mqm'
else:
    raise EnvironmentError

environ['MQ_FILE_PATH'] = mq_client_dir

print(f'Downloading MQ Client {file_name} to folder {TEMP_PATH}...')

archive_name = f'{RDURL}/{file_name}'
with open(join(TEMP_PATH, file_name), 'wb') as f:
    f.write(requests.get(archive_name).content)

print('Download finished')

print('Unpacking archive...')
unpack_archive(archive_name, mq_client_dir)
print('Archive unpacked')
