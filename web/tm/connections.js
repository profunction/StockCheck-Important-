/** Connections (连接) inside SuXin TMS: another system's deliveries (web/js/connections.js). */
import { render as connections } from '../js/connections.js';
import { head } from './common.js';

export const render = (main) => connections(main, { head });
