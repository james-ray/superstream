import fs from "fs";
import path from "path";

import { web3 } from "@project-serum/anchor";

export function readKeypair(filePath: string): web3.Keypair {
  const secretKey = readSecretKey(filePath);
  return web3.Keypair.fromSecretKey(secretKey);
}

function readSecretKey(filePath: string) {
  const secretKeyArray = JSON.parse(fs.readFileSync(path.resolve(filePath), "utf8"));
  return Uint8Array.from(secretKeyArray);
}
