const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const privateJwk = await crypto.subtle.exportKey('jwk', pair.privateKey);

console.log('VAPID_PRIVATE_JWK');
console.log(JSON.stringify(privateJwk));
console.log('\nこの値をGitHub Actions Secret「VAPID_PRIVATE_JWK」に保存してください。');
