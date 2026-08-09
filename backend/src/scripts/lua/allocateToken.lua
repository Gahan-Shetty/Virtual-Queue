--[[
  allocateToken.lua — Atomic capacity check + allocation (spec §13)
  
  Atomically:
    1. Checks the current online or walk-in counter for orgId:serviceId:date
    2. Compares against the configured capacity
    3. Increments the counter if capacity is available
    4. Returns: 0 = success (counter now N), -1 = at capacity, -2 = already reserved (idempotency)
  
  KEYS[1] = capacity counter key    e.g. "cap:{orgId}:{serviceId}:{date}:{source}"
  KEYS[2] = idempotency lock key    e.g. "idem:{orgId}:{idempotencyKey}"
  ARGV[1] = max capacity for this source (online or walkin)
  ARGV[2] = TTL for the capacity counter (seconds, e.g. 86400 for 1 day)
  ARGV[3] = idempotency TTL (seconds, e.g. 86400)
  
  Returns:
    {0, current_count}   → success, slot allocated
    {-1, current_count}  → at capacity, rejected
    {-2, 0}              → idempotency hit, already processed
--]]

local cap_key   = KEYS[1]
local idem_key  = KEYS[2]
local max_cap   = tonumber(ARGV[1])
local cap_ttl   = tonumber(ARGV[2])
local idem_ttl  = tonumber(ARGV[3])

-- Check idempotency: if this request was already processed, return immediately
local already = redis.call('EXISTS', idem_key)
if already == 1 then
  return {-2, 0}
end

-- Check current count
local current = tonumber(redis.call('GET', cap_key) or '0')

if current >= max_cap then
  return {-1, current}
end

-- Allocate: increment counter
local new_count = redis.call('INCR', cap_key)

-- Set TTL on first allocation (if counter is brand new)
if new_count == 1 then
  redis.call('EXPIRE', cap_key, cap_ttl)
end

-- Record idempotency lock
redis.call('SETEX', idem_key, idem_ttl, '1')

return {0, new_count}
