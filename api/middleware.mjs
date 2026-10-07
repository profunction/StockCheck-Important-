/**
 * The order every API request goes through, one step each:
 *
 *   authenticate    an access token we know            401 UNAUTHENTICATED
 *   tenant          its company, with an active plan   403 TENANT_MISMATCH / PLAN_INACTIVE
 *   requireModule   the plan includes this part        403 MODULE_NOT_ENABLED
 *   requireScope    the token may do this              403 PERMISSION_DENIED
 *   the route       the work itself
 *
 * The database reads are passed in (loadToken, loadLicence), so every step
 * is tested without one (middleware.test.mjs). Errors keep the API's
 * shape, { error: { message } }, with a code added beside the message.
 */
import { ApiError, bearer, sha256 } from './lib.mjs';
import { ERRORS, MODULES, isEnabled, tokenAllows } from './modules.js';

// Sync or async, a step's error always goes to next() (and so to a 4xx), never past it.
const step = (fn) => (req, res, next) => Promise.resolve().then(() => fn(req, res)).then(() => next(), next);

/** A known token, stored as its SHA-256 only. Sets req.token, req.ws, req.tokenName, req.tokenKey. */
export function authenticate({ loadToken }) {
  return step(async (req) => {
    const token = bearer(req.get('authorization'));
    if (!token) throw new ApiError(401, 'Send an access token: Authorization: Bearer sck_...', ERRORS.UNAUTHENTICATED);
    const hash = sha256(token);
    const data = await loadToken(hash);
    if (!data) throw new ApiError(401, 'This access token is not valid, or was revoked.', ERRORS.UNAUTHENTICATED);
    req.token = data;
    req.tokenHash = hash;
    req.ws = data.workspaceId;
    req.tokenName = data.name || 'API';
    req.tokenKey = hash.slice(0, 10);
  });
}

/**
 * The token's company, and nothing else: every route reads under req.ws,
 * so a token can never reach another company's data. Sets req.licence.
 */
export function tenant({ loadLicence, now = () => Date.now() }) {
  return step(async (req) => {
    if (typeof req.ws !== 'string' || !req.ws || req.ws.includes('/')) {
      throw new ApiError(403, 'This access token does not belong to a company.', ERRORS.TENANT_MISMATCH);
    }
    const licence = await loadLicence(req.ws);
    const active = Boolean(licence) && (licence.status ?? 'ACTIVE') === 'ACTIVE' && (!licence.expiresAt || licence.expiresAt > now());
    if (!active) throw new ApiError(403, 'This company has no active plan. Renew it to use the API.', ERRORS.PLAN_INACTIVE);
    req.licence = licence;
  });
}

/** The company's plan includes module [id] (see modules.js). */
export function requireModule(id) {
  if (!MODULES[id]) throw new Error(`Unknown module: ${id}`);
  return step((req) => {
    if (!isEnabled(req.licence, id)) {
      throw new ApiError(403, id === 'api'
        ? 'Your plan does not include the API. It comes with Unlimited, or the API pack on its own.'
        : `Your plan does not include ${MODULES[id].name.en}.`, ERRORS.MODULE_NOT_ENABLED);
    }
  });
}

/** The token may do [scope] ('items.write'); a token with no scopes may do all. */
export function requireScope(scope) {
  if (!MODULES.api.scopes.includes(scope)) throw new Error(`Unknown scope: ${scope}`);
  return step((req) => {
    if (!tokenAllows(req.token, scope)) {
      throw new ApiError(403, `This access token may not ${scope.replace('.', ' ')}.`, ERRORS.PERMISSION_DENIED);
    }
  });
}
