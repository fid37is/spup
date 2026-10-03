package com.spup.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.BitmapShader;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Shader;
import android.net.Uri;
import android.os.Build;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;

import com.capacitorjs.plugins.pushnotifications.MessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Map;

/**
 * Builds Spup's notifications ourselves so they can show the sender's avatar
 * and a preview of the post, like X does.
 *
 * Why: when an FCM message carries a "notification" block, Android draws a
 * plain title + text whenever the app is in the background and gives us no
 * chance to add a picture. The server (src/lib/push/fcm.ts) therefore sends
 * DATA-ONLY messages, and this service - which Android always calls for them -
 * does the drawing.
 *
 * Extends Capacitor's own MessagingService, so token refreshes and any
 * message that isn't ours (no spup=1 flag) still go through Capacitor's
 * normal path. The plugin's own service entry is removed in the manifest so
 * only this one receives FCM events.
 *
 * Tapping a notification opens com.spup.app://open?path=<route>, which
 * NativeBootstrap (website code) turns into an in-app navigation.
 */
public class SpupMessagingService extends MessagingService {

    // Must match the channel created in src/hooks/use-push-notifications.ts.
    private static final String CHANNEL_ID = "spup_default";
    private static final int AVATAR_PX = 192;

    @Override
    public void onMessageReceived(@NonNull RemoteMessage message) {
        Map<String, String> data = message.getData();
        if (!"1".equals(data.get("spup"))) {
            super.onMessageReceived(message);
            return;
        }
        try {
            show(data);
        } catch (Exception ignored) {
            // A notification problem must never crash the app.
        }
    }

    private void show(Map<String, String> data) {
        // Android 13+ needs the runtime permission the user granted in the app.
        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission("android.permission.POST_NOTIFICATIONS")
                        != PackageManager.PERMISSION_GRANTED) {
            return;
        }

        String title = valueOr(data.get("title"), "Spup");
        String body = valueOr(data.get("body"), "");
        String path = valueOr(data.get("path"), "/notifications");
        String type = valueOr(data.get("type"), "");
        String entityId = valueOr(data.get("entityId"), "");

        ensureChannel();

        Intent intent = new Intent(
                Intent.ACTION_VIEW,
                Uri.parse("com.spup.app://open?path=" + Uri.encode(path)));
        intent.setPackage(getPackageName());
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK
                | Intent.FLAG_ACTIVITY_CLEAR_TOP
                | Intent.FLAG_ACTIVITY_SINGLE_TOP);

        // Same type + entity = same notification slot: a second chat message
        // in one conversation replaces the first instead of stacking.
        int id = (type + ":" + entityId).hashCode();

        PendingIntent pending = PendingIntent.getActivity(
                this, id, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(smallIcon())
                .setColor(Color.parseColor("#1A9E5F"))
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                .setContentIntent(pending)
                .setAutoCancel(true)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_SOCIAL)
                .setDefaults(NotificationCompat.DEFAULT_ALL)
                .setShowWhen(true)
                .setWhen(System.currentTimeMillis());

        Bitmap avatar = fetchAvatar(data.get("avatarUrl"));
        if (avatar != null) builder.setLargeIcon(avatar);

        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm != null) nm.notify(id, builder.build());
    }

    /** ic_stat_spup if you've added one (Image Asset > Notification Icons), else the launcher icon. */
    private int smallIcon() {
        int res = getResources().getIdentifier("ic_stat_spup", "drawable", getPackageName());
        return res != 0 ? res : getApplicationInfo().icon;
    }

    private void ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm == null || nm.getNotificationChannel(CHANNEL_ID) != null) return;
        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID, "Activity", NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription("Messages, likes, follows, payments and other activity");
        channel.enableVibration(true);
        nm.createNotificationChannel(channel);
    }

    /** Downloads and circle-crops the sender's avatar. Returns null on any problem. */
    private Bitmap fetchAvatar(String url) {
        if (url == null || !url.startsWith("https://")) return null;
        HttpURLConnection conn = null;
        try {
            conn = (HttpURLConnection) new URL(url).openConnection();
            conn.setConnectTimeout(4000);
            conn.setReadTimeout(4000);
            conn.setInstanceFollowRedirects(true);
            if (conn.getResponseCode() != HttpURLConnection.HTTP_OK) return null;
            try (InputStream in = conn.getInputStream()) {
                Bitmap source = BitmapFactory.decodeStream(in);
                return source == null ? null : circle(source);
            }
        } catch (Exception e) {
            return null;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private Bitmap circle(Bitmap source) {
        int side = Math.min(source.getWidth(), source.getHeight());
        Bitmap square = Bitmap.createBitmap(
                source, (source.getWidth() - side) / 2, (source.getHeight() - side) / 2, side, side);
        Bitmap scaled = Bitmap.createScaledBitmap(square, AVATAR_PX, AVATAR_PX, true);

        Bitmap output = Bitmap.createBitmap(AVATAR_PX, AVATAR_PX, Bitmap.Config.ARGB_8888);
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        paint.setShader(new BitmapShader(scaled, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP));
        new Canvas(output).drawCircle(AVATAR_PX / 2f, AVATAR_PX / 2f, AVATAR_PX / 2f, paint);
        return output;
    }

    private static String valueOr(String value, String fallback) {
        return (value == null || value.isEmpty()) ? fallback : value;
    }
}
