/**
 * Side-effect entry that registers every parser the import worker should
 * dispatch. Importing this module from the worker is enough — no exports.
 *
 * Add new parsers by importing them here and calling `registerParser`.
 */

import { registerParser } from '@fretwork/lib/import';
import { guitarProParser } from './parsers/guitar-pro-parser';

registerParser(guitarProParser);
