import { assertEquals } from 'jsr:@std/assert@1';
import { gradeQuizAnswer, isContinueReply, normalizePhone, statusesBelow, templatePlaceholderCount } from './whatsapp-logic.ts';

Deno.test('normalizePhone keeps country-coded digits only', () => {
  assertEquals(normalizePhone('+91 97660-72308'), '919766072308');
  assertEquals(normalizePhone('0091 9766072308'), '919766072308');
  assertEquals(normalizePhone('12345'), null);
  assertEquals(normalizePhone('1234567890123456'), null);
});

Deno.test('statusesBelow never lets a status move backwards', () => {
  assertEquals(statusesBelow('read'), ['accepted', 'sent', 'delivered']);
  assertEquals(statusesBelow('delivered')?.includes('read'), false);
  assertEquals(statusesBelow('accepted'), []);
  assertEquals(statusesBelow('deleted'), null);
});

Deno.test('gradeQuizAnswer accepts option numbers and text', () => {
  const options = ['Paris', 'Rome'];
  assertEquals(gradeQuizAnswer('1', options, 'Paris'), true);
  assertEquals(gradeQuizAnswer(' paris ', options, 'Paris'), true);
  assertEquals(gradeQuizAnswer('2', options, 'Paris'), false);
  assertEquals(gradeQuizAnswer('9', options, 'Paris'), false);
});

Deno.test('isContinueReply matches only explicit continue words', () => {
  assertEquals(isContinueReply(' Next '), true);
  assertEquals(isContinueReply('next please'), false);
});

Deno.test('templatePlaceholderCount requires contiguous placeholders', () => {
  assertEquals(templatePlaceholderCount('Hi {{1}}, welcome to {{2}}!'), 2);
  assertEquals(templatePlaceholderCount('Hi {{1}} and {{1}}'), 1);
  assertEquals(templatePlaceholderCount('Hi {{1}}, see {{3}}'), null);
  assertEquals(templatePlaceholderCount('No placeholders'), 0);
});
