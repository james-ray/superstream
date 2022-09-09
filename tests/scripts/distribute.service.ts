/* eslint-disable prettier/prettier */
import { BN } from "@project-serum/anchor";
import * as borsh from "@project-serum/borsh";
import {
  createAccount,
  createMint,
  getAccount,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  AccountMeta,
  Transaction,
  TransactionInstruction,
  PublicKey,
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction,
  SystemProgram,
} from "@solana/web3.js";

import { BorshService } from "./borsh.service";
import { MerkleTree } from "./merkle_tree";
import keccak256 from "keccak256";

//let connection = new Connection('https://api.devnet.solana.com', 'confirmed')
let connection = new Connection("http://127.0.0.1:8899", "confirmed");
let programId = new PublicKey("GLfs2uXqmGoun5X4eTVxS7TcRPqw5dnsWvtEPzJzAq4v");

export class CreateDistributor {
  bump: number;
  root: Buffer;
  totalClaimed: BN;
}

export class Claim {
  index: BN;
  amount: BN;
  proof: Buffer[];
}

export class CreateDistributorRequest {
  bump: number;
  root: Buffer;
  totalClaimed: BN;
}

export class ClaimRequest {
  bump: number;
  index: BN;
  amount: BN;
  proof: Buffer[];
}

export class CreateAccountDistributor {
  mint: PublicKey;
  payer: Keypair;
  tokenAccountSender: PublicKey;
  distributorAddress: PublicKey;
  bump: number;
}

export class Claimer {
  pubKey: PublicKey;
  amount: number;
}

const DISTRIBUTE_PROGRAM_LAYOUTS = {
  CREATE_DISTRIBUTOR: <borsh.Layout<CreateDistributor>>(
    borsh.struct([borsh.u8("bump"), borsh.array<number>(borsh.u8(), 32, "root"), borsh.i64("totalClaimed")])
  ),

  CLAIM: <borsh.Layout<Claim>>(
    borsh.struct([
      borsh.u8("bump"),
      borsh.u64("index"),
      borsh.u64("amount"),
      borsh.vec(borsh.array(borsh.u8(), 32), "proof"),
    ])
  ),
};

export async function getAirdrop(key: PublicKey) {
  const sig = await connection.requestAirdrop(key, LAMPORTS_PER_SOL);
  await connection.confirmTransaction(sig);
  console.log("using account", sig);
}

