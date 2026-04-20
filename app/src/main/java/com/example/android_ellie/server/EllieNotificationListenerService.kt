package com.example.android_ellie.server

import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification

class EllieNotificationListenerService : NotificationListenerService() {

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        updateNotifications()
    }

    override fun onNotificationRemoved(sbn: StatusBarNotification) {
        updateNotifications()
    }

    override fun onListenerConnected() {
        updateNotifications()
    }

    private fun updateNotifications() {
        runCatching {
            lastNotifications = activeNotifications.map { sbn ->
                val extras = sbn.notification.extras
                NotificationInfo(
                    packageName = sbn.packageName,
                    title = extras.getCharSequence(android.app.Notification.EXTRA_TITLE)?.toString(),
                    text = extras.getCharSequence(android.app.Notification.EXTRA_TEXT)?.toString(),
                    subText = extras.getCharSequence(android.app.Notification.EXTRA_SUB_TEXT)?.toString(),
                    postTime = sbn.postTime,
                    isClearable = sbn.isClearable,
                    isOngoing = sbn.isOngoing
                )
            }
        }
    }

    companion object {
        var lastNotifications: List<NotificationInfo> = emptyList()
    }
}
