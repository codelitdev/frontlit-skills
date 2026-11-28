# Recipes by stack

Each recipe is a starting point. Adapt it to the app: use its own auth helper, HTTP client, validation library, route conventions and button component. The shape stays the same everywhere:

- Authenticate; 401 when signed out.
- Build `contact` and `account` from the **session**, never from the request body.
- Take only `page`, `error`, `requestId` and `message` from the body, as short strings.
- `POST https://api.frontlit.app/support-sessions` with the `x-frontlit-apikey` header.
- Return `{ token }`; on failure, log the status and return 502.

The request body sent to FrontLit:

```json
{
  "contact": { "email": "maya@acme.example", "name": "Maya Chen", "externalId": "usr_123" },
  "account": { "id": "org_42", "name": "Acme Academy", "url": "https://admin.example.com/orgs/42" },
  "context": { "page": "/settings", "error": "Failed to save settings: 500", "requestId": "req_8d8b16" },
  "message": "I couldn't save my settings."
}
```

Only `contact.email` is required. Leave out `account` when the app has no such concept, and leave out `context.error` for a plain Help click.

## Shared browser code

Framework-neutral; port it to the app's component style.

```html
<!-- Once, in the root layout or HTML shell -->
<script>
  window.FrontLit = window.FrontLit || { q: [], push(...a) { this.q.push(a); } };
  FrontLit.push("init", { teamId: "team_...", launcher: false });
</script>
<script async src="https://embed.frontlit.app/chat.js"></script>
```

```js
// Call from Help (no error) or from an error's Contact support button.
async function contactSupport({ error, requestId, message } = {}) {
  const response = await fetch("/api/support-session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ page: location.pathname, error, requestId, message }),
  });
  if (!response.ok) throw new Error("Couldn't start a support session");
  const { token } = await response.json();
  FrontLit.open({ token });
}

// On logout:
FrontLit.close();
```

`FrontLit.open` and `FrontLit.close` exist once the loader has run; calls made earlier through `FrontLit.push` are queued. Show a toast or inline message if `contactSupport` fails; don't fail silently.

## Next.js (App Router)

`app/api/support-session/route.ts`:

```ts
import { NextResponse } from "next/server";
import { auth } from "@/auth"; // the app's own session helper

const text = (value: unknown, max: number) =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, max) : undefined;

export async function POST(request: Request) {
  const session = await auth();
  const user = session?.user;
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const response = await fetch("https://api.frontlit.app/support-sessions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-frontlit-apikey": process.env.FRONTLIT_SUPPORT_KEY!,
    },
    body: JSON.stringify({
      contact: { email: user.email, name: user.name ?? undefined, externalId: user.id },
      // account: { id, name, url } from the user's organization, if the app has one
      context: {
        page: text(body.page, 300),
        error: text(body.error, 1000),
        requestId: text(body.requestId, 200),
      },
      message: text(body.message, 1000),
    }),
  });
  if (!response.ok) {
    console.error("FrontLit support session failed", response.status);
    return NextResponse.json({ error: "Support is unavailable" }, { status: 502 });
  }
  const { token } = await response.json();
  return NextResponse.json({ token });
}
```

Snippet: in `app/layout.tsx`, render the init code as a plain inline `<script dangerouslySetInnerHTML={{ __html: "…" }} />` in `<head>`, so `window.FrontLit` exists before anything else runs, then add `<Script src="https://embed.frontlit.app/chat.js" strategy="afterInteractive" />` from `next/script`. The button is a client component (`"use client"`) that calls `contactSupport`. With the Pages Router, the route is `pages/api/support-session.ts` and the session comes from `getServerSession(req, res, authOptions)`.

## Express / Node

```js
app.post("/api/support-session", requireLogin, async (req, res) => {
  const user = req.user; // from the app's session middleware
  const text = (value, max) =>
    typeof value === "string" && value.trim() ? value.trim().slice(0, max) : undefined;
  const response = await fetch("https://api.frontlit.app/support-sessions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-frontlit-apikey": process.env.FRONTLIT_SUPPORT_KEY,
    },
    body: JSON.stringify({
      contact: { email: user.email, name: user.name, externalId: String(user.id) },
      context: {
        page: text(req.body.page, 300),
        error: text(req.body.error, 1000),
        requestId: text(req.body.requestId, 200),
      },
      message: text(req.body.message, 1000),
    }),
  });
  if (!response.ok) return res.status(502).json({ error: "Support is unavailable" });
  const { token } = await response.json();
  res.json({ token });
});
```

