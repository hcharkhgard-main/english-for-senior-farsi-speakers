// Cloudflare Workers entry point.  Deploy:  npx wrangler deploy   (see docs/DEPLOYMENT.md)
// Secrets and settings:  AI_API_KEY (secret), ALLOWED_ORIGINS, optional AI_MODEL / AI_PROVIDER / AI_BASE_URL.
// personas.json is bundled with the Worker: after changing a conversation run "npm run personas" and deploy again.
import { createHandler } from './handler.mjs';
import data from './personas.json';

let handler = null;
export default {
  fetch(request, env) {
    handler ||= createHandler(env, { personas: data.personas });
    // cf-connecting-ip is set by Cloudflare itself and cannot be supplied by the visitor
    return handler(request, { ip: request.headers.get('cf-connecting-ip') || '' });
  },
};
