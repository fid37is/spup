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

    // The offline page lives in android/app/src/main/assets/ - NOT in assets/public/.
    // `npx cap sync` wipes and refills assets/public from mobile-www on every sync, so a
    // missing or stale copy there is easy to end up with (and leaves Android's own
    // "Webpage not available" showing). Android always allows file:///android_asset/
    // URLs, so this needs no sync and no Capacitor setting.
    private static final String OFFLINE_PAGE = "file:///android_asset/offline.html";
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

        debugToast("offline handler v2 installed");
        if (!hasInternetTransport()) {
            Log.i(TAG, "no active network at launch");
            debugToast("no network at launch -> offline page");
            showOfflinePage(bridge.getWebView(), SITE_URL);
        }
    }

    // Loads the bundled offline page. Posted rather than loaded directly: loading from
    // inside onReceivedError (or straight after Capacitor's own first load) can lose to
    // the error page the WebView is about to show.
    private void showOfflinePage(final WebView view, String failedUrl) {
        final String offlineUrl = OFFLINE_PAGE + "?u=" + Uri.encode(failedUrl);
        view.post(new Runnable() {
            @Override
            public void run() {
                Log.i(TAG, "showing offline page");
                view.loadUrl(offlineUrl);
            }
        });
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