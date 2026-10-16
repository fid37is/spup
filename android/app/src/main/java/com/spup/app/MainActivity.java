package com.spup.app;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.provider.MediaStore;
import android.util.Log;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.MimeTypeMap;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Locale;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;
import com.getcapacitor.BridgeWebViewClient;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginHandle;

import ee.forgr.capacitor.social.login.GoogleProvider;
import ee.forgr.capacitor.social.login.ModifiedMainActivityForSocialLoginPlugin;
import ee.forgr.capacitor.social.login.SocialLoginPlugin;

// ModifiedMainActivityForSocialLoginPlugin is required by @capgo/capacitor-social-login.
public class MainActivity extends BridgeActivity implements ModifiedMainActivityForSocialLoginPlugin {

    // The offline page is android/app/src/main/assets/offline.html (NOT assets/public/ -
    // `npx cap sync` wipes and refills that folder). It is read here and handed to the
    // WebView directly, so no file:// access or Capacitor setting is involved.
    private static final String OFFLINE_ASSET = "offline.html";
    // Origin the offline page runs under (only used as its base URL).
    private static final String OFFLINE_BASE = "https://localhost/offline.html";
    // Shown only if offline.html is missing from assets, so the person never sees
    // Android's own error page.
    private static final String FALLBACK_HTML =
        "<!doctype html><meta name='viewport' content='width=device-width,initial-scale=1'>"
        + "<body style='margin:0;background:#0A0A0A;color:#fff;font-family:sans-serif;display:flex;"
        + "min-height:100vh;align-items:center;justify-content:center;text-align:center'>"
        + "<div><h2>No connection</h2><p style='color:#aaa'>Check your internet and try again.</p>"
        + "<button onclick=\"location.replace('https://spup.live/')\" style='background:#1A9E5F;color:#fff;"
        + "border:0;border-radius:99px;padding:14px 32px;font-size:16px'>Try again</button></div>";
    private static final String SITE_URL = "https://spup.live/";
    // The same site without the trailing slash, for joining with a path that starts
    // with "/" (SITE_URL + "/post/1" would give "https://spup.live//post/1").
    private static final String SITE_ORIGIN = "https://spup.live";

    private BridgeWebViewClient offlineClient;
    // URL of a main-frame load that failed and whose replacement (the offline page)
    // hasn't finished loading yet; used by the onPageFinished backstop below.
    private String pendingFailedUrl = null;
    private int pendingTries = 0;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Android's WebView paints a built-in grey "play button" bitmap over any
        // <video> that has no poster or hasn't loaded a frame yet, stretched to
        // the video's size. Return a 1x1 transparent bitmap instead, so the
        // page's own background / poster shows through. Everything else about
        // Capacitor's WebChromeClient (file picker, permissions) is unchanged.
        getBridge().getWebView().setWebChromeClient(new BridgeWebChromeClient(getBridge()) {
            @Override
            public Bitmap getDefaultVideoPoster() {
                return Bitmap.createBitmap(1, 1, Bitmap.Config.ARGB_8888);
            }
        });

