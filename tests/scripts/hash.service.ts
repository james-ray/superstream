import { sha256 } from "js-sha256";
import create from "keccak";

export class HashService {
  static sha256(message: string): Buffer {
    return Buffer.from(sha256(message).toString(), "hex");
  }

  static keckka256(input: string | Buffer): Buffer {
    return create("keccak256").update(input).digest();
  }
}
