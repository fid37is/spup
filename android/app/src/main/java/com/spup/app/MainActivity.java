package com.spup.app;

import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.os.Bundle;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.util.Log;
import android.webkit.CookieManager;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.widget.Toast;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;

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

    private static final String TAG = "SpupOffline";

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

    // TEMPORARY: shows small on-screen messages so you can see (without adb) that this
    // build is the one installed and which path fired. Set to false once it works.
    private static final boolean SHOW_OFFLINE_DEBUG = true;

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
        bridge.getWebView().setWebViewClient(new BridgeWebViewClient(bridge) {
            @Override
            public void onReceivedError(final WebView view, WebResourceRequest request, WebResourceError error) {
                super.onReceivedError(view, request, error);
                if (request == null || !request.isForMainFrame()) return;

                final String failedUrl = request.getUrl().toString();
                Log.w(TAG, "main-frame load failed: code=" + error.getErrorCode()
                        + " desc=" + error.getDescription() + " url=" + failedUrl);
                if (failedUrl.startsWith("file:///android_asset/")) return;

                debugToast("load failed (" + error.getErrorCode() + ") -> offline page");
                showOfflinePage(view, failedUrl);
            }
        });

        debugToast("offline handler v3 installed");
        final boolean online = hasInternetTransport();
        debugToast(online ? "network looks available at launch" : "no network at launch");
        if (!online) {
            Log.i(TAG, "no active network at launch");
            showOfflinePage(bridge.getWebView(), SITE_URL);
        }
    }

    // Loads the bundled offline page. Posted rather than loaded directly: loading from
    // inside onReceivedError (or straight after Capacitor's own first load) can lose to
    // the error page the WebView is about to show. The failed URL rides along as ?u= (in
    // the base URL, which is what the page sees as its location).
    private void showOfflinePage(final WebView view, String failedUrl) {
        final String baseUrl = OFFLINE_BASE + "?u=" + Uri.encode(failedUrl);
        String html = readAsset(OFFLINE_ASSET);
        if (html == null) {
            debugToast("assets/" + OFFLINE_ASSET + " NOT FOUND - using basic fallback page");
            html = FALLBACK_HTML;
        }
        final String page = html;
        view.post(new Runnable() {
            @Override
            public void run() {
                Log.i(TAG, "showing offline page");
                view.loadDataWithBaseURL(baseUrl, page, "text/html", "UTF-8", null);
                debugToast("offline page loaded");
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
            Log.w(TAG, "could not read asset " + name + ": " + e);
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
            Log.w(TAG, "network check failed: " + e);
            debugToast("network check failed: " + e.getClass().getSimpleName());
            return true;
        }
    }

    private void debugToast(final String msg) {
        if (!SHOW_OFFLINE_DEBUG) return;
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                Toast.makeText(MainActivity.this, "Spup: " + msg, Toast.LENGTH_LONG).show();
            }
        });
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