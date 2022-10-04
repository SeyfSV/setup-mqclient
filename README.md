![tests](https://github.com/SeyfSV/setup-mqclient/workflows/tests/badge.svg?branch=master&event=push)
# setup-mqclient

This action sets up [IBM MQ redistributable client (Client)](https://www.ibm.com/support/knowledgecenter/SSFKSJ_9.1.0/com.ibm.mq.ins.doc/q122882_.htm) and [IBM MQ MacOS Toolkit (Toolkit)](https://developer.ibm.com/messaging/learn-mq/mq-tutorials/develop-mq-macos/) to Linux, Windows and MacOS [GitHub-hosted runners](https://help.github.com/en/actions/automating-your-workflow-with-github-actions/virtual-environments-for-github-hosted-runners).

Clients downloaded from https://public.dhe.ibm.com/ibmdl/export/pub/software/websphere/messaging/mqdev/redist

Toolkit downloaded from https://public.dhe.ibm.com/ibmdl/export/pub/software/websphere/messaging/mqdev/mactoolkit

Default installation paths are used for Clients and Toolkit installations:
* Windows: `%HOMEDRIVE%%HOMEPATH%\IBM\MQ\data`
* Linux: `$HOME/IBM/MQ/data`
* MacOS: `/opt/mqm`

Installation path can be changed with `mq-file-path` input parameter (can't be changed for MacOS).

By default Client and Toolkit downloaded to `setup-mqclient` direcory in the `Home` directory. You can use it for [caching](#caching).

Caching directory can be changed by using `download-path` input parameter.

Default directory of the data path can be changed with `mq-data-path` input parameter.

Action has output parameter `mq-file-path`, that contains installation path.

# Usage

See [action.yml](action.yml)

Basic:

```yaml
steps:
  - name: Install MQ Client
    uses: SeyfSV/setup-mqclient@v0.1.4
    with:
      mq-client-version: 9.3.0.0 # Exact version of a client or toolkit

    - run: dspmqver
```

<a name="caching">Caching</a> and matrix:

```yaml
strategy:
  matrix:
    environment: ['macos-latest', 'windows-latest', 'ubuntu-latest']
    mq-client-version: [9.1.0.0, 9.2.0.0, latest]
runs-on: ${{ matrix.environment}}
steps:
  - name: Cache MQ Client
    uses: actions/cache@v2
    with:
      path: ${{ github.workspace }}/setup-mqclient
      key: mqclient-${{ runner.os }}-${{ matrix.mq-client-version }}

  - name: Install MQ Client
    uses: SeyfSV/setup-mqclient@v0.1.4
    with:
      mq-client-version: ${{ matrix.mq-client-version }}

    - run: dspmqver
```

# License

The scripts and documentation in this project are released under the [MIT License](LICENSE)
