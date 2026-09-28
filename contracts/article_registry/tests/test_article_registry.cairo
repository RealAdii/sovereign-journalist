use article_registry::{IArticleRegistryDispatcher, IArticleRegistryDispatcherTrait};
use snforge_std::{ContractClassTrait, DeclareResultTrait, declare, start_cheat_caller_address};
use starknet::ContractAddress;

fn deploy_registry(publisher: ContractAddress) -> IArticleRegistryDispatcher {
    let contract = declare("ArticleRegistry").unwrap().contract_class();
    let (address, _) = contract.deploy(@array![publisher.into()]).unwrap();
    IArticleRegistryDispatcher { contract_address: address }
}

#[test]
fn stores_and_reads_every_chunk() {
    let publisher: ContractAddress = 0x123.try_into().unwrap();
    let registry = deploy_registry(publisher);
    start_cheat_caller_address(registry.contract_address, publisher);

    let title = array!['A title'];
    let subtitle = array!['A subtitle'];
    let body = array!['first chunk', 'second chunk'];
    registry.publish_article(0xabc, 0xdef, 7, title.span(), 10, subtitle.span(), 32, body.span());

    assert(registry.get_article_count() == 1, 'COUNT');
    assert(registry.get_article_id(0) == 0xabc, 'ID');
    let meta = registry.get_article_meta(0xabc);
    assert(meta.approved_digest == 0xdef, 'DIGEST');
    assert(meta.body_byte_length == 32, 'BODY_LENGTH');
    assert(meta.body_chunks == 2, 'BODY_CHUNKS');
    let stored: Array<felt252> = registry.get_article_chunks(0xabc, 2, 0, 128);
    assert(stored.len() == 2, 'READ_LENGTH');
    assert(*stored.at(0) == 'first chunk', 'CHUNK_ONE');
    assert(*stored.at(1) == 'second chunk', 'CHUNK_TWO');
}

#[test]
#[should_panic(expected: 'NOT_PUBLISHER')]
fn rejects_unauthorized_publisher() {
    let publisher: ContractAddress = 0x123.try_into().unwrap();
    let attacker: ContractAddress = 0x456.try_into().unwrap();
    let registry = deploy_registry(publisher);
    start_cheat_caller_address(registry.contract_address, attacker);
    registry.publish_article(0xabc, 0xdef, 1, array![1].span(), 0, array![].span(), 1, array![2].span());
}

#[test]
#[should_panic(expected: 'DUPLICATE_ARTICLE')]
fn rejects_duplicate_article_id() {
    let publisher: ContractAddress = 0x123.try_into().unwrap();
    let registry = deploy_registry(publisher);
    start_cheat_caller_address(registry.contract_address, publisher);
    registry.publish_article(0xabc, 0xdef, 1, array![1].span(), 0, array![].span(), 1, array![2].span());
    registry.publish_article(0xabc, 0xdef, 1, array![1].span(), 0, array![].span(), 1, array![2].span());
}

#[test]
#[should_panic(expected: 'BODY_TOO_LONG')]
fn rejects_body_over_limit() {
    let publisher: ContractAddress = 0x123.try_into().unwrap();
    let registry = deploy_registry(publisher);
    start_cheat_caller_address(registry.contract_address, publisher);
    registry.publish_article(0xabc, 0xdef, 1, array![1].span(), 0, array![].span(), 24577, array![2].span());
}

#[test]
#[should_panic(expected: 'INVALID_CHUNK_COUNT')]
fn rejects_chunk_count_that_disagrees_with_byte_length() {
    let publisher: ContractAddress = 0x123.try_into().unwrap();
    let registry = deploy_registry(publisher);
    start_cheat_caller_address(registry.contract_address, publisher);
    registry.publish_article(0xabc, 0xdef, 40, array![1].span(), 0, array![].span(), 1, array![2].span());
}

#[test]
#[should_panic(expected: 'NOT_OWNER')]
fn only_owner_can_rotate_publisher() {
    let publisher: ContractAddress = 0x123.try_into().unwrap();
    let registry = deploy_registry(publisher);
    start_cheat_caller_address(registry.contract_address, publisher);
    registry.set_publisher(publisher);
}

#[test]
fn paginates_body_chunks_and_rejects_out_of_range_index() {
    let publisher: ContractAddress = 0x123.try_into().unwrap();
    let registry = deploy_registry(publisher);
    start_cheat_caller_address(registry.contract_address, publisher);
    let mut body = array![];
    let mut i: felt252 = 0;
    while i != 200 {
        body.append(i + 1);
        i += 1;
    };
    registry.publish_article(0xabc, 0xdef, 1, array![1].span(), 0, array![].span(), 6200, body.span());
    let page1 = registry.get_article_chunks(0xabc, 2, 0, 128);
    let page2 = registry.get_article_chunks(0xabc, 2, 128, 128);
    assert(page1.len() == 128, 'PAGE1');
    assert(page2.len() == 72, 'PAGE2');
    assert(*page2.at(71) == 200, 'LAST');
    let empty = registry.get_article_chunks(0xabc, 2, 200, 128);
    assert(empty.len() == 0, 'EMPTY');
}
