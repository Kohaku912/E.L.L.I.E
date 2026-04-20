package com.example.android_ellie.server

import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.serialization.kotlinx.json.json
import io.ktor.server.application.ApplicationCall
import io.ktor.server.application.call
import io.ktor.server.application.install
import io.ktor.server.engine.EmbeddedServer
import io.ktor.server.engine.embeddedServer
import io.ktor.server.cio.CIO
import io.ktor.server.plugins.contentnegotiation.ContentNegotiation
import io.ktor.server.request.receiveText
import io.ktor.server.response.respond
import io.ktor.server.response.respondText
import io.ktor.server.routing.delete
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.routing
import kotlinx.serialization.json.Json

class DeviceHttpServer(
    private val collector: DeviceStateCollector
) {
    private var server: EmbeddedServer<*, *>? = null

    val isRunning: Boolean
        get() = server != null

    fun start(host: String = "127.0.0.1", port: Int = 8080) {
        if (server != null) return

        server = embeddedServer(CIO, host = host, port = port) {
            install(ContentNegotiation) {
                json(Json {
                    prettyPrint = true
                    encodeDefaults = true
                    ignoreUnknownKeys = true
                })
            }

            routing {
                get("/health") {
                    call.respond(
                        HealthResponse(
                            ok = true,
                            running = true
                        )
                    )
                }

                get("/state") {
                    call.respond(collector.collect())
                }

                get("/functions") {
                    call.respond(defaultFunctions())
                }

                post("/refresh") {
                    call.respond(collector.collect())
                }

                delete("/server") {
                    call.respondText("stop from app ui", ContentType.Text.Plain, HttpStatusCode.MethodNotAllowed)
                }
            }
        }.also {
            it.start(false)
        }
    }

    fun stop() {
        server?.stop(1000, 2000)
        server = null
    }

    private fun defaultFunctions(): List<ServerFunction> = listOf(
        ServerFunction(
            name = "refresh_state",
            method = "POST",
            path = "/refresh",
            description = "端末状態を再収集して返す"
        ),
        ServerFunction(
            name = "get_state",
            method = "GET",
            path = "/state",
            description = "現在の端末状態を取得する"
        ),
        ServerFunction(
            name = "health",
            method = "GET",
            path = "/health",
            description = "サーバーが動いているか確認する"
        )
    )
}