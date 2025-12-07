#!/usr/bin/env node
/**
 * Wikibase API Test Script
 * 
 * Tests each step of the Wikibase publishing workflow to verify:
 * 1. Login token retrieval
 * 2. Bot login
 * 3. CSRF token retrieval
 * 4. Entity creation
 * 
 * Run with: node scripts/test-wikibase-api.js
 */

const WIKIBASE_URL = 'https://vibe.bibframe.wiki';
const API_PATH = '/w/api.php';
const BOT_USERNAME = 'Jimfhahn@marva-quartz-vibe';
const BOT_PASSWORD = '1dq7ibnuii72h1vh95j8jag0qu3in2em';

// Store cookies between requests
let cookies = [];

function getApiUrl() {
  return `${WIKIBASE_URL}${API_PATH}`;
}

function getCookieHeader() {
  return cookies.join('; ');
}

function updateCookies(response) {
  // Node.js fetch uses getSetCookie() method
  let setCookies;
  if (typeof response.headers.getSetCookie === 'function') {
    setCookies = response.headers.getSetCookie();
  } else if (typeof response.headers.raw === 'function') {
    setCookies = response.headers.raw()['set-cookie'];
  } else {
    // Fallback: try to get from headers entries
    const allCookies = response.headers.get('set-cookie');
    setCookies = allCookies ? [allCookies] : [];
  }
  
  if (setCookies && setCookies.length > 0) {
    for (const cookie of setCookies) {
      const cookieName = cookie.split('=')[0];
      // Remove old cookie with same name
      cookies = cookies.filter(c => !c.startsWith(cookieName + '='));
      // Add new cookie (just the name=value part)
      cookies.push(cookie.split(';')[0]);
    }
    console.log('  📦 Cookies updated:', cookies.length, 'cookies stored');
  }
}

