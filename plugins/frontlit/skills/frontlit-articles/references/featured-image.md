# Featured image

The featured image is the post's Open Graph and X large-card image. Without one, social cards fall back to the site logo.

- **Size:** 1200×630 px, PNG or JPG. Keep text large and inside the middle; cards are cropped and shown small.
- **Alt text:** describe what the image shows, not "featured image".
- Reuse an image from `list_media` when one fits instead of uploading a duplicate.

## Upload flow

The upload goes straight to MediaLit (FrontLit's media service) using the TUS 1.0.0 resumable protocol, then `register_media` adds it to the team's library.

1. Call `get_media_upload_signature({ teamId })`. It returns `{ signature, endpoint }`. The signature is short-lived; get a fresh one for each upload.
2. **Create the upload:** `POST {endpoint}/media/create/resumable` with these headers (each `Upload-Metadata` value is base64):
   - `Tus-Resumable: 1.0.0`
   - `Upload-Length: <file size in bytes>`
   - `x-medialit-signature: <signature>`
   - `Upload-Metadata: filename <b64 name>,filetype <b64 mime>,fileName <b64 name>,mimeType <b64 mime>,access <b64 "public">`

   The response's `Location` header is the upload URL.
3. **Send the file:** `PATCH <Location>` with `Tus-Resumable: 1.0.0`, `Upload-Offset: 0`, `Content-Type: application/offset+octet-stream`, the same `x-medialit-signature` header, and the file as the body. The response has a `media` header containing JSON; its `mediaId` is the **MediaLit** id. Its `file` and `thumbnail` URLs are temporary signed links; don't use them.
4. Call `register_media({ teamId, mediaLitId: <that mediaId>, alt })`. It returns `{ mediaId: "med_…", url, thumbnailUrl, … }`: the permanent URLs. Images are stored as WebP at their original size (a 1200×630 PNG becomes a 1200×630 `main.webp`), which Open Graph and X cards accept.
5. Call `update_article({ teamId, documentId, featuredImage: { url, thumbnail: thumbnailUrl, alt } })`.

   Send only `url`, `thumbnail` and `alt`. Passing `mediaId` is currently copied into `mediaLitId` incorrectly by the server; leave it out until that's fixed.

## Example

```bash
FILE=cover.png; MIME=image/png
SIG='<signature>'; ENDPOINT='<endpoint>'          # from get_media_upload_signature
b64() { printf %s "$1" | base64 | tr -d '\n'; }
META="filename $(b64 "$FILE"),filetype $(b64 $MIME),fileName $(b64 "$FILE"),mimeType $(b64 $MIME),access $(b64 public)"

LOCATION=$(curl -sS -D - -o /dev/null -X POST "$ENDPOINT/media/create/resumable" \
  -H "Tus-Resumable: 1.0.0" -H "Upload-Length: $(wc -c < "$FILE" | tr -d ' ')" \
  -H "x-medialit-signature: $SIG" -H "Upload-Metadata: $META" \
  | awk 'tolower($1)=="location:" {print $2}' | tr -d '\r')

curl -sS -D - -o /dev/null -X PATCH "$LOCATION" \
  -H "Tus-Resumable: 1.0.0" -H "Upload-Offset: 0" \
  -H "Content-Type: application/offset+octet-stream" \
  -H "x-medialit-signature: $SIG" --data-binary @"$FILE" \
  | awk 'tolower($1)=="media:" {sub(/^[^:]*: /, ""); print}'   # → {"mediaId":"…",…}
```

If `Location` is a relative path, prefix it with the endpoint's origin. A `401`/`403` usually means the signature expired; get a new one and start again from step 2.