`requireLogin` stands for whatever middleware the app uses to reject signed-out requests with 401. Needs Node 18+ for `fetch`, and `express.json()` for `req.body`.

## Rails

```ruby
# config/routes.rb
post "/api/support-session", to: "support_sessions#create"

# app/controllers/support_sessions_controller.rb
class SupportSessionsController < ApplicationController
  before_action :authenticate_user! # the app's own auth

  def create
    text = ->(key, max) { params[key].is_a?(String) ? params[key].strip.first(max).presence : nil }
    response = Net::HTTP.post(
      URI("https://api.frontlit.app/support-sessions"),
      {
        contact: { email: current_user.email, name: current_user.name, externalId: current_user.id.to_s },
        context: { page: text.(:page, 300), error: text.(:error, 1000), requestId: text.(:requestId, 200) }.compact,
        message: text.(:message, 1000)
      }.compact.to_json,
      "content-type" => "application/json",
      "x-frontlit-apikey" => ENV.fetch("FRONTLIT_SUPPORT_KEY")
    )
    return render(json: { error: "Support is unavailable" }, status: :bad_gateway) unless response.is_a?(Net::HTTPSuccess)
    render json: { token: JSON.parse(response.body)["token"] }
  end
end
```

The browser request needs the Rails CSRF token (`X-CSRF-Token` from `csrf_meta_tags`); reuse the app's existing fetch helper if it adds it.

## Django

```python
# views.py
import json, os, urllib.request
from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.views.decorators.http import require_POST

def _text(body, key, limit):
    value = body.get(key)
    return value.strip()[:limit] or None if isinstance(value, str) else None

@login_required
@require_POST
def support_session(request):
    body = json.loads(request.body or "{}")
    user = request.user
    payload = {
        "contact": {"email": user.email, "name": user.get_full_name() or None, "externalId": str(user.pk)},
        "context": {k: v for k, v in {
            "page": _text(body, "page", 300),
            "error": _text(body, "error", 1000),
            "requestId": _text(body, "requestId", 200),
        }.items() if v},
    }
    message = _text(body, "message", 1000)
    if message:
        payload["message"] = message
    req = urllib.request.Request(
        "https://api.frontlit.app/support-sessions",
        data=json.dumps(payload).encode(),
        headers={"content-type": "application/json", "x-frontlit-apikey": os.environ["FRONTLIT_SUPPORT_KEY"]},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            return JsonResponse({"token": json.load(response)["token"]})
    except Exception:
        return JsonResponse({"error": "Support is unavailable"}, status=502)
```

`login_required` redirects instead of returning 401; for an API-style app, check `request.user.is_authenticated` and return 401 yourself. Send the CSRF token from the browser as the app already does.

## Laravel

```php
// routes/web.php (inside the authenticated group)
Route::post('/api/support-session', function (Illuminate\Http\Request $request) {
    $user = $request->user();
    $text = fn ($key, $max) => is_string($request->input($key)) && trim($request->input($key)) !== ''
        ? mb_substr(trim($request->input($key)), 0, $max) : null;

    $response = Http::withHeaders(['x-frontlit-apikey' => env('FRONTLIT_SUPPORT_KEY')])
        ->post('https://api.frontlit.app/support-sessions', array_filter([
            'contact' => ['email' => $user->email, 'name' => $user->name, 'externalId' => (string) $user->id],
            'context' => array_filter([
                'page' => $text('page', 300),
                'error' => $text('error', 1000),
                'requestId' => $text('requestId', 200),
            ]),
            'message' => $text('message', 1000),
        ]));

    abort_unless($response->successful(), 502, 'Support is unavailable');
    return ['token' => $response->json('token')];
})->middleware('auth');
```

Read the key through `config()` rather than `env()` if the app caches its config.

## Error handling hooks

Where to put **Contact support**, by what the app already has:

- **React error boundary / Next.js `error.tsx`:** add the button to the fallback UI; pass `error.message` (not the stack) and `error.digest` as `requestId` when present.
- **Toast or alert helper:** add an optional "Contact support" action to error toasts, filled from the toast's message.
- **API client wrapper:** when a request fails, keep the response's request ID header (`x-request-id`, `traceparent`) so the error UI can pass it.
- **Server-rendered error pages (500, 404):** a Contact support link that calls the route with the error text the page shows.
