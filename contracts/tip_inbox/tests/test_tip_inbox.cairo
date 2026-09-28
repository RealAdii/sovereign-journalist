use snforge_std::{ContractClassTrait, DeclareResultTrait, declare, start_cheat_caller_address};
use starknet::ContractAddress;
use tip_inbox::{ITipInboxDispatcher, ITipInboxDispatcherTrait};

fn pool() -> ContractAddress {
    0x254a6b2997ef52e9f830ce1f543f6b29768295e8d17e2267d672c552cfe0d91.try_into().unwrap()
}

fn deploy_inbox() -> ITipInboxDispatcher {
    let contract = declare("TipInbox").unwrap().contract_class();
    let (address, _) = contract.deploy(@array![pool().into()]).unwrap();
    ITipInboxDispatcher { contract_address: address }
}

#[test]
fn stores_ciphertext_only_when_called_by_the_pool() {
    let inbox = deploy_inbox();
    start_cheat_caller_address(inbox.contract_address, pool());
    let ciphertext = array!['chunk-a', 'chunk-b'];
    let deposits = inbox.privacy_invoke(0x77, 0x11, 0x22, 0x33, 40, ciphertext.span());
    assert(deposits.len() == 0, 'NO_DEPOSITS');
    assert(inbox.get_tip_count(0x77) == 1, 'COUNT');
    let tip = inbox.get_tip(0x77, 0);
    assert(tip.ciphertext_byte_length == 40, 'LEN');
    assert(tip.ciphertext_chunks == 2, 'CHUNKS');
    assert(tip.ephemeral_key_x == 0x11, 'EPH_X');
    let stored = inbox.get_tip_chunks(0x77, 0, 0, 128);
    assert(stored.len() == 2, 'READ_LEN');
    assert(*stored.at(0) == 'chunk-a', 'C0');
    assert(*stored.at(1) == 'chunk-b', 'C1');
}

#[test]
#[should_panic(expected: 'CALLER_NOT_PRIVACY')]
fn rejects_direct_calls_from_a_wallet() {
    let inbox = deploy_inbox();
    let wallet: ContractAddress = 0x999.try_into().unwrap();
    start_cheat_caller_address(inbox.contract_address, wallet);
    inbox.privacy_invoke(0x77, 0x11, 0x22, 0x33, 7, array!['secret!'].span());
}

#[test]
#[should_panic(expected: 'CIPHERTEXT_TOO_LONG')]
fn rejects_oversized_ciphertext() {
    let inbox = deploy_inbox();
    start_cheat_caller_address(inbox.contract_address, pool());
    inbox.privacy_invoke(0x77, 0x11, 0x22, 0x33, 8193, array![1].span());
}

#[test]
#[should_panic(expected: 'INVALID_CHUNK_COUNT')]
fn rejects_mismatched_chunk_count() {
    let inbox = deploy_inbox();
    start_cheat_caller_address(inbox.contract_address, pool());
    inbox.privacy_invoke(0x77, 0x11, 0x22, 0x33, 62, array![1].span());
}

#[test]
#[should_panic(expected: 'TIP_NOT_FOUND')]
fn read_of_missing_tip_fails() {
    let inbox = deploy_inbox();
    inbox.get_tip(0x77, 0);
}
