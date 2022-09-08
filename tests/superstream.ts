import { ok, strictEqual } from "assert";

import {
  AnchorError,
  AnchorProvider,
  BN,
  Program,
  setProvider,
  Spl,
  utils as anchorUtils,
  web3,
  workspace,
} from "@project-serum/anchor";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  createInitializeMintInstruction,
  createMintToInstruction,
  getAssociatedTokenAddress,
  getMinimumBalanceForRentExemptMint,
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import keccak256 = require("keccak256");

import { Superstream } from "../target/types/superstream";
import { MerkleTree } from "./scripts/merkle_tree";

const STREAM_ACCOUNT_SEED = "stream";
const ACTIVITY_ACCOUNT_SEED = "activity";
const DISTRIBUTOR_ACCOUNT_SEED = "distributor";

export class Claimer {
  pubKey!: web3.PublicKey;
  amount!: number;
}
export function claimersToLeaves(claimers: Claimer[]): Buffer[] {
  let i = -1;
  const leaves: Buffer[] = [];
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

export function getProof(tree: MerkleTree, index: number): Buffer[] {
  const nodes = tree.nodes();
  const proofs = [];
  let currentIndex = index;
  for (let i = 0; i < nodes.length - 1; i++) {
    const proof = currentIndex % 2 == 0 ? nodes[i][currentIndex + 1] : nodes[i][currentIndex - 1];
    currentIndex = (currentIndex - (currentIndex % 2)) / 2;
    proofs.push(proof);
  }
  const buffer: Buffer[] = [];
  proofs.forEach((x) => buffer.push(x.hash));
  return buffer;
}

describe("superstream", () => {
  const provider = AnchorProvider.env();
  setProvider(provider);

  const program = workspace.Superstream as Program<Superstream>;
  console.log("program id is " + program.programId);

  const sender = provider.wallet;

  const tokenProgram = Spl.token(provider);
  const fetchTokenAccount = async (publicKey: web3.PublicKey) => {
    return await tokenProgram.account.token.fetch(publicKey);
  };

  let mint = web3.PublicKey.default;
  let reward_mint = web3.PublicKey.default;
  let opt_reward_mint = web3.PublicKey.default;
  let senderToken = web3.PublicKey.default;
  let senderTokenAmount = new BN(1e10);

  it("Initializes test setup", async () => {
    console.log("111111111 program id is " + program.programId);
    mint = await createMint(provider);
    reward_mint = await createMint(provider);
    opt_reward_mint = await createMint(provider);
    senderToken = await createAssociatedTokenAccount(provider, mint, sender.publicKey);
    await mintTo(provider, mint, senderToken, Number(senderTokenAmount));
  });

  program.addEventListener("CreateStreamEvent", (event, slot) => {
    console.log("CreateStreamEvent stream: " + event["stream"]);
    console.log("CreateStreamEvent amount: " + event["amount"]);
    console.log("CreateStreamEvent slot: " + slot);
  });

  it("Creates a prepaid stream", async () => {
    const recipient = web3.Keypair.generate();
    const recipientToken = await createAssociatedTokenAccount(provider, mint, recipient.publicKey);

    const seed = new BN(0);
    const name = "s1";
    const [streamPublicKey] = getStreamPublicKey(program.programId, seed, mint, name);
    const escrowToken = await createAssociatedTokenAccount(provider, mint, streamPublicKey);
    const [activityPublicKey] = getActivityPublicKey(program.programId, seed, mint, name);
    const [distributorPublicKey, distributorBump] = getDistributorPublicKey(
      program.programId,
      seed,
      activityPublicKey,
      name,
    );
    const [rewardEscrowToken] = await createAssociatedTokenAccount(provider, mint, distributorPublicKey);
    const startAt = Math.floor(Date.now() / 1000);
    const secsInAYear = 365 * 24 * 60 * 60;
    const endsAt = startAt + secsInAYear;
    let senderTokenAccount = await fetchTokenAccount(senderToken);
    const previousAmount = senderTokenAccount.amount;
    console.log("senderTokenAccount.amount: " + senderTokenAccount.amount);

    let sig = await program.methods
      .createActivity(seed, name, new BN(0), new BN(endsAt), new BN(100000000), new BN(1000), new BN(1000), new BN(0))
      .accounts({
        activity: activityPublicKey,
        creator: sender.publicKey,
        stakeMint: mint,
        rewardMint: reward_mint,
        optRewardMint: opt_reward_mint,
        systemProgram: web3.SystemProgram.programId,
      })
      .rpc();
    console.log("createActivity sig is " + sig);

    sig = await program.methods
      .createPrepaid(
        seed,
        name,
        recipient.publicKey,
        new BN(0),
        new BN(endsAt),
        new BN(1000),
        new BN(2),
        new BN(20),
        true,
        new BN(0),
        true,
        new BN(0),
        true,
        new BN(0),
        true,
        new BN(0),
        true,
        new BN(0),
      )
      .accounts({
        stream: streamPublicKey,
        sender: sender.publicKey,
        mint,
        senderToken,
        escrowToken,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: web3.SystemProgram.programId,
      })
      .rpc();
    console.log("createPrepaid sig is " + sig);
    console.log("startAt is " + startAt + "  endsAt is " + endsAt);
    //  await sleep(49000);
    //  await  provider.connection.getTransaction(sig, new web3.GetTransactionConfig{}).then((value) => {
    //       console.log("txObj: "+value);
    //       console.log("txObj: "+value?.meta?.logMessages);
    //       var logs = value?.meta?.logMessages
    //       logs.forEach((element,i) => {
    //         console.log("log "+ i + " : "+element)
    //       });
    //     });
    await sleep(4000);
    const streamAccount = await program.account.stream.fetch(streamPublicKey);
    console.log(
      "---streamAccount.bump: " +
        streamAccount.bump +
        " initialAmount: " +
        streamAccount.initialAmount +
        " endsAt: " +
        streamAccount.endsAt,
    );
    const activityAccount = await program.account.activity.fetch(activityPublicKey);
    console.log(
      "---activityAccount.bump: " +
        activityAccount.bump +
        " minAmount: " +
        activityAccount.minAmount +
        " endsAt: " +
        streamAccount.endsAt,
    );
    senderTokenAccount = await fetchTokenAccount(senderToken);
    senderTokenAmount = senderTokenAccount.amount;
    console.log("updated senderTokenAmount after createPrepaid is " + senderTokenAmount);
    approximatelyEqualBN(senderTokenAccount.amount, new BN(previousAmount - 1000 - secsInAYear * 10));
    let recipientTokenAccount = await fetchTokenAccount(recipientToken);
    strictEqualBN(recipientTokenAccount.amount, new BN(0));

    const kpOne = web3.Keypair.generate();
    const kpTwo = web3.Keypair.generate();
    const kpThree = web3.Keypair.generate();

    const claimers = [
      {
        pubKey: sender.publicKey,
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

    const index = 0;
    const leaves = claimersToLeaves(claimers);
    const merkleTree = new MerkleTree(leaves);
    const root = merkleTree.root();
    let proof = getProof(merkleTree, index);

    sig = await program.methods
      .createDistributor(distributorBump, root.hash, new BN(1000))
      .accounts({
        distributor: distributorPublicKey,
        activity: activityPublicKey,
        mint: mint,
        creator: sender.publicKey,
        senderToken: senderToken,
        rewardEscrowToken: rewardEscrowToken,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: web3.SystemProgram.programId,
      })
      .rpc();
    console.log("createActivity sig is " + sig);

    await sleep(4000);
    const diffOnWithdraw = Math.floor(Date.now() / 1000) - startAt;

    await program.methods
      .withdraw(new BN(0), name, recipient.publicKey)
      .accounts({
        stream: streamPublicKey,
        signer: sender.publicKey,
        mint,
        recipientToken,
        escrowToken,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    recipientTokenAccount = await fetchTokenAccount(recipientToken);
    approximatelyEqualBN(recipientTokenAccount.amount, new BN(1000 + diffOnWithdraw * 10));

    sig = await program.methods
      .cancel(seed, name, recipient.publicKey)
      .accounts({
        stream: streamPublicKey,
        signer: sender.publicKey,
        sender: sender.publicKey,
        mint,
        signerToken: senderToken,
        senderToken,
        recipientToken,
        escrowToken,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();
    console.log("cancel sig is " + sig);

    const diffOnCancel = Math.floor(Date.now() / 1000) - startAt;

    senderTokenAccount = await fetchTokenAccount(senderToken);
    senderTokenAmount = senderTokenAccount.amount;
    console.log("updated senderTokenAmount after cancel is " + senderTokenAmount);
    approximatelyEqualBN(senderTokenAccount.amount, new BN(1e10 - 1000 - diffOnCancel * 10));
    recipientTokenAccount = await fetchTokenAccount(recipientToken);
    approximatelyEqualBN(recipientTokenAccount.amount, new BN(1000 + diffOnCancel * 10));

    await sleep(4000);

    await program.methods
      .withdraw(seed, name, recipient.publicKey)
      .accounts({
        stream: streamPublicKey,
        signer: sender.publicKey,
        mint,
        recipientToken,
        escrowToken,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    senderTokenAccount = await fetchTokenAccount(senderToken);
    senderTokenAmount = senderTokenAccount.amount;
    console.log("updated senderTokenAmount after withdraw is " + senderTokenAmount);
    approximatelyEqualBN(senderTokenAmount, new BN(1e10 - 1000 - diffOnCancel * 10));
    recipientTokenAccount = await fetchTokenAccount(recipientToken);
    approximatelyEqualBN(recipientTokenAccount.amount, new BN(1000 + diffOnCancel * 10));
  });

  it("Creates a non-prepaid stream", async () => {
    const recipient = web3.Keypair.generate();
    const recipientToken = await createAssociatedTokenAccount(provider, mint, recipient.publicKey);

    const seed = new BN(0);
    const name = "s2";
    const [streamPublicKey] = getStreamPublicKey(program.programId, seed, mint, name);
    const escrowToken = await createAssociatedTokenAccount(provider, mint, streamPublicKey);

    try {
      await program.methods
        .createNonPrepaid(
          seed,
          name,
          recipient.publicKey,
          new BN(0),
          new BN(0),
          new BN(1000),
          new BN(1),
          new BN(10),
          true,
          new BN(0),
          true,
          new BN(0),
          true,
          new BN(0),
          true,
          new BN(0),
          true,
          new BN(0),
          new BN(0),
        )
        .accounts({
          stream: streamPublicKey,
          sender: sender.publicKey,
          mint,
          senderToken,
          escrowToken,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: web3.SystemProgram.programId,
        })
        .rpc();
    } catch (e) {
      ok(e instanceof AnchorError);
      strictEqual(e.error.errorCode.number, 6012);
    }

    try {
      await program.methods
        .createNonPrepaid(
          seed,
          name,
          recipient.publicKey,
          new BN(0),
          new BN(0),
          new BN(1000),
          new BN(1),
          new BN(10),
          true,
          new BN(0),
          true,
          new BN(0),
          true,
          new BN(0),
          true,
          new BN(0),
          true,
          new BN(0),
          new BN(1),
        )
        .accounts({
          stream: streamPublicKey,
          sender: sender.publicKey,
          mint,
          senderToken,
          escrowToken,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: web3.SystemProgram.programId,
        })
        .rpc();
    } catch (e) {
      ok(e instanceof AnchorError);
      strictEqual(e.error.errorCode.number, 6015);
    }

    const startAt = Math.floor(Date.now() / 1000);

    await program.methods
      .createNonPrepaid(
        seed,
        name,
        recipient.publicKey,
        new BN(0),
        new BN(0),
        new BN(1000),
        new BN(1),
        new BN(10),
        true,
        new BN(0),
        true,
        new BN(0),
        true,
        new BN(0),
        true,
        new BN(0),
        true,
        new BN(0),
        new BN(1e7),
      )
      .accounts({
        stream: streamPublicKey,
        sender: sender.publicKey,
        mint,
        senderToken,
        escrowToken,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: web3.SystemProgram.programId,
      })
      .rpc();

    let senderTokenAccount = await fetchTokenAccount(senderToken);
    strictEqualBN(senderTokenAccount.amount, senderTokenAmount.sub(new BN(1e7)));
    let recipientTokenAccount = await fetchTokenAccount(recipientToken);
    strictEqualBN(recipientTokenAccount.amount, new BN(0));

    await sleep(4000);
    const diffOnWithdraw = Math.floor(Date.now() / 1000) - startAt;

    await program.methods
      .withdraw(seed, name, recipient.publicKey)
      .accounts({
        stream: streamPublicKey,
        signer: sender.publicKey,
        mint,
        recipientToken,
        escrowToken,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    senderTokenAccount = await fetchTokenAccount(senderToken);
    console.log("2222222 senderTokenAccount.amount: " + senderTokenAccount.amount);
    strictEqualBN(senderTokenAccount.amount, senderTokenAmount.sub(new BN(1e7)));
    recipientTokenAccount = await fetchTokenAccount(recipientToken);
    approximatelyEqualBN(recipientTokenAccount.amount, new BN(1000 + diffOnWithdraw * 10));

    const randomSigner = web3.Keypair.generate();
    const randomSignerToken = await createAssociatedTokenAccount(provider, mint, randomSigner.publicKey);

    try {
      await program.methods
        .cancel(seed, name, recipient.publicKey)
        .accounts({
          stream: streamPublicKey,
          signer: randomSigner.publicKey,
          sender: sender.publicKey,
          mint,
          signerToken: randomSignerToken,
          senderToken,
          recipientToken,
          escrowToken,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([randomSigner])
        .rpc();
    } catch (e) {
      ok(e instanceof AnchorError);
      strictEqual(e.error.errorCode.number, 6027);
    }

    await program.methods
      .cancel(seed, name, recipient.publicKey)
      .accounts({
        stream: streamPublicKey,
        signer: sender.publicKey,
        sender: sender.publicKey,
        mint,
        signerToken: senderToken,
        senderToken,
        recipientToken,
        escrowToken,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    const diffOnCancel = Math.floor(Date.now() / 1000) - startAt;

    senderTokenAccount = await fetchTokenAccount(senderToken);
    approximatelyEqualBN(senderTokenAccount.amount, senderTokenAmount.sub(new BN(1000 + diffOnCancel * 10)));
    recipientTokenAccount = await fetchTokenAccount(recipientToken);
    approximatelyEqualBN(recipientTokenAccount.amount, new BN(1000 + diffOnCancel * 10));

    await sleep(4000);

    await program.methods
      .withdraw(seed, name, recipient.publicKey)
      .accounts({
        stream: streamPublicKey,
        signer: sender.publicKey,
        mint,
        recipientToken,
        escrowToken,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    senderTokenAccount = await fetchTokenAccount(senderToken);
    approximatelyEqualBN(senderTokenAccount.amount, senderTokenAmount.sub(new BN(1000 + diffOnCancel * 10)));
    recipientTokenAccount = await fetchTokenAccount(recipientToken);
    approximatelyEqualBN(recipientTokenAccount.amount, new BN(1000 + diffOnCancel * 10));
  });
});

function strictEqualBN(actual: BN, expected: BN) {
  if (!actual.eq(expected)) {
    strictEqual(actual, expected);
  }
}

const DELTA = new BN(15);

function approximatelyEqualBN(actual: BN, expected: BN) {
  if (actual.lt(expected.sub(DELTA)) || actual.gt(expected.add(DELTA))) {
    strictEqual(actual.toString(), expected.toString());
  }
}

function getStreamPublicKey(
  programId: web3.PublicKey,
  seed: BN,
  mint: web3.PublicKey,
  name: string,
): [web3.PublicKey, number] {
  return anchorUtils.publicKey.findProgramAddressSync(
    [Buffer.from(STREAM_ACCOUNT_SEED), seed.toBuffer("le", 8), mint.toBuffer(), Buffer.from(name)],
    programId,
  );
}

function getActivityPublicKey(
  programId: web3.PublicKey,
  seed: BN,
  mint: web3.PublicKey,
  name: string,
): [web3.PublicKey, number] {
  return anchorUtils.publicKey.findProgramAddressSync(
    [Buffer.from(ACTIVITY_ACCOUNT_SEED), seed.toBuffer("le", 8), mint.toBuffer(), Buffer.from(name)],
    programId,
  );
}

function getDistributorPublicKey(
  programId: web3.PublicKey,
  seed: BN,
  mint: web3.PublicKey,
  name: string,
): [web3.PublicKey, number] {
  return anchorUtils.publicKey.findProgramAddressSync(
    [Buffer.from(DISTRIBUTOR_ACCOUNT_SEED), seed.toBuffer("le", 8), mint.toBuffer(), Buffer.from(name)],
    programId,
  );
}

async function createMint(provider: AnchorProvider): Promise<web3.PublicKey> {
  const authority = provider.wallet.publicKey;
  const mint = web3.Keypair.generate();
  const lamports = await getMinimumBalanceForRentExemptMint(provider.connection);

  const transaction = new web3.Transaction().add(
    web3.SystemProgram.createAccount({
      fromPubkey: provider.wallet.publicKey,
      newAccountPubkey: mint.publicKey,
      space: MINT_SIZE,
      lamports,
      programId: TOKEN_PROGRAM_ID,
    }),
    createInitializeMintInstruction(mint.publicKey, 9, authority, authority, TOKEN_PROGRAM_ID),
  );

  await provider.sendAndConfirm(transaction, [mint]);
  return mint.publicKey;
}

async function createAssociatedTokenAccount(
  provider: AnchorProvider,
  mint: web3.PublicKey,
  owner: web3.PublicKey,
): Promise<web3.PublicKey> {
  const [instructions, associatedTokenAccountPublicKey] = await createAssociatedTokenAccountInstructions(
    provider,
    mint,
    owner,
  );
  await provider.sendAndConfirm(new web3.Transaction().add(...instructions));
  return associatedTokenAccountPublicKey;
}

async function createAssociatedTokenAccountInstructions(
  provider: AnchorProvider,
  mint: web3.PublicKey,
  owner: web3.PublicKey,
): Promise<[web3.TransactionInstruction[], web3.PublicKey]> {
  const associatedToken = await getAssociatedTokenAddress(
    mint,
    owner,
    true,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );
  return [
    [
      createAssociatedTokenAccountInstruction(
        provider.wallet.publicKey,
        associatedToken,
        owner,
        mint,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID,
      ),
    ],
    associatedToken,
  ];
}

async function mintTo(
  provider: AnchorProvider,
  mint: web3.PublicKey,
  destination: web3.PublicKey,
  amount: number,
): Promise<void> {
  const transaction = new web3.Transaction().add(
    createMintToInstruction(mint, destination, provider.wallet.publicKey, amount),
  );
  await provider.sendAndConfirm(transaction);
}

function sleep(ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(() => {
      resolve();
    }, ms);
  });
}
