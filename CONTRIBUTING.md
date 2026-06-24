# Contributing

## Local hooks

Install [pre-commit](https://pre-commit.com/) and enable the repository hooks:

```sh
pip install pre-commit
pre-commit install
```

Hooks run on each commit and enforce:

- ABI snapshot hygiene (`abis/*.json` must change together with `COMEBACKHERE-contracts/contracts/*/src/`)
- Markdown linting
- Trailing whitespace detection
- End-of-file fixing (ensure files end with a newline)
- JSON validation

Run all hooks manually:

```sh
pre-commit run --all-files
```

## ABI snapshots

After changing contract interfaces (in `COMEBACKHERE-contracts/`), regenerate and verify ABI metadata:

```sh
make update-abi-snapshots
# or
just snapshot

make check-abi-snapshots
# or
just check-snapshot
```
