use starknet::ContractAddress;

#[starknet::interface]
pub trait IArticleRegistry<TContractState> {
    fn publish_article(
        ref self: TContractState,
        article_id: felt252,
        approved_digest: felt252,
        title_byte_length: u32,
        title: Span<felt252>,
        subtitle_byte_length: u32,
        subtitle: Span<felt252>,
        body_byte_length: u32,
        body: Span<felt252>,
    );

    fn get_article_count(self: @TContractState) -> u64;
    fn get_article_id(self: @TContractState, index: u64) -> felt252;
    fn get_article_meta(self: @TContractState, article_id: felt252) -> ArticleMeta;
    fn get_article_chunks(
        self: @TContractState, article_id: felt252, section: u8, offset: u32, limit: u32,
    ) -> Array<felt252>;
    fn set_publisher(ref self: TContractState, publisher: ContractAddress);
    fn get_publisher(self: @TContractState) -> ContractAddress;
}

#[derive(Drop, Serde, Copy, starknet::Store)]
pub struct ArticleMeta {
    pub exists: bool,
    pub approved_digest: felt252,
    pub published_at: u64,
    pub title_byte_length: u32,
    pub title_chunks: u32,
    pub subtitle_byte_length: u32,
    pub subtitle_chunks: u32,
    pub body_byte_length: u32,
    pub body_chunks: u32,
    pub version: u16,
}

pub const TITLE_SECTION: u8 = 0;
pub const SUBTITLE_SECTION: u8 = 1;
pub const BODY_SECTION: u8 = 2;
pub const MAX_TITLE_BYTES: u32 = 180;
pub const MAX_SUBTITLE_BYTES: u32 = 420;
pub const MAX_BODY_BYTES: u32 = 24576;
pub const MAX_PAGE_CHUNKS: u32 = 128;

#[starknet::contract]
pub mod ArticleRegistry {
    use super::{
        ArticleMeta, BODY_SECTION, IArticleRegistry, MAX_BODY_BYTES, MAX_PAGE_CHUNKS,
        MAX_SUBTITLE_BYTES, MAX_TITLE_BYTES, SUBTITLE_SECTION, TITLE_SECTION,
    };
    use core::num::traits::Zero;
    use starknet::storage::{
        Map, StorageMapReadAccess, StorageMapWriteAccess, StoragePointerReadAccess,
        StoragePointerWriteAccess,
    };
    use starknet::{ContractAddress, get_block_timestamp, get_caller_address};

    #[storage]
    struct Storage {
        owner: ContractAddress,
        publisher: ContractAddress,
        article_count: u64,
        article_ids: Map<u64, felt252>,
        articles: Map<felt252, ArticleMeta>,
        chunks: Map<(felt252, u8, u32), felt252>,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        ArticlePublished: ArticlePublished,
        PublisherChanged: PublisherChanged,
    }

    #[derive(Drop, starknet::Event)]
    struct ArticlePublished {
        #[key]
        article_id: felt252,
        #[key]
        approved_digest: felt252,
        published_at: u64,
        title_byte_length: u32,
        subtitle_byte_length: u32,
        body_byte_length: u32,
        version: u16,
    }

    #[derive(Drop, starknet::Event)]
    struct PublisherChanged {
        #[key]
        publisher: ContractAddress,
    }

    #[constructor]
    fn constructor(ref self: ContractState, publisher: ContractAddress) {
        assert(!publisher.is_zero(), 'ZERO_PUBLISHER');
        let caller = get_caller_address();
        self.owner.write(caller);
        self.publisher.write(publisher);
    }

