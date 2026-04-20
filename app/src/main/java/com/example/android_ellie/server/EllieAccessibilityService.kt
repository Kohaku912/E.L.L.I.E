package com.example.android_ellie.server

import android.accessibilityservice.AccessibilityService
import android.graphics.Rect
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo

class EllieAccessibilityService : AccessibilityService() {

    override fun onAccessibilityEvent(event: AccessibilityEvent) {
        lastEvent = AccessibilityInfo(
            packageName = event.packageName?.toString(),
            className = event.className?.toString(),
            text = event.text?.joinToString(", "),
            contentDescription = event.contentDescription?.toString(),
            windowTitle = null,
            isFocused = true,
            isScrollable = event.isScrollable,
            bounds = null,
            nodeHierarchy = captureHierarchy(rootInActiveWindow)
        )
    }

    override fun onInterrupt() {}

    private fun captureHierarchy(node: AccessibilityNodeInfo?): List<com.example.android_ellie.server.AccessibilityNodeInfo>? {
        if (node == null) return null
        val result = mutableListOf<com.example.android_ellie.server.AccessibilityNodeInfo>()
        traverse(node, result)
        return result
    }

    private fun traverse(node: AccessibilityNodeInfo, list: MutableList<com.example.android_ellie.server.AccessibilityNodeInfo>) {
        val bounds = Rect()
        node.getBoundsInScreen(bounds)
        list.add(
            com.example.android_ellie.server.AccessibilityNodeInfo(
                text = node.text?.toString(),
                contentDescription = node.contentDescription?.toString(),
                className = node.className?.toString(),
                packageName = node.packageName?.toString(),
                bounds = bounds.toShortString(),
                isClickable = node.isClickable,
                isEditable = node.isEditable,
                isPassword = node.isPassword
            )
        )
        for (i in 0 until node.childCount) {
            node.getChild(i)?.let { traverse(it, list) }
        }
    }

    companion object {
        var lastEvent: AccessibilityInfo? = null
    }
}
