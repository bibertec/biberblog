/**
 * `GET /api/editor/deployment` (route file: `app/api/editor/deployment/route.ts`, which must declare
 * `dynamic = 'force-static'` itself). Returns the commit SHA of the deployment serving this
 * response. After a publish, the editor polls this route until it returns the SHA of the new
 * commit – the new deployment is live at that point.
 *
 * Static: the response is generated once at build time and served by the CDN per deployment.
 * Polling therefore costs no function invocations; once the new deployment is promoted, the CDN
 * serves its response automatically.
 */
export function GET(): Response {
  return Response.json({ commitSha: process.env.VERCEL_GIT_COMMIT_SHA || null });
}