    #[abi(embed_v0)]
    impl ArticleRegistryImpl of IArticleRegistry<ContractState> {
        fn publish_article(
            ref self: ContractState,
            article_id: felt252,
            approved_digest: felt252,
            title_byte_length: u32,
            title: Span<felt252>,
            subtitle_byte_length: u32,
            subtitle: Span<felt252>,
            body_byte_length: u32,
            body: Span<felt252>,
        ) {
            assert(get_caller_address() == self.publisher.read(), 'NOT_PUBLISHER');
            assert(article_id != 0, 'ZERO_ARTICLE_ID');
            assert(approved_digest != 0, 'ZERO_DIGEST');
            assert(!self.articles.read(article_id).exists, 'DUPLICATE_ARTICLE');
            assert(title_byte_length > 0, 'EMPTY_TITLE');
            assert(body_byte_length > 0, 'EMPTY_BODY');
            assert(title_byte_length <= MAX_TITLE_BYTES, 'TITLE_TOO_LONG');
            assert(subtitle_byte_length <= MAX_SUBTITLE_BYTES, 'SUBTITLE_TOO_LONG');
            assert(body_byte_length <= MAX_BODY_BYTES, 'BODY_TOO_LONG');

            let title_chunks: u32 = title.len().try_into().expect('TITLE_CHUNK_OVERFLOW');
            let subtitle_chunks: u32 = subtitle.len().try_into().expect('SUB_CHUNK_OVERFLOW');
            let body_chunks: u32 = body.len().try_into().expect('BODY_CHUNK_OVERFLOW');
            assert_chunk_count(title_byte_length, title_chunks);
            assert_chunk_count(subtitle_byte_length, subtitle_chunks);
            assert_chunk_count(body_byte_length, body_chunks);

            write_chunks(ref self, article_id, TITLE_SECTION, title);
            write_chunks(ref self, article_id, SUBTITLE_SECTION, subtitle);
            write_chunks(ref self, article_id, BODY_SECTION, body);

            let published_at = get_block_timestamp();
            let meta = ArticleMeta {
                exists: true,
                approved_digest,
                published_at,
                title_byte_length,
                title_chunks,
                subtitle_byte_length,
                subtitle_chunks,
                body_byte_length,
                body_chunks,
                version: 1,
            };
            self.articles.write(article_id, meta);
            let index = self.article_count.read();
            self.article_ids.write(index, article_id);
            self.article_count.write(index + 1);

            self.emit(ArticlePublished {
                article_id,
                approved_digest,
                published_at,
                title_byte_length,
                subtitle_byte_length,
                body_byte_length,
                version: 1,
            });
        }

        fn get_article_count(self: @ContractState) -> u64 {
            self.article_count.read()
        }

        fn get_article_id(self: @ContractState, index: u64) -> felt252 {
            assert(index < self.article_count.read(), 'INDEX_OUT_OF_RANGE');
            self.article_ids.read(index)
        }

        fn get_article_meta(self: @ContractState, article_id: felt252) -> ArticleMeta {
            let meta = self.articles.read(article_id);
            assert(meta.exists, 'ARTICLE_NOT_FOUND');
            meta
        }

        fn get_article_chunks(
            self: @ContractState, article_id: felt252, section: u8, offset: u32, limit: u32,
        ) -> Array<felt252> {
            let meta = self.articles.read(article_id);
            assert(meta.exists, 'ARTICLE_NOT_FOUND');
            assert(section <= BODY_SECTION, 'INVALID_SECTION');
            assert(limit <= MAX_PAGE_CHUNKS, 'PAGE_TOO_LARGE');

            let total = section_chunk_count(meta, section);
            if offset >= total || limit == 0 {
                return array![];
            };
            let end = if offset + limit > total { total } else { offset + limit };
            let mut result = array![];
            let mut index = offset;
            while index < end {
                result.append(self.chunks.read((article_id, section, index)));
                index += 1;
            };
            result
        }

        fn set_publisher(ref self: ContractState, publisher: ContractAddress) {
            assert(get_caller_address() == self.owner.read(), 'NOT_OWNER');
            assert(!publisher.is_zero(), 'ZERO_PUBLISHER');
            self.publisher.write(publisher);
            self.emit(PublisherChanged { publisher });
        }

        fn get_publisher(self: @ContractState) -> ContractAddress {
            self.publisher.read()
        }
    }

    fn assert_chunk_count(byte_length: u32, chunks: u32) {
        let expected = if byte_length == 0 { 0 } else { (byte_length + 30) / 31 };
        assert(chunks == expected, 'INVALID_CHUNK_COUNT');
    }

    fn write_chunks(
        ref self: ContractState, article_id: felt252, section: u8, chunks: Span<felt252>,
    ) {
        let mut index: u32 = 0;
        for chunk in chunks {
            self.chunks.write((article_id, section, index), *chunk);
            index += 1;
        };
    }

    fn section_chunk_count(meta: ArticleMeta, section: u8) -> u32 {
        if section == TITLE_SECTION {
            meta.title_chunks
        } else if section == SUBTITLE_SECTION {
            meta.subtitle_chunks
        } else {
            meta.body_chunks
        }
    }
}
