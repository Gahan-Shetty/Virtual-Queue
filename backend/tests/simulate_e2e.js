const http = require('http');

const API_URL = 'http://localhost:5000/api';

const delay = ms => new Promise(res => setTimeout(res, ms));
const assert = (condition, message) => { if (!condition) throw new Error(`Assertion failed: ${message}`); };

// Helper to generate UUID
const generateUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

const req = async (path, method = 'GET', body = null, token = null, headers = {}) => {
  const options = {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
  };
  if (token) options.headers['Authorization'] = `Bearer ${token}`;
  if (body) options.body = JSON.stringify(body);

  const res = await fetch(`${API_URL}${path}`, options);
  const data = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, data };
};

const run = async () => {
  console.log('--- STARTING VIRTUAL QUEUE E2E SIMULATION ---');
  let state = {};

  try {
    // 1. Create a unique identifier for this test run
    const testId = Date.now();
    const orgSlug = `test-org-${testId}`;
    console.log(`\n1. Registering Admin for ${orgSlug}...`);
    
    console.log('0. Connecting to DB and Seeding Organization...');
    const mongoose = require('mongoose');
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/virtual_queue');
    const { User } = require('../src/models/User');
    const { Organization } = require('../src/models/Organization');
    const { Token } = require('../src/models/Token');
    const { Service } = require('../src/models/Service');
    const { Counter } = require('../src/models/Counter');
    
    console.log('0.0 Flushing Redis rate limiters...');
    const Redis = require('ioredis');
    const redis = new Redis({ host: process.env.REDIS_HOST || '127.0.0.1', port: process.env.REDIS_PORT || 6379 });
    await redis.flushall();
    redis.disconnect();

    console.log('0.1 Clearing old test data...');
    await Token.deleteMany({});
    await Service.deleteMany({});
    await Counter.deleteMany({});
    await User.deleteMany({ email: /@test\.com/ });
    
    // ensure org exists
    let org = await Organization.findOne({ slug: 'city-hospital' });
    if (!org) {
       console.log('   -> Org not found. Creating city-hospital...');
       org = await Organization.create({
          name: "City Hospital",
          slug: "city-hospital",
          isActive: true,
          bookingOpenTime: "00:00",
          bookingCloseTime: "23:59",
          serviceStartTime: "00:00",
          serviceEndTime: "23:59",
          onlineCapacity: 60,
          walkInCapacity: 40,
          reservationExpiryMinutes: 30,
          checkInGracePeriodMinutes: 10,
          noShowGracePeriodMinutes: 5,
          maxNoShowRejoinsPerDay: 1
       });
    }

    const adminEmail = `admin-${testId}@test.com`;
    console.log(`\n1. Registering Admin for city-hospital...`);
    
    const resRegAdmin = await req('/auth/register', 'POST', {
      orgSlug: 'city-hospital',
      name: 'Test Admin',
      email: adminEmail,
      phone: `999${testId}`.substring(0,10),
      password: 'Password123!'
    });
    
    if (!resRegAdmin.ok) {
      throw new Error(`Registration failed: ${resRegAdmin.data?.message}`);
    }
    
    console.log('2. Promoting user to ADMIN via direct DB connection...');
    await User.updateOne({ email: adminEmail }, { $set: { role: 'ADMIN', isVerified: true, orgId: org._id } });
    
    // Now login as Admin
    console.log('3. Logging in as ADMIN...');
    const resLoginAdmin = await req('/auth/login', 'POST', {
      orgSlug: 'city-hospital',
      email: adminEmail,
      password: 'Password123!'
    });
    assert(resLoginAdmin.ok, 'Admin login failed');
    const adminToken = resLoginAdmin.data.data.accessToken;

    // 4. Create Service
    console.log('4. Creating Service...');
    const resSvc = await req('/admin/services', 'POST', {
      name: `Test Service ${testId}`,
      tokenPrefix: 'TST',
      avgServiceTimeMinutes: 5,
      dailyCapacity: 50
    }, adminToken);
    assert(resSvc.ok, 'Service creation failed');
    const serviceId = resSvc.data.data._id;

    // 5. Create Counter
    console.log('5. Creating Counter...');
    const resCnt = await req('/admin/counters', 'POST', {
      name: `Counter ${testId}`,
      serviceId
    }, adminToken);
    assert(resCnt.ok, 'Counter creation failed');
    const counterId = resCnt.data.data._id;

    // 6. Create Staff (Receptionist)
    console.log('6. Creating Staff (Receptionist)...');
    const staffEmail = `staff-${testId}@test.com`;
    const resStaff = await req('/admin/staff', 'POST', {
      name: 'Test Receptionist',
      email: staffEmail,
      phone: `888${testId}`.substring(0,10),
      password: 'Password123!',
      role: 'RECEPTIONIST'
    }, adminToken);
    assert(resStaff.ok, 'Staff creation failed');
    
    // Login Staff
    console.log('7. Logging in as Staff...');
    const resLoginStaff = await req('/auth/login', 'POST', {
      orgSlug: 'city-hospital',
      email: staffEmail,
      password: 'Password123!'
    });
    assert(resLoginStaff.ok, 'Staff login failed');
    const staffToken = resLoginStaff.data.data.accessToken;

    // 8. Patient Flow
    console.log('8. Patient registering and requesting token...');
    const patEmail = `pat-${testId}@test.com`;
    const patPhone = `777${testId}`.substring(0,10);
    const resPatReg = await req('/auth/register', 'POST', {
      orgSlug: 'city-hospital',
      name: 'Test Patient',
      email: patEmail,
      phone: patPhone,
      password: 'Password123!'
    });
    assert(resPatReg.ok, 'Patient reg failed');
    await User.updateOne({ email: patEmail }, { $set: { isVerified: true } }); // bypass OTP
    
    const resLoginPat = await req('/auth/login', 'POST', {
      orgSlug: 'city-hospital',
      email: patEmail,
      password: 'Password123!'
    });
    if (!resLoginPat.ok) console.log('Patient Login Error:', resLoginPat.data);
    assert(resLoginPat.ok, 'Patient login failed');
    const patToken = resLoginPat.data.data.accessToken;

    const idemKey = generateUUID();
    const resToken = await req('/tokens', 'POST', {
      serviceId,
      source: 'ONLINE',
      idempotencyKey: idemKey
    }, patToken, { 'Idempotency-Key': idemKey });
    if (!resToken.ok) console.log('Token Request Error:', resToken.data);
    assert(resToken.ok, 'Token request failed');
    const tokenId = resToken.data.data._id;
    const tokenNumber = resToken.data.data.tokenNumber;
    console.log(`   -> Reserved Token: ${tokenNumber}`);

    // 9. Staff checks in patient manually
    console.log('9. Staff checks in patient manually...');
    const resCheckin = await req('/checkin/manual', 'POST', {
      serviceId,
      tokenNumber
    }, staffToken);
    assert(resCheckin.ok, 'Check-in failed');
    if (resCheckin.data.data.status !== 'CHECKED_IN' && resCheckin.data.data.status !== 'WAITING') {
      console.log('Check-in status:', resCheckin.data.data.status);
    }
    assert(['CHECKED_IN', 'WAITING'].includes(resCheckin.data.data.status), 'Token not checked in properly');

    // 10. Staff Calls Patient
    console.log('10. Staff calls next patient...');
    const resCall = await req('/queue/call-next', 'POST', {
      serviceId,
      counterId
    }, staffToken);
    if (resCall.data?.data?.token?.tokenNumber !== tokenNumber) {
      console.log('Call Next result:', resCall.data);
    }
    assert(resCall.ok, 'Call next failed');
    assert(resCall.data.data.token.tokenNumber === tokenNumber, 'Called wrong token');

    // 11. Staff serves and completes
    console.log('11. Staff serves and completes...');
    await req(`/queue/${tokenId}/serving`, 'PATCH', {}, staffToken);
    await req(`/queue/${tokenId}/complete`, 'PATCH', {}, staffToken);

    // 12. Walk-in Return Patient lookup (The new feature!)
    console.log('12. Staff looks up existing patient by phone...');
    const resLookup = await req(`/admin/users/lookup?q=${patPhone}`, 'GET', null, staffToken);
    if (!resLookup.ok) console.log('Lookup Error:', resLookup.data);
    assert(resLookup.ok, 'Lookup failed');
    assert(resLookup.data.data.email === patEmail, 'Lookup returned wrong user');
    console.log('    -> Walk-in lookup SUCCESS!');

    // 13. Admin Dashboard Stats
    console.log('13. Admin checks dashboard stats...');
    const resStats = await req('/admin/dashboard', 'GET', null, adminToken);
    assert(resStats.ok, 'Stats failed');
    console.log(`    -> Total: ${resStats.data.data.total}, Completed: ${resStats.data.data.completed}`);

    console.log('\n✅ ALL TESTS PASSED SUCCESSFULLY! The system is solid as a rock.');
    
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('\n❌ E2E TEST FAILED:');
    console.error(err);
    process.exit(1);
  }
};

run();
