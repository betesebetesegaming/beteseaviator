BETESE Aviator — APK hosting folder
===================================

Put the built release APK here as:

    public/downloads/BeteseAviator.apk

It will then be served at:

    https://www.beteseaviator.com/downloads/BeteseAviator.apk

The "Download Android App" buttons across the site (homepage banner, floating
button, and the login modal) link to /downloads/BeteseAviator.apk.

How to produce the APK
----------------------
Build it from the Capacitor project at:
    C:\Users\Dell\Desktop\betese-aviator-android

  - Debug APK  : Android Studio → Build → Build APK(s)
  - Release APK: Android Studio → Generate Signed Bundle / APK → APK → release

Then copy app-release.apk here and rename it to BeteseAviator.apk.

To change the download filename/URL/version, edit:
    components/download-app/platform.ts  (APP_DOWNLOAD)
