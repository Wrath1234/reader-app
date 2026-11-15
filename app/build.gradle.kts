plugins {
    id("com.android.application")
}

android {
    namespace = "app.reader.proto"
    compileSdk = 36

    defaultConfig {
        applicationId = "app.reader.proto"
        minSdk = 30
        targetSdk = 36
        versionCode = 1
        versionName = "0.1"
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    buildFeatures {
        buildConfig = false
    }
}
