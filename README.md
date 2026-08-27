![tests](https://github.com/SeyfSV/setup-mqclient/workflows/tests/badge.svg?branch=master&event=push)
# setup-mqclient

This action sets up [IBM MQ redistributable client (Client)](https://www.ibm.com/docs/en/ibm-mq/9.4?topic=windows-installing-mq-redistributable-client) and [IBM MQ macOS Toolkit (Toolkit)](https://developer.ibm.com/tutorials/mq-macos-dev/) on Linux, Windows, and macOS [GitHub-hosted runners](https://docs.github.com/en/actions/using-github-hosted-runners/about-github-hosted-runners).

Clients are downloaded from https://public.dhe.ibm.com/ibmdl/export/pub/software/websphere/messaging/mqdev/redist

The toolkit is downloaded from https://public.dhe.ibm.com/ibmdl/export/pub/software/websphere/messaging/mqdev/mactoolkit

Default installation paths:
* Windows: `%HOMEDRIVE%%HOMEPATH%\IBM\MQ\data`
* Linux: `$HOME/IBM/MQ/data`
* macOS: `/opt/mqm`

Installation path can be changed with the `mq-file-path` input parameter (cannot be changed on macOS).

The action fails if `mq-file-path` already exists. To recreate it, set `clean-mq-file-path` to `true`. Default is `false`.

By default the Client and Toolkit archives are downloaded to the `distr` directory. You can cache that path; see [Caching](#caching).

The download directory can be changed with `download-path`. The MQ data directory can be changed with `mq-data-path`.

The action outputs `mq-file-path`, the installation path.

Existing workflows that use the v0.3 inputs (`mq-client-version`, `mq-file-path`, `mq-data-path`, `download-path`, `force-download`, `clean-mq-file-path`) keep working without YAML changes. Pin a newer tag when you update.

On macOS the toolkit `.pkg` is installed with `installer -allowUntrusted`. IBM's developer toolkit packages are not always signed with a certificate Apple currently trusts in CI images.

# Usage

See [action.yml](action.yml)

Basic:

```yaml
steps:
  - name: Install MQ Client
    uses: SeyfSV/setup-mqclient@v0.3.0
    with:
      mq-client-version: 9.3.0.0 # Exact version of a client or toolkit

  - run: dspmqver
```

<a name="caching">Caching</a> and matrix:

```yaml
strategy:
  matrix:
    environment: ['macos-latest', 'windows-latest', 'ubuntu-latest']
    mq-client-version: [9.3.0.0, latest]
runs-on: ${{ matrix.environment }}
steps:
  - name: Cache MQ Client
    uses: actions/cache@v5
    with:
      path: ${{ github.workspace }}/distr
      key: mqclient-${{ runner.os }}-${{ matrix.mq-client-version }}

  - name: Install MQ Client
    uses: SeyfSV/setup-mqclient@v0.3.0
    with:
      mq-client-version: ${{ matrix.mq-client-version }}
      download-path: ${{ github.workspace }}/distr

  - run: dspmqver
```

# License

The scripts and documentation in this project are released under the [MIT License](LICENSE)
