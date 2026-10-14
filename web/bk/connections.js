/** Connections (连接) inside JSOX Books: other systems' sales coming in (web/js/connections.js). */
import { render as connections } from '../js/connections.js';
import { head } from './common.js';

export const render = (main) => connections(main, { head });
