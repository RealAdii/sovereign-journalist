process.env.SESSION_SECRET = "test-session-secret-0123456789abcdef0123456789";
process.env.RATE_LIMIT_SECRET = "test-rate-limit-secret-0123456789abcdef01234";
delete process.env.SESSION_STORE_PATH;
process.env.NEXT_PUBLIC_STARKNET_CHAIN_ID = "SN_SEPOLIA";
process.env.NEXT_PUBLIC_STARKNET_NETWORK = "sepolia";
process.env.RECLAIM_APP_ID = "0xapp";
process.env.RECLAIM_APP_SECRET = "0xsecret";
process.env.RECLAIM_PROVIDER_ID = "provider-123";
