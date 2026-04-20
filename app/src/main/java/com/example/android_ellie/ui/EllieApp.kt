package com.example.android_ellie.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Api
import androidx.compose.material.icons.filled.DataObject
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.example.android_ellie.server.DeviceState
import com.example.android_ellie.server.ServerFunction
import com.example.android_ellie.server.ServerViewModel
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

enum class BottomTab {
    STATE,
    FUNCTIONS
}

@Composable
fun EllieApp(
    viewModel: ServerViewModel
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    var currentTab by rememberSaveable { mutableStateOf(BottomTab.STATE) }
    val json = remember {
        Json {
            prettyPrint = true
            encodeDefaults = true
        }
    }

    Scaffold(
        modifier = Modifier.fillMaxSize(),
        bottomBar = {
            NavigationBar {
                NavigationBarItem(
                    selected = currentTab == BottomTab.STATE,
                    onClick = { currentTab = BottomTab.STATE },
                    icon = { Icon(Icons.Default.DataObject, contentDescription = "状態") },
                    label = { Text("状態") }
                )
                NavigationBarItem(
                    selected = uiState.isServerRunning,
                    onClick = { viewModel.toggleServer() },
                    icon = {
                        Icon(
                            if (uiState.isServerRunning) Icons.Default.Stop else Icons.Default.PlayArrow,
                            contentDescription = if (uiState.isServerRunning) "停止" else "起動"
                        )
                    },
                    label = { Text(if (uiState.isServerRunning) "停止" else "起動") }
                )
                NavigationBarItem(
                    selected = currentTab == BottomTab.FUNCTIONS,
                    onClick = { currentTab = BottomTab.FUNCTIONS },
                    icon = { Icon(Icons.Default.Api, contentDescription = "関数") },
                    label = { Text("関数") }
                )
            }
        }
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            StatusCard(
                isRunning = uiState.isServerRunning,
                host = uiState.serverHost,
                port = uiState.serverPort,
                error = uiState.errorMessage
            )

            when (currentTab) {
                BottomTab.STATE -> StateScreen(
                    latestState = uiState.latestState,
                    json = json
                )
                BottomTab.FUNCTIONS -> FunctionsScreen()
            }

            Spacer(modifier = Modifier.height(8.dp))

            Button(
                onClick = { viewModel.refreshNow() },
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("今すぐ再取得")
            }
        }
    }
}

@Composable
private fun StatusCard(
    isRunning: Boolean,
    host: String,
    port: Int,
    error: String?
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors()
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            Text(
                text = if (isRunning) "サーバー起動中" else "サーバー停止中",
                style = MaterialTheme.typography.titleMedium
            )
            Text(text = "http://$host:$port")
            if (error != null) {
                Text(text = error, color = MaterialTheme.colorScheme.error)
            }
        }
    }
}

@Composable
private fun ColumnScope.StateScreen(
    latestState: DeviceState?,
    json: Json
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .weight(1f),
        colors = CardDefaults.cardColors()
    ) {
        Column(
            modifier = Modifier
                .padding(16.dp)
                .verticalScroll(rememberScrollState())
        ) {
            Text(
                text = "端末状態",
                style = MaterialTheme.typography.titleMedium
            )
            Spacer(modifier = Modifier.height(12.dp))
            Text(
                text = latestState?.let { json.encodeToString(it) } ?: "まだ取得されていません",
                style = MaterialTheme.typography.bodySmall
            )
        }
    }
}

@Composable
private fun ColumnScope.FunctionsScreen() {
    val functions = remember {
        listOf(
            ServerFunction("refresh_state", "POST", "/refresh", "端末状態を再収集して返す"),
            ServerFunction("get_state", "GET", "/state", "端末状態を取得する"),
            ServerFunction("health", "GET", "/health", "サーバー稼働確認")
        )
    }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .weight(1f)
    ) {
        Column(
            modifier = Modifier
                .padding(16.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Text(
                text = "AIが使える関数",
                style = MaterialTheme.typography.titleMedium
            )
            functions.forEach {
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(12.dp)) {
                        Text(it.name)
                        Text("${it.method} ${it.path}")
                        Text(it.description)
                    }
                }
            }
            Text(
                text = "通知やアクセシビリティ由来のデータはこの実装には含めていません。",
                style = MaterialTheme.typography.bodySmall
            )
        }
    }
}