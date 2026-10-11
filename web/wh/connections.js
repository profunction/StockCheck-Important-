/** Connections (连接) inside SuXin WMS: another system's stock, sales or deliveries (web/js/connections.js). */
import { render as connections } from '../js/connections.js';
import { head } from './common.js';

export const render = (main) => connections(main, { head });
