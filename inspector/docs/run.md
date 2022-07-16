# `inspector run`

Run inspector process.

```shell
USAGE
  $ inspector run -w <value> [-c devnet|testnet|localnet] [-d] [-j]

FLAGS
  -c, --cluster=<option>  [default: devnet] Solana cluster
                          <options: devnet|testnet|localnet>
  -d, --debug             Show debug output
  -j, --json              Show output as JSON
  -w, --wallet=<value>    (required) Wallet keypair JSON file path

DESCRIPTION
  Run inspector process.

EXAMPLES
  $ inspector run -w ~/.config/solana/id.json

  $ inspector run -c testnet -w ~/.config/solana/id.json
```

*See code [/src/commands/run.ts](../src/commands/run.ts)*
