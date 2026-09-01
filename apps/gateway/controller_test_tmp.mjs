import { verifyMediaUrl } from './src/media/media.signing.ts';
console.log('before call');
try {
  const r = verifyMediaUrl(['http://a','http://b'], 'sig', 'secret');
  console.log('result', r);
} catch (e) {
  console.log('THREW:', e.constructor.name, e.message);
}
console.log('after call');
