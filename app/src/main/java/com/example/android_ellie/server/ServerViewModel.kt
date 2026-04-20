package com.example.android_ellie.server

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class ServerUiState(
    val isServerRunning: Boolean = false,
    val latestState: DeviceState? = null,
    val errorMessage: String? = null,
    val serverHost: String = "127.0.0.1",
    val serverPort: Int = 8080,
)

class ServerViewModel(application: Application) : AndroidViewModel(application) {
    private val collector = DeviceStateCollector(application.applicationContext)
    private val httpServer = DeviceHttpServer(collector)

    private val _uiState = MutableStateFlow(ServerUiState())
    val uiState: StateFlow<ServerUiState> = _uiState.asStateFlow()

    private var pollingJob: Job? = null

    fun startServer() {
        runCatching {
            httpServer.start(
                host = _uiState.value.serverHost,
                port = _uiState.value.serverPort
            )
            _uiState.value = _uiState.value.copy(
                isServerRunning = true,
                errorMessage = null
            )
            startPolling()
        }.onFailure {
            _uiState.value = _uiState.value.copy(errorMessage = it.message)
        }
    }

    fun stopServer() {
        pollingJob?.cancel()
        pollingJob = null
        httpServer.stop()
        _uiState.value = _uiState.value.copy(isServerRunning = false)
    }

    fun toggleServer() {
        if (httpServer.isRunning) stopServer() else startServer()
    }

    fun refreshNow() {
        runCatching {
            val state = collector.collect()
            _uiState.value = _uiState.value.copy(
                latestState = state,
                errorMessage = null
            )
        }.onFailure {
            _uiState.value = _uiState.value.copy(errorMessage = it.message)
        }
    }

    private fun startPolling() {
        if (pollingJob?.isActive == true) return

        pollingJob = viewModelScope.launch {
            while (true) {
                if (!httpServer.isRunning) break
                refreshNow()
                delay(1000)
            }
        }
    }

    override fun onCleared() {
        stopServer()
        super.onCleared()
    }
}