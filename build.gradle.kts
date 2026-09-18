val ktor_version: String by project
val logback_version: String by project

plugins {
    kotlin("multiplatform") version "2.1.0"
    id("org.jetbrains.kotlin.plugin.serialization") version "2.1.0"
    id("com.github.johnrengelman.shadow") version "8.1.1"
    application
}

group = "de.mw"
version = "0.0.1"

repositories {
    mavenCentral()
}

kotlin {
    jvm {
        compilations.all { kotlinOptions.jvmTarget = "21" }
    }

    // The rules compile to the browser too, so solo play needs no server at all —
    // see `SoloTable.kt`. One engine, two targets; a rule can only be changed in one
    // place.
    js(IR) {
        browser {
            // There are no browser tests, and the task launches Chrome — which a
            // build container does not have. `tools/solo-session.mjs` covers the
            // bundle instead, in Node.
            testTask { enabled = false }
            webpackTask {
                mainOutputFileName.set("engine.js")
                output.library = "BJEngine"
            }
        }
        binaries.executable()
    }

    sourceSets {
        val commonMain by getting {
            dependencies {
                implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.3")
                implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.9.0")
            }
        }
        val commonTest by getting {
            dependencies {
                implementation(kotlin("test"))
            }
        }
        val jvmMain by getting {
            dependencies {
                implementation("io.ktor:ktor-server-core-jvm:$ktor_version")
                implementation("io.ktor:ktor-server-netty-jvm:$ktor_version")
                implementation("io.ktor:ktor-server-html-builder-jvm:$ktor_version")
                implementation("org.jetbrains.kotlinx:kotlinx-html-jvm:0.11.0")
                implementation("io.ktor:ktor-server-content-negotiation-jvm:$ktor_version")
                implementation("io.ktor:ktor-serialization-kotlinx-json-jvm:$ktor_version")
                implementation("io.ktor:ktor-server-sessions:$ktor_version")
                implementation("io.ktor:ktor-server-status-pages-jvm:$ktor_version")
                implementation("io.ktor:ktor-server-compression-jvm:$ktor_version")
                implementation("io.ktor:ktor-server-call-logging-jvm:$ktor_version")
                implementation("ch.qos.logback:logback-classic:$logback_version")
            }
        }
        val jvmTest by getting {
            dependencies {
                implementation(kotlin("test-junit5"))
                implementation("io.ktor:ktor-server-test-host-jvm:$ktor_version")
            }
        }
    }
}

application {
    mainClass.set("de.mw.blackjack.ApplicationKt")
    applicationDefaultJvmArgs = listOf("-Djava.awt.headless=true")
}

// The browser bundle is a resource of the server, so it has to exist before the jar
// is packed. Nothing else keeps the two in step.
val copyEngine by tasks.registering(Copy::class) {
    dependsOn(tasks.named("jsBrowserProductionWebpack"))
    from(layout.buildDirectory.dir("kotlin-webpack/js/productionExecutable")) {
        include("engine.js")
    }
    into(layout.projectDirectory.dir("src/jvmMain/resources/static/vendor"))
}

tasks.named("jvmProcessResources") { dependsOn(copyEngine) }

tasks.named<Test>("jvmTest") {
    useJUnitPlatform()
}

tasks.named<com.github.jengelman.gradle.plugins.shadow.tasks.ShadowJar>("shadowJar") {
    archiveBaseName.set("de.mw.blackjack")
    archiveClassifier.set("all")
    archiveVersion.set("")
    manifest { attributes["Main-Class"] = "de.mw.blackjack.ApplicationKt" }
    from(kotlin.jvm().compilations.getByName("main").output)
    configurations = listOf(
        project.configurations.getByName("jvmRuntimeClasspath"),
    )
    mergeServiceFiles()
}

tasks.named("build") { dependsOn(tasks.named("shadowJar")) }