        // If the live site can't be reached (no internet, dropped connection, DNS
        // failure) show the app's own offline page instead of Android's "Webpage not
        // available". Two independent triggers:
        //   1. At launch with no network at all: show it straight away, without
        //      waiting for the failed load to report back.
        //   2. Any main-frame load that fails (offline mid-session, tapping a link,
        //      weak connection that times out, DNS failure).
        // The page that failed is passed along as ?u=, so once the connection is back
        // the person lands where they were heading. Only main-frame failures count
        // (a broken image or script doesn't replace the screen), and the offline page
        // itself is never redirected.
        final Bridge bridge = getBridge();
        offlineClient = new BridgeWebViewClient(bridge) {
            @Override
            public void onReceivedError(final WebView view, WebResourceRequest request, WebResourceError error) {
                super.onReceivedError(view, request, error);
                if (request == null || !request.isForMainFrame()) return;

                final String failedUrl = request.getUrl().toString();
                if (failedUrl.startsWith("file:///android_asset/") || failedUrl.startsWith(OFFLINE_BASE)) return;

                pendingFailedUrl = failedUrl;
                pendingTries = 0;
                showOfflinePage(view, failedUrl);
            }

            // Backstop: if Android's own error page finished loading after a failure
            // (i.e. our replacement lost the race), put the offline page on top of it.
            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                if (url != null && (url.startsWith(OFFLINE_BASE) || url.startsWith("data:"))) {
                    pendingFailedUrl = null;      // the offline page is up
                    return;
                }
                if (pendingFailedUrl != null && pendingTries < 3) {
                    pendingTries++;
                    showOfflinePage(view, pendingFailedUrl);
                }
            }
        };
        bridge.getWebView().setWebViewClient(offlineClient);

        // Lets the web app ask for the offline page directly (used by pull-to-refresh
        // when the phone is offline, instead of reloading into an error page).
        bridge.getWebView().addJavascriptInterface(new OfflineBridge(), "SpupNative");

        final boolean online = hasInternetTransport();
        if (!online) {
            showOfflinePage(bridge.getWebView(), SITE_URL);
        }

        // App was closed and a notification tap started it.
        openFromNotification(getIntent());
    }

    // App was already running (in the background) and a notification tap brought it forward.
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        openFromNotification(intent);
    }

    // A tapped notification opens com.spup.app://open?path=/post/123 (built in
    // SpupMessagingService). Load that page straight into the WebView, so the tap
    // lands on the right post / chat / notifications page even if the website's
    // own link listener hasn't started yet. The website also handles the link and
    // skips it when it is already on that page.
    private void openFromNotification(Intent intent) {
        if (intent == null || getBridge() == null) return;
        Uri data = intent.getData();
        if (data == null
                || !"com.spup.app".equals(data.getScheme())
                || !"open".equals(data.getHost())) return;

        String path = data.getQueryParameter("path");
        // Only pages on our own site - never another address.
        if (path == null || !path.startsWith("/") || path.startsWith("//")) return;

        final String target = SITE_ORIGIN + path;
        final WebView webView = getBridge().getWebView();
        webView.post(() -> webView.loadUrl(target));
    }

    // If another plugin swaps the WebViewClient after startup, our offline handling
    // would silently stop working - put it back.
    @Override
    public void onResume() {
        super.onResume();
        if (offlineClient != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            WebView wv = getBridge().getWebView();
            if (wv.getWebViewClient() != offlineClient) {
                wv.setWebViewClient(offlineClient);
            }
        }
    }

    /** Exposed to the web app as window.SpupNative. */
    private class OfflineBridge {
        @JavascriptInterface
        public void show(final String url) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    showOfflinePage(getBridge().getWebView(), siteUrlOrDefault(url));
                }
            });
        }

        /**
         * Saves a photo or video into the phone's gallery (Pictures/Spup or Movies/Spup)
         * without leaving the app. Used by the "Save image / Save video" option in the
         * media viewers (src/lib/save-media.ts).
         *
         * Returns true when the save was started; the outcome arrives afterwards as a
         * "spup:media-saved" event on window with detail { id, ok }. Returns false when
         * this phone or URL isn't supported (Android 9 and older, or a URL that isn't
         * https://cdn.spup.live/... or Cloudinary) - the web app then falls back to downloading
         * through the system browser.
         */
        @JavascriptInterface
        public boolean saveMedia(final String url, final String kind, final String requestId) {
            // MediaStore lets an app add its own files with no storage permission from
            // Android 10 (API 29). Older phones would need a runtime permission - they
            // use the browser download instead.
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q || !isMediaUrl(url)) return false;
            final boolean video = "video".equals(kind);
            new Thread(() -> reportMediaSaved(requestId, saveToGallery(url, video)), "spup-save-media").start();
            return true;
        }
    }

    // Only our own media hosts (what posts and chats use) can be saved through the
    // bridge, so a page can't make the app download arbitrary files. cdn.spup.live is
    // the bunny.net CDN; res.cloudinary.com stays for old posts until they are migrated.
    private static final String[] MEDIA_HOSTS = { "cdn.spup.live", "res.cloudinary.com" };

    private boolean isMediaUrl(String url) {
        try {
            Uri u = Uri.parse(url);
            if (!"https".equals(u.getScheme()) || u.getHost() == null) return false;
            for (String host : MEDIA_HOSTS) {
                if (host.equals(u.getHost())) return true;
            }
            return false;
        } catch (Exception e) {
            return false;
        }
    }

    // Downloads the file and adds it to the shared Pictures / Movies collection, so it
    // shows up in the Gallery app straight away (album "Spup"). Runs off the UI thread.
    // The item is marked pending while it is being written, and removed again if the
    // download fails, so a half-written file never appears in the gallery.
    @androidx.annotation.RequiresApi(Build.VERSION_CODES.Q)
    private boolean saveToGallery(String url, boolean video) {
        ContentResolver resolver = getContentResolver();
        Uri item = null;
        HttpURLConnection conn = null;
        try {
            conn = (HttpURLConnection) new URL(url).openConnection();
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(30000);
            if (conn.getResponseCode() != HttpURLConnection.HTTP_OK) {
                throw new IOException("HTTP " + conn.getResponseCode());
            }

            String mime = conn.getContentType();
            if (mime != null) {
                int semicolon = mime.indexOf(';');
                if (semicolon >= 0) mime = mime.substring(0, semicolon);
                mime = mime.trim().toLowerCase(Locale.ROOT);
            }
            if (mime == null || !mime.startsWith(video ? "video/" : "image/")) {
                throw new IOException("Unexpected content type: " + mime);
            }
            String ext = MimeTypeMap.getSingleton().getExtensionFromMimeType(mime);
            if (ext == null) ext = video ? "mp4" : "jpg";

            ContentValues values = new ContentValues();
            values.put(MediaStore.MediaColumns.DISPLAY_NAME, "spup-" + System.currentTimeMillis() + "." + ext);
            values.put(MediaStore.MediaColumns.MIME_TYPE, mime);
            values.put(MediaStore.MediaColumns.RELATIVE_PATH,
                    (video ? Environment.DIRECTORY_MOVIES : Environment.DIRECTORY_PICTURES) + "/Spup");
            values.put(MediaStore.MediaColumns.IS_PENDING, 1);

            Uri collection = video
                    ? MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
                    : MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);
            item = resolver.insert(collection, values);
            if (item == null) throw new IOException("MediaStore insert failed");

            try (InputStream in = conn.getInputStream(); OutputStream out = resolver.openOutputStream(item)) {
                if (out == null) throw new IOException("Could not open output stream");
                byte[] buf = new byte[64 * 1024];
                int n;
                while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            }

            ContentValues done = new ContentValues();
            done.put(MediaStore.MediaColumns.IS_PENDING, 0);
            resolver.update(item, done, null, null);
            return true;
        } catch (Exception e) {
            Log.w("SpupSaveMedia", "Save to gallery failed", e);
            if (item != null) {
                try { resolver.delete(item, null, null); } catch (Exception ignored) { }
            }
            return false;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    // Tells the page how the save went (window event "spup:media-saved"). The id is the
    // one the page generated; it is stripped to safe characters before going into script.
    private void reportMediaSaved(String requestId, boolean ok) {
        final String id = requestId == null ? "" : requestId.replaceAll("[^A-Za-z0-9_-]", "");
        final String js = "window.dispatchEvent(new CustomEvent('spup:media-saved',{detail:{id:'" + id + "',ok:" + ok + "}}))";
        runOnUiThread(() -> {
            try {
                getBridge().getWebView().evaluateJavascript(js, null);
            } catch (Exception ignored) { }
        });
    }

    // Only ever hand spup.live URLs on to the offline page; anything else -> home.
    private String siteUrlOrDefault(String url) {
        try {
            Uri u = Uri.parse(url);
            String host = u.getHost();
            if ("https".equals(u.getScheme()) && host != null
                    && (host.equals("spup.live") || host.endsWith(".spup.live"))) {
                return url;
            }
        } catch (Exception ignored) { }
        return SITE_URL;
    }

    // Loads the bundled offline page. Posted rather than loaded directly: loading from
    // inside onReceivedError (or straight after Capacitor's own first load) can lose to
    // the error page the WebView is about to show. The failed URL rides along as ?u= (in
    // the base URL, which is what the page sees as its location).
    private void showOfflinePage(final WebView view, String failedUrl) {
        final String baseUrl = OFFLINE_BASE + "?u=" + Uri.encode(failedUrl);
        String html = readAsset(OFFLINE_ASSET);
        if (html == null) {
            html = FALLBACK_HTML;
        }
        final String page = html;
        view.post(new Runnable() {
            @Override
            public void run() {
                view.loadDataWithBaseURL(baseUrl, page, "text/html", "UTF-8", null);
            }
        });
    }

    private String readAsset(String name) {
        try (InputStream in = getAssets().open(name);
             ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buf = new byte[4096];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            return out.toString("UTF-8");
        } catch (Exception e) {
            return null;
        }
    }

    // True when the phone has a network that claims internet access. (Wi-Fi with no
    // actual internet still counts as true - the load-failure trigger covers that.)
    private boolean hasInternetTransport() {
        try {
            ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm == null) return true;               // can't tell - let the load decide
            Network active = cm.getActiveNetwork();
            if (active == null) return false;
            NetworkCapabilities caps = cm.getNetworkCapabilities(active);
            return caps != null && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
        } catch (Exception e) {
            return true;
        }
    }

    // Hands Google's sign-in result to the social-login plugin (from its setup guide).
    @Override
    public void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);

        if (requestCode >= GoogleProvider.REQUEST_AUTHORIZE_GOOGLE_MIN
                && requestCode < GoogleProvider.REQUEST_AUTHORIZE_GOOGLE_MAX) {
            PluginHandle pluginHandle = getBridge().getPlugin("SocialLogin");
            if (pluginHandle == null) {
                Log.i("Google Activity Result", "SocialLogin login handle is null");
                return;
            }
            Plugin plugin = pluginHandle.getInstance();
            if (!(plugin instanceof SocialLoginPlugin)) {
                Log.i("Google Activity Result", "SocialLogin plugin instance is not SocialLoginPlugin");
                return;
            }
            ((SocialLoginPlugin) plugin).handleGoogleLoginIntent(requestCode, data);
        }
    }

    // Required by the interface; never called.
    @Override
    public void IHaveModifiedTheMainActivityForTheUseWithSocialLoginPlugin() {}

    // WebView keeps newly-set cookies (the login session, the sign-in cookie)
    // in memory and writes them to disk later. If Android kills the app first -
    // common on Samsung phones while another app is in front - they are lost.
    // Flushing whenever the app leaves the screen makes that safe.
    @Override
    public void onPause() {
        super.onPause();
        CookieManager.getInstance().flush();
    }
}