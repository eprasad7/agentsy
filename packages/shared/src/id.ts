import { customAlphabet } from 'nanoid';

const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const generate = customAlphabet(alphabet, 21);

export type IdPrefix =
  | 'org'
  | 'mem'
  | 'key'
  | 'ag'
  | 'ver'
  | 'env'
  | 'dep'
  | 'run'
  | 'stp'
  | 'ses'
  | 'msg'
  | 'eds'
  | 'edc'
  | 'exp'
  | 'exr'
  | 'ebl'
  | 'kb'
  | 'kc'
  | 'sec'
  | 'usg'
  | 'whk'
  | 'con'
  | 'conn'
  | 'alr'
  | 'ntf';

export function newId(prefix: IdPrefix): string {
  return `${prefix}_${generate()}`;
}
