# Bundled SEditor version

This app is copied as a managed runtime from the skill's `app/` release. The skill sync helper
updates only known runtime files and the version manifest; it leaves user schemas, launchers,
and unrelated files in `.SEditor/` untouched. Keep the runtime files from one SEditor release
and run `bash ../verify.sh` from the repository root after updating.
