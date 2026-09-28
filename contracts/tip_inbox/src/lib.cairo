use starknet::ContractAddress;

#[derive(Drop, Serde, starknet::Store)]
pub struct OpenNoteDeposit {
    pub note_id: felt252,
    pub token: ContractAddress,
    pub amount: u128,
}

#[starknet::interface]
pub trait ITipInbox<TContractState> {
    fn privacy_invoke(
        ref self: TContractState,
        recipient_tag: felt252,
        ephemeral_key_x: felt252,
        ephemeral_key_y: felt252,
        nonce: felt252,
        ciphertext_byte_length: u32,
        ciphertext: Span<felt252>,
    ) -> Span<OpenNoteDeposit>;
    fn get_tip_count(self: @TContractState, recipient_tag: felt252) -> u64;
    fn get_tip(self: @TContractState, recipient_tag: felt252, index: u64) -> EncryptedTip;
    fn get_tip_chunks(
        self: @TContractState, recipient_tag: felt252, index: u64, offset: u32, limit: u32,
    ) -> Array<felt252>;
}

#[derive(Drop, Serde, Copy, starknet::Store)]
pub struct EncryptedTip {
    pub ephemeral_key_x: felt252,
    pub ephemeral_key_y: felt252,
    pub nonce: felt252,
    pub ciphertext_byte_length: u32,
    pub ciphertext_chunks: u32,
    pub received_at: u64,
}

pub const MAX_CIPHERTEXT_BYTES: u32 = 8192;
pub const MAX_PAGE_CHUNKS: u32 = 128;

#[starknet::contract]
pub mod TipInbox {
    use super::{
        EncryptedTip, ITipInbox, MAX_CIPHERTEXT_BYTES, MAX_PAGE_CHUNKS, OpenNoteDeposit,
    };
    use core::num::traits::Zero;
    use starknet::storage::{
        Map, StorageMapReadAccess, StorageMapWriteAccess, StoragePointerReadAccess,
        StoragePointerWriteAccess,
    };
    use starknet::{ContractAddress, get_block_timestamp, get_caller_address};

    #[storage]
    struct Storage {
        privacy_pool: ContractAddress,
        tip_counts: Map<felt252, u64>,
        tips: Map<(felt252, u64), EncryptedTip>,
        chunks: Map<(felt252, u64, u32), felt252>,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        EncryptedTipReceived: EncryptedTipReceived,
    }

    #[derive(Drop, starknet::Event)]
    struct EncryptedTipReceived {
        #[key]
        recipient_tag: felt252,
        #[key]
        index: u64,
        ciphertext_byte_length: u32,
        received_at: u64,
    }

    #[constructor]
    fn constructor(ref self: ContractState, privacy_pool: ContractAddress) {
        assert(!privacy_pool.is_zero(), 'ZERO_POOL');
        self.privacy_pool.write(privacy_pool);
    }

    #[abi(embed_v0)]
    impl TipInboxImpl of ITipInbox<ContractState> {
        fn privacy_invoke(
            ref self: ContractState,
            recipient_tag: felt252,
            ephemeral_key_x: felt252,
            ephemeral_key_y: felt252,
            nonce: felt252,
            ciphertext_byte_length: u32,
            ciphertext: Span<felt252>,
        ) -> Span<OpenNoteDeposit> {
            assert(get_caller_address() == self.privacy_pool.read(), 'CALLER_NOT_PRIVACY');
            assert(recipient_tag != 0, 'ZERO_RECIPIENT_TAG');
            assert(ephemeral_key_x != 0 || ephemeral_key_y != 0, 'ZERO_EPHEMERAL_KEY');
            assert(ciphertext_byte_length > 0, 'EMPTY_CIPHERTEXT');
            assert(ciphertext_byte_length <= MAX_CIPHERTEXT_BYTES, 'CIPHERTEXT_TOO_LONG');
            let chunk_count: u32 = ciphertext.len().try_into().expect('CHUNK_OVERFLOW');
            let expected = (ciphertext_byte_length + 30) / 31;
            assert(chunk_count == expected, 'INVALID_CHUNK_COUNT');

            let index = self.tip_counts.read(recipient_tag);
            let received_at = get_block_timestamp();
            self.tips.write(
                (recipient_tag, index),
                EncryptedTip {
                    ephemeral_key_x,
                    ephemeral_key_y,
                    nonce,
                    ciphertext_byte_length,
                    ciphertext_chunks: chunk_count,
                    received_at,
                },
            );
            let mut chunk_index: u32 = 0;
            for chunk in ciphertext {
                self.chunks.write((recipient_tag, index, chunk_index), *chunk);
                chunk_index += 1;
            };
            self.tip_counts.write(recipient_tag, index + 1);
            self.emit(EncryptedTipReceived {
                recipient_tag, index, ciphertext_byte_length, received_at,
            });

            array![].span()
        }

        fn get_tip_count(self: @ContractState, recipient_tag: felt252) -> u64 {
            self.tip_counts.read(recipient_tag)
        }

        fn get_tip(self: @ContractState, recipient_tag: felt252, index: u64) -> EncryptedTip {
            assert(index < self.tip_counts.read(recipient_tag), 'TIP_NOT_FOUND');
            self.tips.read((recipient_tag, index))
        }

        fn get_tip_chunks(
            self: @ContractState, recipient_tag: felt252, index: u64, offset: u32, limit: u32,
        ) -> Array<felt252> {
            assert(index < self.tip_counts.read(recipient_tag), 'TIP_NOT_FOUND');
            assert(limit <= MAX_PAGE_CHUNKS, 'PAGE_TOO_LARGE');
            let tip = self.tips.read((recipient_tag, index));
            if offset >= tip.ciphertext_chunks || limit == 0 {
                return array![];
            };
            let end = if offset + limit > tip.ciphertext_chunks {
                tip.ciphertext_chunks
            } else {
                offset + limit
            };
            let mut result = array![];
            let mut chunk_index = offset;
            while chunk_index < end {
                result.append(self.chunks.read((recipient_tag, index, chunk_index)));
                chunk_index += 1;
            };
            result
        }
    }
}
