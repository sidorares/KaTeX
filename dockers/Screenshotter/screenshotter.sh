#!/bin/bash

# This script does a one-shot creation of screenshots, creating needed
# docker containers and removing them afterwards.  During development,
# it might be desirable to avoid the overhead for starting and
# stopping the containers.  Developers are encouraged to manage
# suitable containers themselves, calling the screenshotter.js script
# directly.

# Sometimes the screenshotter may get stuck.  In that case,
# screenshot.js will exit with status 8.  We will try it again using
# the same container up to three times, and failing that will try
# creating containers up to three times.  In this sense, runSession
# will return zero if the snapshots could be concluded, even if one of
# them failed to verify.  Non-zero indicates a problem with the
# snapshotting process itself.

container=
status=0
args=("$@")

cleanup() {
    [[ "${container}" ]] \
        && docker stop "${container}" >/dev/null \
        && docker rm "${container}" >/dev/null
    container=
}

runSession() {
    node "$(dirname "$0")"/screenshotter.js \
        --browser="${browser}" --container="${container}" "${args[@]}"
    case $? in
        0)
            res="Done"
            return 0
            ;;
        8)
            # Killed by watchdog
            res="Giving up" # Won't be printed if we retry
            return 8
            ;;
        *)
            res="Failed"
            status=1
            return 0
            ;;
    esac
}

runContainer() {
    echo "Starting container for ${image}"
    container=$(docker run -d -P ${image})
    [[ ${container} ]] || exit 2
    echo "Container ${container:0:12} started, creating screenshots..."
    runSession || runSession || runSession
    ret=$?
    echo "${res} taking screenshots, stopping and removing ${container:0:12}"
    cleanup
    return ${ret}
}

runBrowser() {
    browser=${1}
    image=selenium/standalone-${1}:${2}
    runContainer || runContainer || runContainer || exit 2
}

trap cleanup EXIT

runBrowser firefox 2.48.2
runBrowser chrome 2.48.2

exit ${status}
