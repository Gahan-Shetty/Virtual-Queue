--[[
  checkIn.lua — Atomic reservation check + CHECKED_IN state flip (spec §8)
  
  Resolves the race condition between:
    - A patient checking in at T-1 second before expiry
    - The expiry worker sweeping at T+0

  In one atomic operation:
    1. Reads the token's reservationExpiresAt from Redis
    2. Compares with current time (NOW, passed as ARGV)
    3. If not expired: marks the token's Redis state as CHECKED_IN and clears expiry key
    4. If expired: returns -1 (the expiry worker or read-time check will handle the rest)

  KEYS[1] = token expiry key       e.g. "token:expiry:{tokenId}"
  KEYS[2] = token state key        e.g. "token:state:{tokenId}"
  ARGV[1] = now (unix timestamp ms as string)
  ARGV[2] = TTL to keep the state key alive (seconds, e.g. 86400)
  
  Returns:
     1  → success (checked in)
    -1  → expired (check-in rejected)
    -2  → token not found in Redis (fallback to DB check)
--]]

local expiry_key = KEYS[1]
local state_key  = KEYS[2]
local now_ms     = tonumber(ARGV[1])
local state_ttl  = tonumber(ARGV[2])

-- Read expiry timestamp
local expires_at_ms = tonumber(redis.call('GET', expiry_key))

if expires_at_ms == nil then
  -- Expiry key doesn't exist in Redis: either already expired+swept, or never set
  -- Return -2 to signal caller to do a DB-level check
  return -2
end

if now_ms > expires_at_ms then
  -- Expired: do NOT flip state here — let the expiry worker handle DB update consistently
  return -1
end

-- Valid: flip state to CHECKED_IN and remove expiry key
redis.call('SET', state_key, 'CHECKED_IN', 'EX', state_ttl)
redis.call('DEL', expiry_key)

return 1
