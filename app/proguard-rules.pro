# R8 removes and renames whatever it cannot see being used. Firestore reaches
# for these by reflection, so nothing in the bytecode points at them and they
# are exactly what a shrinker deletes -- producing a release build that
# installs, launches, and then fails on the first read with an error that
# names none of this.

# --- app data model ------------------------------------------------------
# Field names are the document schema. Renaming one silently changes what the
# app writes, which a keep-class-members-only rule would allow.
-keep class com.stockcheck.app.model.** { *; }

# --- Firestore's own reflection -----------------------------------------
# It instantiates model classes through their no-arg constructor and matches
# document keys to property names.
-keepclassmembers class * {
    @com.google.firebase.firestore.PropertyName <methods>;
    @com.google.firebase.firestore.PropertyName <fields>;
    @com.google.firebase.firestore.DocumentId <methods>;
    @com.google.firebase.firestore.DocumentId <fields>;
}
-keepattributes Signature
-keepattributes *Annotation*
-keepattributes RuntimeVisibleAnnotations
-keepattributes RuntimeVisibleParameterAnnotations
-keepattributes AnnotationDefault

# Kotlin reflection reads this to recover generic and nullability information.
-keep class kotlin.Metadata { *; }

# --- zip4j ---------------------------------------------------------------
# The encrypted export bundle. Its AES implementation loads pieces by name.
-keep class net.lingala.zip4j.** { *; }
-dontwarn net.lingala.zip4j.**

# --- Guava / CameraX -----------------------------------------------------
# Pulled in for ListenableFuture; most of it is unused and warns loudly.
-dontwarn com.google.common.**
-dontwarn javax.annotation.**
-dontwarn javax.lang.model.**

# --- keep enough of a stack trace to be worth reading --------------------
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
