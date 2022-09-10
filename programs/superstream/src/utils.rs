use anchor_lang::prelude::*;
use anchor_spl::token::TokenAccount;

pub(crate) fn get_current_timestamp() -> Result<u64> {
    let clock = Clock::get()?;
    Ok(clock.unix_timestamp as u64)
}

pub(crate) fn is_token_account_rent_exempt<T: AccountSerialize + AccountDeserialize + Owner + Clone>(
    account: &Account<T>,
) -> Result<bool> {
    Ok(Rent::get()?.is_exempt(account.to_account_info().lamports(), TokenAccount::LEN))
}


pub(crate) fn verify(proof: Vec<[u8; 32]>, root: [u8; 32], leaf: [u8; 32]) -> bool {
    let mut computed_hash = leaf;
    for proof_element in proof.into_iter() {
        if computed_hash <= proof_element {
            // Hash(current computed hash + current element of the proof)
            computed_hash =
                anchor_lang::solana_program::keccak::hashv(&[&computed_hash, &proof_element]).0;
        } else {
            // Hash(current element of the proof + current computed hash)
            computed_hash =
                anchor_lang::solana_program::keccak::hashv(&[&proof_element, &computed_hash]).0;
        }
        let mut i = 0;
        msg!("proof_element =");
        while i < 32{
            msg!("i {} ele {}", i, proof_element[i]);
            i+=1;
        }
        msg!("computed_hash =");
        i = 0;
        while i < 32{
            msg!("i {} computed ele {}", i, computed_hash[i]);
            i+=1;
        }
    }
    let mut i = 0;
        msg!("root =");
        while i < 32{
            msg!("i {} root ele {}", i, root[i]);
            i+=1;
        }
    // Check if the computed hash (root) is equal to the provided root
    computed_hash == root
}