async function testStep(name, fn) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🧪 TEST: ${name}`);
  console.log('='.repeat(60));
  
  try {
    const result = await fn();
    console.log(`✅ PASSED: ${name}`);
    return result;
  } catch (error) {
    console.error(`❌ FAILED: ${name}`);
    console.error(`   Error: ${error.message}`);
    throw error;
  }
}

async function test1_GetLoginToken() {
  const apiUrl = getApiUrl();
  const params = new URLSearchParams({
    action: 'query',
    meta: 'tokens',
    type: 'login',
    format: 'json'
  });
  
  console.log(`  📡 GET ${apiUrl}?${params}`);
  
  const response = await fetch(`${apiUrl}?${params}`, {
    method: 'GET',
    headers: {
      'Cookie': getCookieHeader()
    }
  });
  
  updateCookies(response);
  
  console.log(`  📊 Status: ${response.status}`);
  
  const text = await response.text();
  console.log(`  📄 Response: ${text.substring(0, 200)}...`);
  
  const data = JSON.parse(text);
  const loginToken = data?.query?.tokens?.logintoken;
  
  if (!loginToken) {
    throw new Error('No login token in response');
  }
  
  console.log(`  🔑 Login Token: ${loginToken.substring(0, 20)}...`);
  return loginToken;
}

async function test2_Login(loginToken) {
  const apiUrl = getApiUrl();
  const params = new URLSearchParams({
    action: 'login',
    lgname: BOT_USERNAME,
    lgpassword: BOT_PASSWORD,
    lgtoken: loginToken,
    format: 'json'
  });
  
  console.log(`  📡 POST ${apiUrl}`);
  console.log(`  👤 Username: ${BOT_USERNAME}`);
  
  const response = await fetch(apiUrl, {
    method: 'POST',
    body: params,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': getCookieHeader()
    }
  });
  
  updateCookies(response);
  
  console.log(`  📊 Status: ${response.status}`);
  
  const text = await response.text();
  console.log(`  📄 Response: ${text}`);
  
  const data = JSON.parse(text);
  
  if (data.login?.result !== 'Success') {
    throw new Error(`Login failed: ${data.login?.reason || JSON.stringify(data)}`);
  }
  
  console.log(`  ✅ Logged in as: ${data.login.lgusername}`);
  return data.login;
}

async function test3_GetCsrfToken() {
  const apiUrl = getApiUrl();
  const params = new URLSearchParams({
    action: 'query',
    meta: 'tokens',
    type: 'csrf',
    format: 'json'
  });
  
  console.log(`  📡 GET ${apiUrl}?${params}`);
  
  const response = await fetch(`${apiUrl}?${params}`, {
    method: 'GET',
    headers: {
      'Cookie': getCookieHeader()
    }
  });
  
  updateCookies(response);
  
  console.log(`  📊 Status: ${response.status}`);
  
  const text = await response.text();
  console.log(`  📄 Response: ${text}`);
  
  const data = JSON.parse(text);
  const csrfToken = data?.query?.tokens?.csrftoken;
  
  if (!csrfToken || csrfToken === '+\\') {
    throw new Error('Invalid CSRF token - not logged in properly');
  }
  
  console.log(`  🔑 CSRF Token: ${csrfToken.substring(0, 20)}...`);
  return csrfToken;
}

async function test4_CreateTestItem(csrfToken) {
  const apiUrl = getApiUrl();
  
  // Create a simple test item
  const testData = {
    labels: {
      en: { language: 'en', value: `Test Item from Marva Quartz - ${new Date().toISOString()}` }
    },
    descriptions: {
      en: { language: 'en', value: 'Automated test item - can be deleted' }
    },
    claims: {}
  };
  
  const params = new URLSearchParams({
    action: 'wbeditentity',
    new: 'item',
    data: JSON.stringify(testData),
    summary: 'Test item creation from Marva Quartz',
    token: csrfToken,
    format: 'json'
  });
  
  console.log(`  📡 POST ${apiUrl}`);
  console.log(`  📝 Creating test item...`);
  
  const response = await fetch(apiUrl, {
    method: 'POST',
    body: params,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': getCookieHeader()
    }
  });
  
  console.log(`  📊 Status: ${response.status}`);
  
  const text = await response.text();
  console.log(`  📄 Response: ${text.substring(0, 500)}...`);
  
  const data = JSON.parse(text);
  
  if (data.error) {
    throw new Error(`API error: ${data.error.info || data.error.code}`);
  }
  
  const itemId = data.entity?.id;
  console.log(`  🎉 Created item: ${itemId}`);
  console.log(`  🔗 View at: ${WIKIBASE_URL}/wiki/${itemId}`);
  
  return itemId;
}

async function runAllTests() {
  console.log('\n🚀 Wikibase API Test Suite');
  console.log(`   Target: ${WIKIBASE_URL}`);
  console.log(`   User: ${BOT_USERNAME}`);
  console.log('');
  
  try {
    // Test 1: Get login token
    const loginToken = await testStep('Get Login Token', test1_GetLoginToken);
    
    // Test 2: Login with bot credentials
    await testStep('Bot Login', () => test2_Login(loginToken));
    
    // Test 3: Get CSRF token
    const csrfToken = await testStep('Get CSRF Token', test3_GetCsrfToken);
    
    // Test 4: Create a test item
    const itemId = await testStep('Create Test Item', () => test4_CreateTestItem(csrfToken));
    
    console.log('\n' + '='.repeat(60));
    console.log('🎉 ALL TESTS PASSED!');
    console.log('='.repeat(60));
    console.log(`\n✅ Successfully created test item: ${itemId}`);
    console.log(`   View at: ${WIKIBASE_URL}/wiki/${itemId}`);
    console.log('\nThe Wikibase API integration is working correctly.');
    console.log('You can now use this workflow in the browser.');
    
  } catch (error) {
    console.log('\n' + '='.repeat(60));
    console.log('❌ TESTS FAILED');
    console.log('='.repeat(60));
    console.error('\nError:', error.message);
    process.exit(1);
  }
}

// Run tests
runAllTests();
