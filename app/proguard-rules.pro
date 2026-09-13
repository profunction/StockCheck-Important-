# Firestore maps documents onto these model classes reflectively, so their
# constructors and field names must survive shrinking.
-keep class com.stockcheck.app.model.** { *; }
-keepattributes Signature
-keepattributes *Annotation*
