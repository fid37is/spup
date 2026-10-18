# Direct video uploads: setup (about 10 minutes)

Code is safe to deploy first: until the two Vercel variables in step 3 exist, uploads keep
working the old way (through the server), so nothing breaks half-way.

## 1. Make a signing secret
Any long random string, e.g. run `openssl rand -hex 32`. You will paste the SAME value in
Bunny (step 2) and Vercel (step 3).

## 2. Create the script on Bunny
Dashboard -> Edge Platform -> Scripting -> Add script -> Standalone.
- Paste in the contents of `edge/upload-edge-script.js` and save/publish.
- Env Configuration -> Environment Secrets:
  - `UPLOAD_SIGNING_SECRET` = the secret from step 1
  - `BUNNY_STORAGE_ACCESS_KEY` = the storage zone password (use the NEW one if you rotated it)
- Env Configuration -> Environment Variables:
  - `BUNNY_STORAGE_ZONE` = `spup-storage`
  - (optional) `ALLOWED_ORIGINS` = `https://spup.live,https://www.spup.live`
- Note the script's address (https://something.b-cdn.net). A custom hostname such as
  `upload.spup.live` also works if you prefer.

## 3. Add two variables on Vercel, then redeploy
- `UPLOAD_SIGNING_SECRET` = the secret from step 1
- `UPLOAD_EDGE_URL` = the script's address, e.g. `https://spup-upload.b-cdn.net` (no trailing slash)

## 4. Test
On a phone, post a video bigger than 5MB (10-20MB is a good test).
In a desktop browser (DevTools -> Network) you should see `POST /api/upload/sign` (200) then
`PUT https://<your script>/?t=...` (200). Then the post appears with the video.

If something fails, the PUT's response says why:
- 401 "Upload link expired": secret differs between Vercel and Bunny.
- 403: the page's address is not in ALLOWED_ORIGINS.
- 502 "Upload failed": the script could not write to storage; check BUNNY_STORAGE_ACCESS_KEY / zone.
- 5xx with no message: the script ran out of memory or time; tell me the file size.

## Notes
- The script holds the whole file in memory while checking and writing it (max 25MB).
  This is the same as the old server route did, but I could not test it on Bunny from here.
- Avatars, banners, wallet proofs and offline-queued posts still use the old server route;
  they are small. Photos and videos in posts and replies now go direct.
