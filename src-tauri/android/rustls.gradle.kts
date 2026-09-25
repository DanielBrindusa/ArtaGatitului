import groovy.json.JsonSlurper

// Resolve the Kotlin verifier shipped with the exact version in Cargo.lock.
val metadata = providers.exec {
    workingDir(project.file("../../.."))
    commandLine("cargo", "metadata", "--format-version", "1", "--locked", "--offline",
        "--filter-platform", "aarch64-linux-android")
}.standardOutput.asText.get()
val packages = (JsonSlurper().parseText(metadata) as Map<*, *>)["packages"] as List<*>
val verifier = packages.map { it as Map<*, *> }
    .single { it["name"] == "rustls-platform-verifier-android" }
val manifest = file(verifier["manifest_path"] as String)

repositories {
    maven {
        url = uri(manifest.parentFile.resolve("maven"))
        metadataSources { mavenPom(); artifact() }
        content { includeModule("rustls", "rustls-platform-verifier") }
    }
}

dependencies {
    add("implementation", "rustls:rustls-platform-verifier:${verifier["version"]}")
}
