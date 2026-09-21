/** A compare-and-swap commit: policy stays in TypeScript; publication is atomic. */
export const COMMIT_SYNC_BATCH = `-- ryos:sync-commit-v1
local expected = tonumber(ARGV[1])
local nextSeq = tonumber(ARGV[2])
local kv = cjson.decode(ARGV[3])
local journal = cjson.decode(ARGV[4])
local blobs = cjson.decode(ARGV[5])
local limit = tonumber(ARGV[6])
local types = {'string', 'hash', 'zset', 'hash'}
for i = 1, 4 do
  local actual = redis.call('TYPE', KEYS[i]).ok
  if actual ~= 'none' and actual ~= types[i] then
    return redis.error_reply('Invalid sync storage type')
  end
end
if tonumber(redis.call('GET', KEYS[1]) or '0') ~= expected then return 0 end
for digest, value in pairs(blobs) do
  local current = redis.call('HGET', KEYS[4], digest)
  if current and cjson.decode(current).deleting then
    return redis.error_reply('Sync content is being collected; retry later')
  end
end
for key, value in pairs(kv) do redis.call('HSET', KEYS[2], key, value) end
for _, op in ipairs(journal) do redis.call('ZADD', KEYS[3], op.seq, op.member) end
for digest, value in pairs(blobs) do redis.call('HSET', KEYS[4], digest, value) end
redis.call('SET', KEYS[1], tostring(nextSeq))
redis.call('ZREMRANGEBYSCORE', KEYS[3], '-inf', nextSeq - limit)
for i = 1, 4 do redis.call('PERSIST', KEYS[i]) end
return 1
`;

/** Claim only against the same catalog AND registry row observed by the sweep. */
export const CLAIM_SYNC_BLOB = `-- ryos:sync-gc-claim-v1
if tonumber(redis.call('GET', KEYS[1]) or '0') ~= tonumber(ARGV[1]) then return 0 end
local raw = redis.call('HGET', KEYS[2], ARGV[2])
if not raw then return 0 end
local row = cjson.decode(raw)
local expected = cjson.decode(ARGV[3])
for _, field in ipairs({'url', 'gc', 'leaseUntil', 'deleting'}) do
  if row[field] ~= expected[field] then return 0 end
end
if row.leaseUntil and row.leaseUntil > tonumber(ARGV[4]) then return 0 end
row.deleting = true
redis.call('HSET', KEYS[2], ARGV[2], cjson.encode(row))
return 1
`;

/** Preparing existing content also reserves it until the client can commit it. */
export const LEASE_SYNC_BLOBS = `-- ryos:sync-blob-lease-v1
local digests = cjson.decode(ARGV[1])
local result = {}
for _, digest in ipairs(digests) do
  local raw = redis.call('HGET', KEYS[1], digest)
  if raw and cjson.decode(raw).deleting then
    return redis.error_reply('Sync content is being collected; retry later')
  end
end
for _, digest in ipairs(digests) do
  local raw = redis.call('HGET', KEYS[1], digest)
  if raw then
    local row = cjson.decode(raw)
    row.leaseUntil = tonumber(ARGV[2])
    redis.call('HSET', KEYS[1], digest, cjson.encode(row))
    table.insert(result, cjson.encode(row))
  else
    table.insert(result, false)
  end
end
return result
`;

/** Mark changes must not overwrite a concurrent upload reservation or commit. */
export const MARK_SYNC_BLOB = `-- ryos:sync-gc-mark-v1
if tonumber(redis.call('GET', KEYS[1]) or '0') ~= tonumber(ARGV[1]) then return 0 end
local raw = redis.call('HGET', KEYS[2], ARGV[2])
if not raw then return 0 end
local row = cjson.decode(raw)
local expected = cjson.decode(ARGV[3])
for _, field in ipairs({'url', 'gc', 'leaseUntil', 'deleting'}) do
  if row[field] ~= expected[field] then return 0 end
end
if row.deleting then return 0 end
if tonumber(ARGV[4]) == 0 then row.gc = nil else row.gc = tonumber(ARGV[4]) end
redis.call('HSET', KEYS[2], ARGV[2], cjson.encode(row))
return 1
`;
