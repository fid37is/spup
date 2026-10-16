-- scripts/export-media-urls.sql
--
-- Step 1 of the Cloudinary -> Bunny catch-up. Lists every media link in the database that
-- still points at Cloudinary - which is exactly the media added since the last rewrite, plus
-- anything held back last time (missing files, video posters).
--
-- HOW TO RUN: this is SQL, not a command. Copy ALL of it into the Supabase dashboard ->
-- SQL Editor, press Run, then download the result as CSV and save it in the project
-- folder as  db-urls-catchup.csv  (bunny-verify.mjs reads it).
--
-- It only reads. Nothing in the database changes.
--
-- Columns must stay exactly: source, row_id, old_url
-- A video's own link is included whenever its poster is still on Cloudinary, even if the video
-- itself was already moved, because bunny-make-posters.mjs needs both to rebuild the poster.

select 'post_media.url' as source, id::text as row_id, url as old_url
from post_media
where url like '%res.cloudinary.com%' or thumbnail_url like '%res.cloudinary.com%'

union all
select 'post_media.thumbnail_url', id::text, thumbnail_url
from post_media
where thumbnail_url like '%res.cloudinary.com%'

union all
select 'users.avatar_url', id::text, avatar_url
from users
where avatar_url like '%res.cloudinary.com%'

union all
select 'users.banner_url', id::text, banner_url
from users
where banner_url like '%res.cloudinary.com%'

union all
select 'messages.media_url', id::text, media_url
from messages
where media_url like '%res.cloudinary.com%'

order by 1, 2;
