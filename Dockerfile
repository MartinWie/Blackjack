# syntax=docker/dockerfile:1

# Stage 1 — the stylesheet. Tailwind scans the Kotlin sources for class names, so the
# .kt files have to be here too; output.css is generated, never committed.
FROM node:20-alpine AS css
WORKDIR /app
COPY package.json tailwind.config.js ./
RUN npm install --silent --no-audit --no-fund
COPY src ./src
RUN npx tailwindcss --minify -i ./src/main/resources/static/input.css \
                    -o ./src/main/resources/static/output.css

# Stage 2 — the jar.
FROM amazoncorretto:21-alpine AS build
WORKDIR /app
COPY gradle ./gradle
COPY gradlew gradle.properties settings.gradle.kts build.gradle.kts ./
COPY src ./src
COPY --from=css /app/src/main/resources/static/output.css ./src/main/resources/static/output.css
RUN chmod +x ./gradlew && ./gradlew build -x test --no-daemon

# Stage 3 — what actually ships: a JRE and one jar, no Gradle, no node_modules.
FROM amazoncorretto:21-alpine
WORKDIR /app
RUN apk add --no-cache curl

COPY --from=build /app/build/libs/de.mw.blackjack-all.jar ./blackjack.jar

# Fixed at image build time on purpose. `BuildInfo` otherwise derives it from the
# clock, so every restart would rename every asset URL and every client would
# re-download the app for no reason.
ARG BUILD_ID=docker
ENV BJ_BUILD_ID=$BUILD_ID
ENV APP_PORT=8090

# Memory, for a process meant to stay up for months on a small box:
#   MaxRAMPercentage  the JVM defaults to a quarter of the container; this app is the
#                     only thing in it.
#   SerialGC          one collector thread and the smallest footprint of the lot. The
#                     heap here is a few tens of MB — there is nothing for a parallel
#                     collector to earn back.
#   Netty unpooled    the pooled allocator reserves arenas per core and never gives
#                     them back. At this traffic the pool is all reservation.
#   Metaspace/direct  ceilings, so a leak in either shows up as an error rather than
#                     as the kernel killing the container.
ENV JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=70 -XX:+UseSerialGC -XX:MaxMetaspaceSize=128m -XX:MaxDirectMemorySize=128m -Dio.netty.allocator.type=unpooled"


# Rooms and their SSE subscribers live in this process's memory. Run ONE replica:
# a second one is a second set of tables that cannot see the first, and no amount of
# sticky sessions fixes a player joining a table code that exists on the other node.
EXPOSE 8090
HEALTHCHECK --interval=20s --timeout=5s --retries=3 CMD curl -f http://localhost:8090/health || exit 1

CMD ["java", "-jar", "/app/blackjack.jar"]