export async function createDistributor(
  root: Buffer,
  totalClaimed: BN,
  distributeProgramId: PublicKey,
  _mint: PublicKey,
  _payer: Keypair,
  _distributorAddress: PublicKey,
  _bump: number,
): Promise<void> {
  const payer = _payer;
  const mintPubkey = _mint;
  const distributorAddress = _distributorAddress;
  const transaction: Transaction = new Transaction();
  const request: CreateDistributorRequest = {
    bump: _bump,
    root: root,
    totalClaimed: totalClaimed,
  };

  const data: Buffer = BorshService.anchorSerialize(
    "create_distributor",
    DISTRIBUTE_PROGRAM_LAYOUTS.CREATE_DISTRIBUTOR,
    request,
    4000,
  );

  const keys: AccountMeta[] = [
    <AccountMeta>{ pubkey: payer.publicKey, isSigner: true, isWritable: true },
    <AccountMeta>{ pubkey: distributorAddress, isSigner: false, isWritable: true },
    <AccountMeta>{ pubkey: mintPubkey, isSigner: false, isWritable: false },
    <AccountMeta>{ pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];

  const instruction = new TransactionInstruction({
    keys,
    data,
    programId: distributeProgramId,
  });

  const txSignature = await sendAndConfirmTransaction(connection, new Transaction().add(instruction), [payer]);
  console.log(txSignature);
}

export async function claim(
  index: BN,
  amount: BN,
  proof: Buffer[],
  _mintPubkey: PublicKey,
  _tokenAccountSender: PublicKey,
  _distributeAddress: PublicKey,
  claimer: Keypair,
): Promise<void> {
  const tokenAccountSender = _tokenAccountSender;
  const distributorAddress = _distributeAddress;
  let mintPubkey = _mintPubkey;

  const [statusAddress, _bump] = await findStatusAddress(distributorAddress, claimer.publicKey, programId);

  const request: ClaimRequest = {
    bump: _bump,
    index: index,
    amount: amount,
    proof: proof,
  };

  const data: Buffer = BorshService.anchorSerialize("claim", DISTRIBUTE_PROGRAM_LAYOUTS.CLAIM, request, 4000);

  const tokenAccountRecipent = Keypair.generate();

  await getAirdrop(claimer.publicKey);

  let tokenAccountRecipentPubkey = await createAccount(
    connection, // connection
    claimer, // fee payer
    mintPubkey, // mint
    claimer.publicKey, // owner
    tokenAccountRecipent, // token account (if you don't pass it, it will use ATA for you)
  );

  const keys: AccountMeta[] = [
    <AccountMeta>{ pubkey: distributorAddress, isSigner: false, isWritable: true },
    <AccountMeta>{ pubkey: tokenAccountSender, isSigner: false, isWritable: true },
    <AccountMeta>{ pubkey: tokenAccountRecipentPubkey, isSigner: false, isWritable: true },
    <AccountMeta>{ pubkey: claimer.publicKey, isSigner: true, isWritable: true },
    <AccountMeta>{ pubkey: statusAddress, isSigner: false, isWritable: true },
    <AccountMeta>{ pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    <AccountMeta>{ pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];

  const instruction = new TransactionInstruction({
    keys,
    data,
    programId: programId,
  });

  const txSignature = await sendAndConfirmTransaction(connection, new Transaction().add(instruction), [claimer]);
  console.log(txSignature);
}

export async function findDistributorAddress(
  distributorAddress: PublicKey,
  distributeProgramId: PublicKey,
): Promise<[PublicKey, number]> {
  const prefix: Buffer = Buffer.from("Distributor");
  return PublicKey.findProgramAddress([prefix, distributorAddress.toBuffer()], distributeProgramId);
}

export async function findStatusAddress(
  distributorAddress: PublicKey,
  claimer: PublicKey,
  distributeProgramId: PublicKey,
): Promise<[PublicKey, number]> {
  const prefix: Buffer = Buffer.from("Status");
  console.log(prefix);
  return PublicKey.findProgramAddress([prefix, distributorAddress.toBuffer(), claimer.toBuffer()], distributeProgramId);
}

export async function createAccountDistributor(): Promise<CreateAccountDistributor> {
  let payer = Keypair.generate();

  await getAirdrop(payer.publicKey);
  let mintPubkey = await createMint(
    connection, // conneciton
    payer, // fee payer
    payer.publicKey, // mint authority
    payer.publicKey, // freeze authority (you can use `null` to disable it. when you disable it, you can't turn it on again)
    8, // decimals
  );

  const [distributorAddress, _bump] = await findDistributorAddress(payer.publicKey, programId);

  // Get the token account of the fromWallet address, and if it does not exist, create it
  const fromTokenAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    mintPubkey,
    distributorAddress,
    true,
  );

  await mintTo(connection, payer, mintPubkey, fromTokenAccount.address, payer, 1000000);

  let createAccountDistributor: CreateAccountDistributor = {
    mint: mintPubkey,
    payer: payer,
    tokenAccountSender: fromTokenAccount.address,
    distributorAddress: distributorAddress,
    bump: _bump,
  };

  return createAccountDistributor;
}

export function getProof(tree: MerkleTree, index: number): Buffer[] {
  const nodes = tree.nodes();
  const proofs = [];
  let currentIndex = index;
  for (let i = 0; i < nodes.length - 1; i++) {
    const proof = currentIndex % 2 == 0 ? nodes[i][currentIndex + 1] : nodes[i][currentIndex - 1];
    currentIndex = (currentIndex - (currentIndex % 2)) / 2;
    proofs.push(proof);
  }
  let buffer: Buffer[] = [];
  proofs.forEach((x) => buffer.push(x.hash));
  return buffer;
}

export function claimersToLeaves(claimers: Claimer[]): Buffer[] {
  let i = -1;
  let leaves: Buffer[] = [];
  claimers.map((x) =>
    leaves.push(
      Buffer.from(
        keccak256(
          Buffer.concat([
            new BN((i += 1)).toArrayLike(Buffer, "le", 8),
            x.pubKey.toBuffer(),
            new BN(x.amount).toArrayLike(Buffer, "le", 8),
          ]),
        ),
      ),
    ),
  );
  return leaves;
}

const kpOne = Keypair.generate();
const kpTwo = Keypair.generate();
const kpThree = Keypair.generate();
const claimer = Keypair.generate();

const claimers = [
  {
    pubKey: claimer.publicKey,
    amount: 10,
  },
  {
    pubKey: kpOne.publicKey,
    amount: 5,
  },
  {
    pubKey: kpTwo.publicKey,
    amount: 15,
  },
  {
    pubKey: kpThree.publicKey,
    amount: 20,
  },
];

const main = async () => {
  const index = 0;
  const amount = 10;
  const max_claim = 10;
  const leaves = claimersToLeaves(claimers);
  const merkleTree = new MerkleTree(leaves);
  const root = merkleTree.root();
  let proof = getProof(merkleTree, index);

  //const distributorAccount = await createAccountDistributor();

//   await createDistributor(
//     root.hash,
//     new BN(max_claim),
//     programId,
//     distributorAccount.mint,
//     distributorAccount.payer,
//     distributorAccount.distributorAddress,
//     distributorAccount.bump,
//   );

//   await claim(
//     new BN(index),
//     new BN(amount),
//     proof,
//     distributorAccount.mint,
//     distributorAccount.tokenAccountSender,
//     distributorAccount.distributorAddress,
//     claimer,
//   );
 };

// main()
//   .then(() => {
//     console.log("Success");
//   })
//   .catch((e) => {
//     console.error(e);
//   });
