#!/usr/bin/env bash
# ----------------------------------------------------------------------
# Linalysis API build script — plain javac, no Maven/Gradle/Ant.
#
# Output: dist/linalysis-api.war  — drop into $CATALINA_HOME/webapps/
#
# Requires:
#   - Java 17+ on PATH (javac + jar)
#   - JARs in web/WEB-INF/lib/ (mysql-connector-j, org.json, jakarta.servlet-api)
# ----------------------------------------------------------------------

set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
SRC="$ROOT/src"
WEB="$ROOT/web"
LIB="$WEB/WEB-INF/lib"
CLASSES="$WEB/WEB-INF/classes"
DIST="$ROOT/dist"
WAR_NAME="linalysis-api.war"

# ----------------------------------------------------------------------
# 1. Verify JARs exist. If any missing, print exact download URL and exit.
# ----------------------------------------------------------------------
REQUIRED_JARS=(
  "mysql-connector-j-*.jar|https://dev.mysql.com/downloads/connector/j/|MySQL JDBC driver"
  "json-*.jar|https://repo1.maven.org/maven2/org/json/json/20240303/json-20240303.jar|org.json parser"
  "jakarta.servlet-api-*.jar|https://repo1.maven.org/maven2/jakarta/servlet/jakarta.servlet-api/6.0.0/jakarta.servlet-api-6.0.0.jar|Jakarta Servlet API (Tomcat 10+ provides this at runtime; only needed for compile)"
)

mkdir -p "$LIB" "$CLASSES" "$DIST"

missing=0
for entry in "${REQUIRED_JARS[@]}"; do
  IFS='|' read -r pattern url desc <<< "$entry"
  if ! ls "$LIB"/$pattern >/dev/null 2>&1; then
    echo "  MISSING: $LIB/$pattern"
    echo "  → Download: $url"
    echo "  → Purpose: $desc"
    echo ""
    missing=$((missing+1))
  fi
done

if [ "$missing" -gt 0 ]; then
  echo "Download the $missing missing JAR(s) into $LIB/ and re-run $0"
  exit 1
fi

# ----------------------------------------------------------------------
# 2. Compile. Classpath = all JARs in WEB-INF/lib.
# ----------------------------------------------------------------------
CP="$(find "$LIB" -name '*.jar' | tr '\n' ':')"
echo "Compiling..."
find "$SRC" -name '*.java' > /tmp/linalysis-sources.txt
javac -d "$CLASSES" -cp "$CP" -encoding UTF-8 @/tmp/linalysis-sources.txt
rm /tmp/linalysis-sources.txt

# ----------------------------------------------------------------------
# 3. Assemble WAR.
#    Structure inside the WAR:
#      WEB-INF/web.xml
#      WEB-INF/classes/**/*.class
#      WEB-INF/classes/linalysis.properties  (if present)
#      WEB-INF/lib/*.jar  (minus jakarta.servlet-api — Tomcat provides it)
# ----------------------------------------------------------------------
echo "Assembling WAR..."
cd "$WEB"

# Copy lib → staging, excluding the servlet API (Tomcat provides it)
STAGE_LIB="$(mktemp -d)/lib"
mkdir -p "$STAGE_LIB"
for jar in "$LIB"/*.jar; do
  name="$(basename "$jar")"
  case "$name" in
    jakarta.servlet-api-*) ;;    # skip
    *) cp "$jar" "$STAGE_LIB/" ;;
  esac
done

# Build the WAR
jar cf "$DIST/$WAR_NAME" \
  WEB-INF/web.xml \
  WEB-INF/classes

# Add runtime libs (not the servlet API)
cd "$STAGE_LIB/.."
jar uf "$DIST/$WAR_NAME" lib
mv "$DIST/$WAR_NAME" "$DIST/tmp.war"
mkdir -p "$DIST/_extract" && cd "$DIST/_extract" && jar xf "$DIST/tmp.war" && mkdir -p WEB-INF && mv ../lib WEB-INF/ 2>/dev/null || true
cd "$DIST/_extract" && jar cf "$DIST/$WAR_NAME" .
rm -rf "$DIST/_extract" "$DIST/tmp.war"

echo ""
echo "✓ Built: $DIST/$WAR_NAME  ($(du -h "$DIST/$WAR_NAME" | cut -f1))"
echo ""
echo "Deploy:"
echo "  cp $DIST/$WAR_NAME \$CATALINA_HOME/webapps/"
echo "  \$CATALINA_HOME/bin/catalina.sh restart   (or systemctl restart tomcat)"
echo ""
echo "Access:"
echo "  http://localhost:8080/linalysis-api/api/health"
